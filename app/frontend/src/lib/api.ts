const BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

export type DeckMeta = {
  id: string;
  name: string;
  totalQuestions: number;
  mastered: number;
  unmastered: number;
};

export async function createDeck(name: string, text: string) {
  const r = await fetch(`${BASE}/decks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, text }),
  });
  if (!r.ok) throw new Error(await r.text().catch(()=>'Failed to create deck'));
  return r.json() as Promise<{ deckId: string; countsByType: any }>;
}

export async function listDecks() {
  const r = await fetch(`${BASE}/decks`);
  if (!r.ok) throw new Error('Failed to list decks');
  const j = await r.json();
  return j.decks as DeckMeta[];
}

export type QuizQuestion = {
  id: string;
  deckId: string;
  type: 'MCQ' | 'CLOZE' | 'SHORT';
  prompt: string;
  options?: { a: string; b: string; c: string; d: string };
};

export async function startSession(deckId: string, count: number, mode: 'Mixed'|'Weak'|'Due') {
  const r = await fetch(`${BASE}/quiz/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ deckId, count, mode }),
  });
  if (!r.ok) throw new Error(await r.text().catch(()=>'Failed to start session'));
  const j = await r.json();
  return j.questions as QuizQuestion[];
}

export async function submitAnswer(questionId: string, userAnswer: string) {
  const r = await fetch(`${BASE}/quiz/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questionId, userAnswer }),
  });
  if (!r.ok) throw new Error(await r.text().catch(()=>'Failed to submit'));
  return r.json() as Promise<{
    isCorrect: boolean;
    correct_answer: string;
    explanation: string;
    correctCount: number;
    mastered: boolean;
  }>;
}

/* ===== Deck detail & editing ===== */

export type DeckDetail = {
  id: string;
  name: string;
  text: string; // notes
  totalQuestions: number;
  mastered: number;
  unmastered: number;
};

export async function getDeckDetail(deckId: string) {
  const r = await fetch(`${BASE}/decks/${deckId}`);
  if (!r.ok) throw new Error(await r.text().catch(()=>'Failed to fetch deck'));
  return r.json() as Promise<DeckDetail>;
}

export async function updateDeck(deckId: string, data: { name?: string; text?: string; regenerate?: boolean; batchSize?: number }) {
  const r = await fetch(`${BASE}/decks/${deckId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(await r.text().catch(()=>'Failed to update deck'));
  return r.json() as Promise<any>;
}

export async function deleteDeck(deckId: string) {
  const r = await fetch(`${BASE}/decks/${deckId}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(await r.text().catch(()=>'Failed to delete deck'));
  return r.json();
}
