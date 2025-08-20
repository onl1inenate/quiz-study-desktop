import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listDecks, type DeckMeta, updateDeck, deleteDeck } from '../lib/api';

export default function Dashboard() {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [rename, setRename] = useState<Record<string, string>>({});
  const nav = useNavigate();

  async function refresh() {
    setLoading(true);
    try {
      const d = await listDecks();
      setDecks(d);
      const r: Record<string, string> = {};
      d.forEach((x) => (r[x.id] = x.name));
      setRename(r);
    } catch (e: any) {
      alert(e?.message || 'Failed to load decks');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function onRename(id: string) {
    try {
      await updateDeck(id, { name: rename[id] ?? '' });
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Rename failed');
    }
  }

  async function onDelete(id: string) {
    if (!confirm('Delete this deck?')) return;
    try {
      await deleteDeck(id);
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Your Decks</h1>
        <Link className="btn" to="/new">New Deck</Link>
      </div>

      {!decks.length && <div className="text-slate-500">No decks yet. Create one!</div>}

      <div className="grid gap-4">
        {decks.map((d) => (
          <div key={d.id} className="card p-4 border rounded">
            <div className="flex items-center justify-between">
              <div className="font-medium">{d.name}</div>
              <div className="text-sm text-slate-500">
                {d.mastered}/{d.totalQuestions} mastered
              </div>
            </div>

            <div className="mt-3 grid md:grid-cols-2 gap-3">
              <div>
                <label className="label">Rename</label>
                <div className="flex gap-2">
                  <input
                    className="input p-2 border rounded w-full"
                    value={rename[d.id] ?? ''}
                    onChange={(e) => setRename((r) => ({ ...r, [d.id]: e.target.value }))}
                  />
                  <button className="btn" onClick={() => onRename(d.id)}>Save</button>
                </div>
              </div>

              <div className="flex md:justify-end items-end gap-2">
                <button className="btn" onClick={() => nav(`/study?deck=${d.id}`)}>Study</button>
                <button className="btn" onClick={() => nav(`/edit/${d.id}`)}>Edit Notes</button>
                <button className="btn bg-red-600 hover:bg-red-700" onClick={() => onDelete(d.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
