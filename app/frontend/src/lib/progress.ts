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

export function recordProgress(
  deckId: string,
  questionId: string,
  completed: boolean,
  mastered: boolean,
) {
  const progress = loadProgress(deckId);

  // mastered always implies completed
  if (mastered) completed = true;

  // Update completed list
  if (completed) {
    if (!progress.completed.includes(questionId)) progress.completed.push(questionId);
  } else {
    progress.completed = progress.completed.filter(id => id !== questionId);
  }

  // Update mastered list
  if (mastered) {
    if (!progress.mastered.includes(questionId)) progress.mastered.push(questionId);
  } else {
    progress.mastered = progress.mastered.filter(id => id !== questionId);
  }

  saveProgress(deckId, progress);
}

// Backwards compatibility
export function recordCorrect(deckId: string, questionId: string, streak: number) {
  recordProgress(deckId, questionId, streak >= 1, streak >= 3);
}
