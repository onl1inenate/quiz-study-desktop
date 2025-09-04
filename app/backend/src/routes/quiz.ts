import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import OpenAI from 'openai';

export const quizRouter = Router();

const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

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

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
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

function isCloseMatch(userAnswer: string, correctAnswer: string) {
  const ua = userAnswer.trim().toLowerCase();
  const ca = correctAnswer.trim().toLowerCase();
  const distance = levenshtein(ua, ca);
  const maxLen = Math.max(ua.length, ca.length);
  return distance <= 1 || distance <= Math.floor(maxLen * 0.1);
}

quizRouter.post('/session', (req, res) => {
  const parsed = SessionReq.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.message });
  const { deckId, count: requested, mode, difficulty, ratios } = parsed.data;

  const rows = db.prepare(`
      SELECT q.id, q.deckId, q.type, q.prompt, q.options, q.correct_answer, q.explanation, q.learning_content, q.tags, q.difficulty,
             COALESCE(m.correctCount, 0) AS correctCount,
             (SELECT COUNT(*) FROM Attempts a WHERE a.questionId = q.id) AS attemptCount
      FROM Questions q
      LEFT JOIN Mastery m ON m.questionId = q.id
      WHERE q.deckId = ?
  `).all(deckId) as any[];

  const tagAttempts = new Map<string, number>();
  for (const r of rows) {
  const tags = String(r.tags || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter(Boolean);
    const attempts = Number(r.attemptCount || 0);
    for (const t of tags) {
      tagAttempts.set(t, (tagAttempts.get(t) || 0) + attempts);
    }
  }

  const sectionScore = (r: any) => {
    const tags = String(r.tags || '')
      .split(',')
      .map((t: string) => t.trim())
      .filter((t: string) => t.startsWith('section:'));
    if (!tags.length) return 0;
    return Math.min(...tags.map((t: string) => tagAttempts.get(t) || 0));
  };

  const sortByLeastQuizzed = (arr: any[]) =>
    shuffle(arr).sort((a, b) => sectionScore(a) - sectionScore(b));

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
  const mcq   = sortByLeastQuizzed(selectedPool.filter(r => r.type === 'MCQ'));
  const cloze = sortByLeastQuizzed(selectedPool.filter(r => r.type === 'CLOZE'));
  const short = sortByLeastQuizzed(selectedPool.filter(r => r.type === 'SHORT'));

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
    const leftovers = shuffle(selectedPool.filter(q => !chosen.has(q.id)));
    selected = [...selected, ...leftovers.slice(0, count - selected.length)];
  }

  selected.sort((a, b) => Number(a.correctCount || 0) - Number(b.correctCount || 0));
  selected = shuffle(selected);

  const letters = ['a','b','c','d'] as const;
  const out = selected.slice(0, count).map(r => {
    const parsed = (() => {
      try {
        return JSON.parse(r.options || '{}');
      } catch {
        return { a: '', b: '', c: '', d: '' };
      }
    })();

    if (r.type === 'MCQ') {
      const pairs = letters.map(l => ({ key: l, val: parsed[l] }));
      shuffle(pairs);
      const opts: Record<string, string> = {};
      const map: Record<string, string> = {};
      pairs.forEach((p, idx) => {
        const letter = letters[idx];
        opts[letter] = p.val;
        map[letter] = p.key;
      });
      return {
        id: r.id,
        deckId: r.deckId,
        type: 'MCQ' as const,
        prompt: r.prompt,
        learning_content: r.learning_content,
        options: opts,
        answerMap: map,
        correctCount: Number(r.correctCount || 0),
        mastered: Number(r.correctCount || 0) >= 2,
      };
    }

    return {
      id: r.id,
      deckId: r.deckId,
      type: r.type as 'CLOZE' | 'SHORT',
      prompt: r.prompt,
      learning_content: r.learning_content,
      options: parsed,
      correctCount: Number(r.correctCount || 0),
      mastered: Number(r.correctCount || 0) >= 2,
    };
  });

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
    const ua = String(userAnswer ?? '');
    let isCorrect = ua.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
    // Only allow fuzzy matching for non-MCQ questions. Single-letter answers
    // (e.g. "a" vs "b") would otherwise be considered a close match.
    const closeMatch = row.type !== 'MCQ' && isCloseMatch(ua, correctAnswer);
    let explanation = '';
    let correctDefinition = '';

    // Attempt to extract per-option explanations from the stored explanation
    // string. Options may be separated by newlines or spaces, so we split on
    // the option label (a-d) followed by punctuation.
    const optionExplanations: Record<string, string> = (() => {
      const map: Record<string, string> = {};
      const text = String(row.explanation || '');
      const parts = text.split(/\b([a-d])[\).:-]\s*/gi);
      for (let i = 1; i < parts.length; i += 2) {
        const letter = parts[i]?.toLowerCase();
        let exp = parts[i + 1] || '';
        // Remove any trailing summary like "The correct answer is ..."
        exp = exp.split(/The\s+correct\s+answer\s+is/i)[0].trim();
        if (letter) map[letter] = exp;
      }
      return map;
    })();
    const userExp = optionExplanations[ua.trim().toLowerCase()];
    const correctExp = optionExplanations[correctAnswer.trim().toLowerCase()];

    if ((row.type === 'CLOZE' || row.type === 'SHORT') && openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content:
                'You are a grading assistant. Be lenient with small typos and reply with JSON {"correct":boolean,"correct_definition":string,"explanation":string}.',
            },
            {
              role: 'user',
              content: `Question: ${row.prompt}\nCorrect Answer: ${correctAnswer}\nStudent Answer: ${userAnswer}\nDefine both answers and explain why the student is correct or incorrect.`,
            }
          ],
          response_format: { type: 'json_object' },
        });
        const msg = completion.choices?.[0]?.message?.content || '{}';
        const judgement = JSON.parse(msg);
        if (typeof judgement.correct === 'boolean') isCorrect = judgement.correct;
        if (typeof judgement.explanation === 'string') explanation = judgement.explanation;
        if (typeof judgement.correct_definition === 'string')
          correctDefinition = judgement.correct_definition;
      } catch (e) {
        console.error('OpenAI grading error', e);
        if (closeMatch) isCorrect = true;
      }
    } else if (closeMatch) {
      isCorrect = true;
    }

    if (!correctDefinition) correctDefinition = correctExp || String(row.explanation || '');
    if (!explanation) {
      if (isCorrect) {
        explanation = correctExp || correctDefinition || `"${correctAnswer}" is correct.`;
      } else {
        const parts: string[] = [];
        parts.push(
          userExp
            ? `Your answer "${ua}" is incorrect: ${userExp}.`
            : `Your answer "${ua}" is incorrect.`,
        );
        parts.push(
          correctExp || correctDefinition
            ? `The correct answer is "${correctAnswer}": ${correctExp || correctDefinition}.`
            : `The correct answer is "${correctAnswer}".`,
        );
        explanation = parts.join(' ');
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
      user_answer: userAnswer,
      explanation,
      correctCount: newStreak,
      completed: newStreak >= 1,
      mastered: newStreak >= 2,
    });
  } catch (err: any) {
    console.error('/quiz/submit error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Submit failed' });
  }
});

export default quizRouter;
