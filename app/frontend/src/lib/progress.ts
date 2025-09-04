export type DeckProgress = {
  completed: string[];
  mastered: string[];
};

export function loadProgress(deckId: string): DeckProgress {
  try {
    const raw = localStorage.getItem(`progress-${deckId}`);
    if (!raw) return { completed: [], mastered: [] };
    const parsed = JSON.parse(raw);
    const completed = Array.isArray(parsed?.completed) ? parsed.completed : [];
    const mastered = Array.isArray(parsed?.mastered) ? parsed.mastered : [];
    return { completed, mastered };
  } catch {
    return { completed: [], mastered: [] };
  }
}

export function saveProgress(deckId: string, progress: DeckProgress): void {
  try {
    localStorage.setItem(`progress-${deckId}`, JSON.stringify(progress));
  } catch {}
}

export function recordCorrect(deckId: string, questionId: string, streak: number) {
  const progress = loadProgress(deckId);
  if (!progress.completed.includes(questionId)) progress.completed.push(questionId);
  if (streak >= 3 && !progress.mastered.includes(questionId)) {
    progress.mastered.push(questionId);
  }
  saveProgress(deckId, progress);
}
