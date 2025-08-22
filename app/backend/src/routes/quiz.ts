import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import OpenAI from 'openai';

export const quizRouter = Router();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const SYNONYMS: Record<string, string[]> = {
  usa: ['united states', 'united states of america', 'america'],
  nyc: ['new york', 'new york city'],
};

function normalizeSynonyms(text: string) {
  const t = (text || '').trim().toLowerCase();
  for (const [canon, list] of Object.entries(SYNONYMS)) {
    if (t === canon || list.includes(t)) return canon;
  }
  return t;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  return dp[m][n];
}

function similarity(a: string, b: string) {
  const dist = levenshtein(a, b);
  return 1 - dist / Math.max(a.length, b.length, 1);
}

const SessionReq = z.object({
  deckId: z.string().min(1),
  count: z.number().int().min(1).default(10),
  mode: z.enum(['Mixed', 'Weak', 'Due']).default('Mixed'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
const SessionReq = z.object({
  deckId: z.string().min(1),
  count: z.number().int().min(1).default(10),
  mode: z.enum(['Mixed', 'Weak', 'Due']).default('Mixed'),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  ratios: z.object({
    mcq: z.number().min(0).max(1).optional(),
    cloze: z.number().min(0).max(1).optional(),
    short: z.number().min(0).max(1).optional(),
  }).optional(),
});

// Fisher–Yates
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

type ColInfo = { name: string; type: string; notnull: number; dflt_value: any; pk: number };
function pragmaColumns(table: string): ColInfo[] {
  try { return db.prepare(`PRAGMA table_info(${table})`).all() as ColInfo[]; }
  catch { return []; }
}
function isTextType(t: string) {
  const T = (t || '').toUpperCase();
  return T.includes('CHAR') || T.includes('CLOB') || T.includes('TEXT');
}
function isNumericType(t: string) {
  const T = (t || '').toUpperCase();
  return T.includes('INT') || T.includes('REAL') || T.includes('NUM') || T.includes('DOUBLE') || T.includes('DECIMAL');
}

quizRouter.post('/session', (req, res) => {
  const parsed = SessionReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
const { deckId, count: requested, mode, difficulty, ratios } = parsed.data;


  const rows = db.prepare(`
      SELECT q.id, q.deckId, q.type, q.prompt, q.options, q.correct_answer, q.explanation, q.tags, q.difficulty,
             COALESCE(m.correctCount, 0) AS correctCount
      FROM Questions q
      LEFT JOIN Mastery m ON m.questionId = q.id
      WHERE q.deckId = ?
  `).all(deckId) as any[];

  let pool = rows;
  if (mode === 'Weak' || mode === 'Due') pool = rows.filter(r => Number(r.correctCount || 0) < 2);
  if (!pool.length) return res.json({ questions: [] });

  const buckets = {
    easy: shuffle(pool.filter(r => Number(r.difficulty || 3) <= 2)),
    medium: shuffle(pool.filter(r => Number(r.difficulty || 3) === 3)),
    hard: shuffle(pool.filter(r => Number(r.difficulty || 3) >= 4)),
  } as const;

  let selectedPool: any[];
  if (difficulty) {
    selectedPool = buckets[difficulty];
  } else {
    const wantEasy = Math.floor(requested / 3);
    const wantMed = Math.floor(requested / 3);
    const wantHard = requested - wantEasy - wantMed;
    selectedPool = [
      ...buckets.easy.slice(0, wantEasy),
      ...buckets.medium.slice(0, wantMed),
      ...buckets.hard.slice(0, wantHard),
    ];
    if (selectedPool.length < requested) {
      const leftovers = shuffle([
        ...buckets.easy.slice(wantEasy),
        ...buckets.medium.slice(wantMed),
        ...buckets.hard.slice(wantHard),
      ]);
      selectedPool = [
        ...selectedPool,
        ...leftovers.slice(0, requested - selectedPool.length),
      ];
    }
  }

  if (!selectedPool.length) return res.json({ questions: [] });

  const count = Math.max(1, Math.min(requested, selectedPool.length));
  const poolForTypes = selectedPool;
  const mcq = shuffle(poolForTypes.filter(r => r.type === 'MCQ'));
  const cloze = shuffle(poolForTypes.filter(r => r.type === 'CLOZE'));
  const short = shuffle(poolForTypes.filter(r => r.type === 'SHORT'));
  const take = <T,>(arr: T[], n: number) => arr.slice(0, Math.max(0, Math.min(n, arr.length)));

  const ratioMCQ = ratios?.mcq ?? 0.5;
  const ratioCloze = ratios?.cloze ?? 0.25;
  const ratioShort = ratios?.short ?? 0.25;
  const ratioSum = ratioMCQ + ratioCloze + ratioShort || 1;
  let wantMCQ = Math.floor(count * (ratioMCQ / ratioSum));
  let wantCloze = Math.floor(count * (ratioCloze / ratioSum));
  let wantShort = Math.floor(count * (ratioShort / ratioSum));
  const allocated = wantMCQ + wantCloze + wantShort;
  if (allocated < count) wantShort += count - allocated;

  let selected: any[] = [
    ...take(mcq, wantMCQ),
    ...take(cloze, wantCloze),
    ...take(short, wantShort),
  ];

  if (selected.length < count) {
    const chosen = new Set(selected.map(q => q.id));
    const leftovers = shuffle(poolForTypes.filter(q => !chosen.has(q.id)));
    selected = [...selected, ...leftovers.slice(0, count - selected.length)];
  }


  selected = shuffle(selected);

  const out = selected.slice(0, count).map(r => ({
    id: r.id,
    deckId: r.deckId,
    type: r.type as 'MCQ' | 'CLOZE' | 'SHORT',
    prompt: r.prompt,
    options: (() => { try { return JSON.parse(r.options || '{}'); } catch { return { a:'', b:'', c:'', d:'' }; } })(),
  }));
const SessionReq = z.object({
  deckId: z.string().min(1),
  count: z.number().int().min(1).default(10),
  mode: z.enum(['Mixed', 'Weak', 'Due']).default('Mixed'),
  ratios: z.object({
    mcq: z.number().min(0).max(1).optional(),
    cloze: z.number().min(0).max(1).optional(),
    short: z.number().min(0).max(1).optional(),
  }).optional(),
});

…

const { deckId, count: requested, mode, ratios } = parsed.data;

…

const mcq = shuffle(pool.filter(r => r.type === 'MCQ'));
const cloze = shuffle(pool.filter(r => r.type === 'CLOZE'));
const short = shuffle(pool.filter(r => r.type === 'SHORT'));
const take = <T,>(arr: T[], n: number) =>
  arr.slice(0, Math.max(0, Math.min(n, arr.length)));

const ratioMCQ = ratios?.mcq ?? 0.5;
const ratioCloze = ratios?.cloze ?? 0.25;
const ratioShort = ratios?.short ?? 0.25;
const ratioSum = ratioMCQ + ratioCloze + ratioShort || 1;
let wantMCQ = Math.floor(count * (ratioMCQ / ratioSum));
let wantCloze = Math.floor(count * (ratioCloze / ratioSum));
let wantShort = Math.floor(count * (ratioShort / ratioSum));
const allocated = wantMCQ + wantCloze + wantShort;
if (allocated < count) wantShort += count - allocated;

let selected: any[] = [
  ...take(mcq, wantMCQ),
  ...take(cloze, wantCloze),
  ...take(short, wantShort),
];

if (selected.length < count) {
  const chosen = new Set(selected.map(q => q.id));
  const leftovers = shuffle(pool.filter(q => !chosen.has(q.id)));
  selected = [
    ...selected,
    ...leftovers.slice(0, count - selected.length),
  ];
}

selected = shuffle(selected);


  res.json({ questions: out });
});

quizRouter.post('/submit', async (req, res) => {
  const body = z.object({
    questionId: z.string().min(1),
    userAnswer: z.string().optional().default(''),
  }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.message });

  try {
    const { questionId, userAnswer } = body.data;
    const row = db.prepare(`
      SELECT q.*, COALESCE(m.correctCount,0) as correctCount
      FROM Questions q
      LEFT JOIN Mastery m ON m.questionId = q.id
      WHERE q.id = ?
    `).get(questionId) as any;

    if (!row) return res.status(404).json({ error: 'Question not found' });

    const correctAnswer = String(row.correct_answer ?? '');
    let isCorrect = (userAnswer ?? '').trim().toLowerCase() === correctAnswer.trim().toLowerCase();

    if (row.type === 'SHORT') {
      const normUser = normalizeSynonyms(userAnswer ?? '');
      const normCorrect = normalizeSynonyms(correctAnswer);
      if (!isCorrect) {
        const sim = similarity(normUser, normCorrect);
        if (sim >= 0.85) isCorrect = true;
      }
      if (!isCorrect && openai) {
        try {
          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: 'You are a grading assistant. Reply with JSON {"correct":boolean,"feedback":string}.' },
              { role: 'user', content: `Question: ${row.prompt}\nCorrect Answer: ${correctAnswer}\nStudent Answer: ${userAnswer}` }
            ],
            response_format: { type: 'json_object' },
          });
          const msg = completion.choices?.[0]?.message?.content || '{}';
          const judgement = JSON.parse(msg);
          if (judgement.correct === true) isCorrect = true;
          if (typeof judgement.feedback === 'string') row.feedback = judgement.feedback;
        } catch (e) {
          console.error('OpenAI grading error', e);
        }
      }
    }

    // Track a streak of consecutive correct answers. Any wrong attempt resets it.
    const newStreak = isCorrect ? Number(row.correctCount || 0) + 1 : 0;
    db.prepare(`
      INSERT INTO Mastery (questionId, correctCount) VALUES (?, ?)
      ON CONFLICT(questionId) DO UPDATE SET correctCount=excluded.correctCount
    `).run(questionId, newStreak);

    // Build INSERT for Attempts dynamically, coercing values per column type.
    const cols = pragmaColumns('Attempts');
    const colMap = new Map(cols.map(c => [c.name, c]));
    const has = (n: string) => colMap.has(n);

    const payload: Record<string, any> = {};

    // id: if TEXT -> uuid hex; if INTEGER -> omit to auto-assign
    if (has('id')) {
      const t = colMap.get('id')!.type;
      if (isTextType(t) || t === '') {
        payload.id = (db.prepare(`SELECT lower(hex(randomblob(16))) v`).get() as any).v;
      } // INTEGER PK -> let SQLite assign
    }
    if (has('questionId')) {
      const t = colMap.get('questionId')!.type;
      payload.questionId = isTextType(t) || t === '' ? String(questionId) : Number(questionId);
    }
    if (has('deckId')) {
      const t = colMap.get('deckId')!.type;
      payload.deckId = isTextType(t) || t === '' ? String(row.deckId ?? '') : Number(row.deckId ?? 0);
    }
    if (has('userAnswer')) {
      const t = colMap.get('userAnswer')!.type;
      payload.userAnswer = isTextType(t) || t === '' ? String(userAnswer ?? '') : Number(userAnswer ?? 0);
    }

    // Some DBs have BOTH columns. Set ALL that exist.
    const correctnessCols = ['correct', 'isCorrect'];
    for (const c of correctnessCols) {
      if (has(c)) {
        const t = colMap.get(c)!.type;
        payload[c] = isTextType(t) ? (isCorrect ? '1' : '0') : (isCorrect ? 1 : 0);
      }
    }

    // timestamp variants: set all that exist
    const tsCandidates = ['ts', 'timestamp', 'createdAt', 'created_at', 'time'];
    for (const c of tsCandidates) {
      if (has(c)) {
        const t = colMap.get(c)!.type;
        payload[c] = isTextType(t) ? new Date().toISOString() : Date.now();
      }
    }

        // Perform insert with only present columns
    const names = Object.keys(payload);
    if (names.length >= 1) {
      const placeholders = names.map(() => '?').join(',');
      const values = names.map(n => payload[n]);
      const sql = `INSERT INTO Attempts (${names.join(',')}) VALUES (${placeholders})`;
      db.prepare(sql).run(...values);
    }

    res.json({
      isCorrect,
      correct_answer: correctAnswer,
      explanation: String(row.explanation ?? ''),
      correctCount: newStreak,
      mastered: newStreak >= 2,
});


  } catch (err: any) {
    console.error('/quiz/submit error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Submit failed' });
  }
});

export default quizRouter;
