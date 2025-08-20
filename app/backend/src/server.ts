// app/backend/src/server.ts
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';

import { ENV } from './env.js';
import { decksRouter } from './routes/decks.js';
import { quizRouter } from './routes/quiz.js';
import { questionsRouter } from './routes/questions.js';

const app = express();

/**
 * CORS for dev (http://localhost:5173) and packaged Electron (file:// => no Origin header).
 * We keep it permissive for a desktop app, and answer preflight so fetch() succeeds.
 */
// Allow all origins (including file:// with no Origin header) and respond to preflight
app.use(cors());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

/**
 * JSON body parsing — raise the limit so large note pastes work.
 * You can adjust via ENV.JSON_LIMIT (defaults to 10mb).
 */
const JSON_LIMIT = process.env.JSON_LIMIT || '10mb';
app.use(express.json({ limit: JSON_LIMIT }));

/** Healthcheck */
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/** Routers */
app.use('/decks', decksRouter);
app.use('/quiz', quizRouter);
app.use('/questions', questionsRouter);

/** Typed error handler */
app.use(
  (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    const message =
      err instanceof Error ? err.message : typeof err === 'string' ? err : 'Internal error';
    res.status(500).json({ error: message });
  }
);

/** Start */
app.listen(ENV.PORT, () => {
  console.log(`Backend running on http://localhost:${ENV.PORT}`);
});
