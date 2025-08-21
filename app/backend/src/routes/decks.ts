import { Router } from 'express';
import { z } from 'zod';
import { db, insertQuestion } from '../db.js';
import { generateAIBatch } from '../ai.generate.js';
import { AIGeneratedQuestionSchema } from '../schemas.js';
import { randomUUID } from 'crypto';

export const decksRouter = Router();

/** Summaries for dashboard */
decksRouter.get('/', (_req, res) => {
  const rows = db
    .prepare(`SELECT id, name FROM Decks ORDER BY createdAt DESC`)
    .all() as Array<{ id: string; name: string }>;

  const out = rows.map((r) => {
    const totalRow = db
      .prepare(`SELECT COUNT(*) as n FROM Questions WHERE deckId = ?`)
      .get(r.id) as { n: number };
    const masteredRow = db
      .prepare(
        `SELECT COUNT(*) as n FROM Questions q
         JOIN Mastery m ON m.questionId = q.id
         WHERE q.deckId = ? AND m.correctCount >= 2`,
      )
      .get(r.id) as { n: number };

    const total = Number(totalRow?.n ?? 0);
    const mastered = Number(masteredRow?.n ?? 0);

    return {
      id: r.id,
      name: r.name,
      totalQuestions: total,
      mastered,
      unmastered: Math.max(0, total - mastered),
    };
  });

  res.json({ decks: out });
});

/** Create deck + generate questions */
decksRouter.post('/', async (req, res) => {
  const body = z
    .object({
      name: z.string().min(1),
      text: z.string().min(1),
      folderId: z.string().uuid().optional(),
    })
    .safeParse(req.body);

  if (!body.success) return res.status(400).json({ error: body.error.message });
  const { name, text, folderId } = body.data;

  const id = randomUUID();
  db.prepare(`INSERT INTO Decks (id, name, source_text, folderId) VALUES (?, ?, ?, ?)`).run(id, name, text, folderId ?? null);

  try {
    const items = await generateAIBatch(text, 75);
    const parsed = z.array(AIGeneratedQuestionSchema).safeParse(items);
    if (!parsed.success) throw new Error('AI validation failed');

    for (const q of parsed.data) {
      insertQuestion({
        deckId: id,
        type: q.type,
        prompt: q.prompt,
        options: q.options ?? undefined,
        correct_answer: q.correct_answer ?? '',
        explanation: q.explanation ?? '',
        tags: q.tags ?? [],
        difficulty: q.difficulty ?? 3,
      });
    }

    const countsByType = db
      .prepare(
        `SELECT type, COUNT(*) as n
         FROM Questions WHERE deckId = ?
         GROUP BY type`,
      )
      .all(id) as Array<{ type: string; n: number }>;

    res.json({ deckId: id, countsByType });
  } catch (e: any) {
    console.error('POST /decks error', e?.message || e);
    res.status(500).json({ error: e?.message || 'Failed to generate' });
  }
});

/** Fetch a single deck with its notes (for editing) */
decksRouter.get('/:id', (req, res) => {
  const id = req.params.id;
  const deck = db
    .prepare(`SELECT id, name, source_text, folderId FROM Decks WHERE id = ?`)
    .get(id) as { id: string; name: string; source_text: string; folderId: string | null } | undefined;

  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  const totalRow = db
    .prepare(`SELECT COUNT(*) as n FROM Questions WHERE deckId = ?`)
    .get(id) as { n: number };
  const masteredRow = db
    .prepare(
      `SELECT COUNT(*) as n FROM Questions q
       JOIN Mastery m ON m.questionId = q.id
       WHERE q.deckId = ? AND m.correctCount >= 2`,
    )
    .get(id) as { n: number };

  res.json({
    id: deck.id,
    name: deck.name,
    text: deck.source_text ?? '',
    folderId: deck.folderId ?? null,
    totalQuestions: Number(totalRow?.n ?? 0),
    mastered: Number(masteredRow?.n ?? 0),
    unmastered: Math.max(0, Number(totalRow?.n ?? 0) - Number(masteredRow?.n ?? 0)),
  });
});

/** Update name/notes; optional regenerate to rebuild the questions from notes */
decksRouter.put('/:id', async (req, res) => {
  const id = req.params.id;
  const payload = z
    .object({
      name: z.string().optional(),
      text: z.string().optional(),
      folderId: z.string().uuid().nullable().optional(),
      regenerate: z.boolean().optional().default(false),
      batchSize: z.number().int().min(25).max(250).optional().default(100),
    })
    .safeParse(req.body);

  if (!payload.success) return res.status(400).json({ error: payload.error.message });
  const { name, text, regenerate, batchSize } = payload.data;

  const deck = db.prepare(`SELECT id FROM Decks WHERE id = ?`).get(id) as { id: string } | undefined;
  if (!deck) return res.status(404).json({ error: 'Deck not found' });

  if (name !== undefined) db.prepare(`UPDATE Decks SET name = ? WHERE id = ?`).run(name, id);
  if (text !== undefined) db.prepare(`UPDATE Decks SET source_text = ? WHERE id = ?`).run(text, id);
  if (payload.data.folderId !== undefined)
    db.prepare(`UPDATE Decks SET folderId = ? WHERE id = ?`).run(payload.data.folderId ?? null, id);

  if (!regenerate) return res.json({ ok: true });

  // wipe questions/mastery, keep attempts
  db.prepare(
    `DELETE FROM Mastery WHERE questionId IN (SELECT id FROM Questions WHERE deckId = ?)`,
  ).run(id);
  db.prepare(`DELETE FROM Questions WHERE deckId = ?`).run(id);

  const sourceRow = db
    .prepare(`SELECT source_text FROM Decks WHERE id = ?`)
    .get(id) as { source_text: string } | undefined;
  const source = text !== undefined ? text : (sourceRow?.source_text ?? '');

  try {
    const items = await generateAIBatch(source, batchSize);
    const parsed = z.array(AIGeneratedQuestionSchema).safeParse(items);
    if (!parsed.success) throw new Error('AI validation failed');

    for (const q of parsed.data) {
      insertQuestion({
        deckId: id,
        type: q.type,
        prompt: q.prompt,
        options: q.options ?? undefined,
        correct_answer: q.correct_answer ?? '',
        explanation: q.explanation ?? '',
        tags: q.tags ?? [],
        difficulty: q.difficulty ?? 3,
      });
    }

    const totalRow = db
      .prepare(`SELECT COUNT(*) as n FROM Questions WHERE deckId = ?`)
      .get(id) as { n: number };
    const countsByType = db
      .prepare(
        `SELECT type, COUNT(*) as n
         FROM Questions WHERE deckId = ?
         GROUP BY type`,
      )
      .all(id) as Array<{ type: string; n: number }>;

    res.json({ ok: true, total: Number(totalRow?.n ?? 0), countsByType });
  } catch (e: any) {
    console.error('PUT /decks/:id regenerate error', e?.message || e);
    res.status(500).json({ error: e?.message || 'Failed to regenerate' });
  }
});

/** Delete a deck */
decksRouter.delete('/:id', (req, res) => {
  const id = req.params.id;
  db.prepare(
    `DELETE FROM Mastery WHERE questionId IN (SELECT id FROM Questions WHERE deckId = ?)`,
  ).run(id);
  db.prepare(`DELETE FROM Questions WHERE deckId = ?`).run(id);
  db.prepare(`DELETE FROM Decks WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default decksRouter;
