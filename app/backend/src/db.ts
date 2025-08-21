import Database from 'better-sqlite3';
import { ENV } from './env.js';
import { randomUUID } from 'crypto';

export const db = new Database(ENV.DATABASE_FILE);
db.pragma('journal_mode = WAL');

function hasTable(name: string) {
  try {
    const r = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
    return !!r;
  } catch {
    return false;
  }
}
function hasColumn(table: string, col: string) {
  try {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some(r => r.name === col);
  } catch {
    return false;
  }
}

export function migrate() {
  // Folders to group decks
  db.exec(`
    CREATE TABLE IF NOT EXISTS Folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
  `);

  // Decks
  db.exec(`
    CREATE TABLE IF NOT EXISTS Decks (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_text TEXT DEFAULT '',
      folderId TEXT,
      createdAt INTEGER DEFAULT (strftime('%s','now') * 1000)
    );
  `);
  // Add missing columns to old Decks
  if (!hasColumn('Decks', 'source_text')) {
    db.exec(`ALTER TABLE Decks ADD COLUMN source_text TEXT DEFAULT ''`);
  }
  if (!hasColumn('Decks', 'folderId')) {
    db.exec(`ALTER TABLE Decks ADD COLUMN folderId TEXT`);
  }

  // Questions
  db.exec(`
    CREATE TABLE IF NOT EXISTS Questions (
      id TEXT PRIMARY KEY,
      deckId TEXT NOT NULL,
      type TEXT NOT NULL,
      prompt TEXT NOT NULL,
      options TEXT,
      correct_answer TEXT,
      explanation TEXT,
      tags TEXT,
      difficulty INTEGER DEFAULT 3
    );
  `);

  // Mastery
  db.exec(`
    CREATE TABLE IF NOT EXISTS Mastery (
      questionId TEXT PRIMARY KEY,
      correctCount INTEGER DEFAULT 0
    );
  `);

  // Attempts — shape varies across installs; keep flexible
  db.exec(`
    CREATE TABLE IF NOT EXISTS Attempts (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      userAnswer TEXT,
      correct INTEGER,
      ts INTEGER
    );
  `);
  // Backfill common variants if present in your DB; no hard failure if already there
  // (We don't alter Attempts further here because routes/quiz.ts is schema-aware)
}

migrate();

// Helpers commonly used elsewhere
export function insertQuestion(q: {
  id?: string;
  deckId: string;
  type: string;
  prompt: string;
  options?: any;
  correct_answer?: string;
  explanation?: string;
  tags?: string[];
  difficulty?: number;
}) {
  const id = q.id ?? randomUUID();
  const options = q.options ? JSON.stringify(q.options) : null;
  const tags = q.tags ? q.tags.join(',') : null;
  db.prepare(`
    INSERT INTO Questions (id, deckId, type, prompt, options, correct_answer, explanation, tags, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    q.deckId,
    q.type,
    q.prompt,
    options,
    q.correct_answer ?? null,
    q.explanation ?? null,
    tags,
    q.difficulty ?? 3
  );
  return id;
}
