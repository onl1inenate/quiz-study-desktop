import { Router } from 'express';
import { db } from '../db.js';

export const questionsRouter = Router();

questionsRouter.get('/:id', (req, res) => {
  const id = req.params.id;
  const row = db.prepare(`SELECT * FROM Questions WHERE id = ?`).get(id);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(row);
});
