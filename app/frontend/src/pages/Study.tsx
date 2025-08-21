import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { listFolders, startSession, DeckMeta, FolderMeta } from '../lib/api';
import QuizRunner from '../components/QuizRunner';

type Mode = 'Mixed' | 'Weak' | 'Due';

export default function Study() {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [deckId, setDeckId] = useState<string>('');
  const [mode, setMode] = useState<Mode>('Mixed');
  const [count, setCount] = useState<number>(50);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<any[] | null>(null);
  const [sp] = useSearchParams();

  // Load decks
  useEffect(() => {
    (async () => {
      try {
        const fs = await listFolders();
        const ds = fs.flatMap((f: FolderMeta) => f.decks);
        setDecks(ds);
        const preselect = sp.get('deck');
        if (preselect && ds.find((d) => d.id === preselect)) {
          setDeckId(preselect);
        } else if (!deckId && ds[0]) {
          setDeckId(ds[0].id);
        }
      } catch {
        alert('Failed to list decks');
      }
    })();
  }, []);

  const selectedDeck = useMemo(
    () => decks.find(d => d.id === deckId),
    [decks, deckId]
  );

  const maxCount = selectedDeck?.totalQuestions ?? 1;

  // Clamp count when deck changes
  useEffect(() => {
    setCount(c => Math.max(1, Math.min(c, maxCount)));
  }, [maxCount]);

  async function onStart() {
    if (!deckId) return alert('Choose a deck first.');
    setLoading(true);
    setQuestions(null);
    try {
      const qs = await startSession(deckId, count, mode);
      if (!qs?.length) alert('No questions available for this selection.');
      setQuestions(qs ?? []);
    } catch (e: any) {
      alert(e?.message || 'Failed to start session');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="grid md:grid-cols-[1fr,1fr,160px,120px] gap-4 items-end">
          <div>
            <label className="label">Deck</label>
            <select
              className="select"
              value={deckId}
              onChange={e => setDeckId(e.target.value)}
            >
              {decks.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Mode</label>
            <select
              className="select"
              value={mode}
              onChange={e => setMode(e.target.value as Mode)}
            >
              <option>Mixed</option>
              <option>Weak</option>
              <option>Due</option>
            </select>
          </div>

          <div>
            <label className="label">Questions</label>
            <input
              className="input"
              type="number"
              min={1}
              max={maxCount}
              value={count}
              onChange={e => setCount(Math.max(1, Math.min(Number(e.target.value) || 1, maxCount)))}
            />
            <div className="text-xs text-slate-500 mt-1">Max {maxCount} for this deck</div>
          </div>

          <div className="flex gap-2">
            <button
              className="btn"
              type="button"
              onClick={() => setCount(maxCount)}
              title="Use all questions available"
            >
              All
            </button>
            <button className="btn" onClick={onStart} disabled={loading || !deckId}>
              {loading ? 'Starting…' : 'Start'}
            </button>
          </div>
        </div>
      </div>

      {questions && questions.length > 0 && (
        <QuizRunner
          questions={questions}
          onExit={() => setQuestions(null)}
        />
      )}
    </div>
  );
}
