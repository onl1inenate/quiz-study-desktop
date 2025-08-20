import React from 'react';
import type { DeckMeta } from '../lib/api';

/**
 * Simple analytics panel aligned with the current DeckMeta shape:
 * { id, name, totalQuestions, mastered, unmastered }
 */
type Props = { deck: DeckMeta };

export default function AnalyticsPanel({ deck }: Props) {
  const total = Number(deck.totalQuestions ?? 0);
  const mastered = Number(deck.mastered ?? 0);
  const unmastered = Number(deck.unmastered ?? Math.max(0, total - mastered));
  const accuracy = total > 0 ? Math.round((mastered / total) * 100) : 0;

  return (
    <div className="card p-4 border rounded">
      <div className="text-sm text-slate-600 mb-2">Deck analytics</div>
      <div className="flex flex-wrap gap-2">
        <span className="badge">Total: {total}</span>
        <span className="badge">Mastered: {mastered}</span>
        <span className="badge">Unmastered: {unmastered}</span>
        <span className="badge">Accuracy: {accuracy}%</span>
      </div>
    </div>
  );
}
