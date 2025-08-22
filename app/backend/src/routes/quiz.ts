import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';

export const quizRouter = Router();

const SessionReq = z.object({
  deckId: z.string().min(1),
  count: z.number().int().min(1).default(10),
  mode: z.enum(['Mixed', 'Weak', 'Due']).default('Mixed'),
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
  const { deckId, count: requested, mode } = parsed.data;

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

  const count = Math.max(1, Math.min(requested, pool.length));
  const mcq = shuffle(pool.filter(r => r.type === 'MCQ'));
  const cloze = shuffle(pool.filter(r => r.type === 'CLOZE'));
  const short = shuffle(pool.filter(r => r.type === 'SHORT'));
  const take = <T,>(arr: T[], n: number) => arr.slice(0, Math.max(0, Math.min(n, arr.length)));

  let wantMCQ = Math.floor(count * 0.5);
  let wantCloze = Math.floor(count * 0.25);
  let wantShort = count - wantMCQ - wantCloze;

  let selected: any[] = [
    ...take(mcq, wantMCQ),
    ...take(cloze, wantCloze),
    ...take(short, wantShort),
  ];

  if (selected.length < count) {
    const chosen = new Set(selected.map(q => q.id));
    const leftovers = shuffle(pool.filter(q => !chosen.has(q.id)));
    selected = [...selected, ...leftovers.slice(0, count - selected.length)];
  }

  const letters = ['a','b','c','d'] as const;
  const correctLabels: string[] = [];

  const out = selected.slice(0, count).map(r => {
    const parsed = (() => {
      try { return JSON.parse(r.options || '{}'); }
      catch { return { a:'', b:'', c:'', d:'' }; }
    })();

    if (r.type === 'MCQ') {
      const entries = letters.map(l => [l, parsed[l] || ''] as [string, string]);
      let shuffled: Record<typeof letters[number], string> = { a:'', b:'', c:'', d:'' };
      let map: Record<typeof letters[number], string> = { a:'', b:'', c:'', d:'' };
      let correctLabel = 'a';
      let attempts = 0;
      do {
        const shuffledEntries = shuffle(entries.slice());
        shuffled = { a:'', b:'', c:'', d:'' } as any;
        map = { a:'', b:'', c:'', d:'' } as any;
        shuffledEntries.forEach(([orig, text], idx) => {
          const newLabel = letters[idx];
          shuffled[newLabel] = text;
          map[newLabel] = orig;
        });
        correctLabel = letters.find(l => map[l] === r.correct_answer) || 'a';
        attempts++;
      } while (
        attempts < 10 &&
        correctLabels.length >= 2 &&
        correctLabels[correctLabels.length - 1] === correctLabel &&
        correctLabels[correctLabels.length - 2] === correctLabel
      );
      correctLabels.push(correctLabel);

      return {
        id: r.id,
        deckId: r.deckId,
        type: 'MCQ' as const,
        prompt: r.prompt,
        options: shuffled,
        answerMap: map,
      };
    }

    return {
      id: r.id,
      deckId: r.deckId,
      type: r.type as 'CLOZE' | 'SHORT',
      prompt: r.prompt,
      options: parsed,
    };
  });

  res.json({ questions: out });
});

quizRouter.post('/submit', (req, res) => {
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
    const isCorrect =
      (userAnswer ?? '').trim().toLowerCase() === correctAnswer.trim().toLowerCase();

    const newCount = isCorrect ? Number(row.correctCount || 0) + 1 : 0;
    db.prepare(`
      INSERT INTO Mastery (questionId, correctCount) VALUES (?, ?)
      ON CONFLICT(questionId) DO UPDATE SET correctCount=excluded.correctCount
    `).run(questionId, newCount);

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
      correctCount: newCount,
      mastered: newCount >= 2,
    });
  } catch (err: any) {
    console.error('/quiz/submit error:', err?.message || err);
    res.status(500).json({ error: err?.message || 'Submit failed' });
  }
});

export default quizRouter;
