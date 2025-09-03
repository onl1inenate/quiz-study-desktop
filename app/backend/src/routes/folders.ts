import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { randomUUID } from 'crypto';

export const foldersRouter = Router();

foldersRouter.get('/', (_req, res) => {
  const folderRows = db
    .prepare(`SELECT id, name FROM Folders ORDER BY createdAt DESC`)
    .all() as Array<{ id: string; name: string }>;

  const folders = folderRows.map((f) => {
    const deckRows = db
      .prepare(`SELECT id, name FROM Decks WHERE folderId = ? ORDER BY createdAt DESC`)
      .all(f.id) as Array<{ id: string; name: string }>;

    const decks = deckRows.map((d) => {
      const totalRow = db
        .prepare(`SELECT COUNT(*) as n FROM Questions WHERE deckId = ?`)
        .get(d.id) as { n: number };
      const completedRow = db
        .prepare(`
          SELECT COUNT(*) as n FROM Questions q
          JOIN Mastery m ON m.questionId = q.id
          WHERE q.deckId = ? AND m.correctCount = 1
        `)
        .get(d.id) as { n: number };
      const masteredRow = db
        .prepare(`
          SELECT COUNT(*) as n FROM Questions q
          JOIN Mastery m ON m.questionId = q.id
          WHERE q.deckId = ? AND m.correctCount >= 2
        `)
        .get(d.id) as { n: number };
      const total = Number(totalRow?.n ?? 0);
      const completed = Number(completedRow?.n ?? 0);
      const mastered = Number(masteredRow?.n ?? 0);
      return {
        id: d.id,
        name: d.name,
        totalQuestions: total,
        completed,
        mastered,
        unmastered: Math.max(0, total - mastered - completed),
      };
    });

    return { id: f.id, name: f.name, decks };
  });

  res.json({ folders });
});

foldersRouter.post('/', (req, res) => {
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.message });
  const id = randomUUID();
  db.prepare(`INSERT INTO Folders (id, name) VALUES (?, ?)`).run(id, body.data.name);
  res.json({ id });
});

foldersRouter.put('/:id', (req, res) => {
  const id = req.params.id;
  const body = z.object({ name: z.string().min(1) }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: body.error.message });
  db.prepare(`UPDATE Folders SET name = ? WHERE id = ?`).run(body.data.name, id);
  res.json({ ok: true });
});

foldersRouter.delete('/:id', (req, res) => {
  const id = req.params.id;
  const decks = db
    .prepare(`SELECT id FROM Decks WHERE folderId = ?`)
    .all(id) as Array<{ id: string }>;
  for (const d of decks) {
    db.prepare(
      `DELETE FROM Mastery WHERE questionId IN (SELECT id FROM Questions WHERE deckId = ?)`
    ).run(d.id);
    db.prepare(`DELETE FROM Questions WHERE deckId = ?`).run(d.id);
    db.prepare(`DELETE FROM Decks WHERE id = ?`).run(d.id);
  }
  db.prepare(`DELETE FROM Folders WHERE id = ?`).run(id);
  res.json({ ok: true });
});

export default foldersRouter;
