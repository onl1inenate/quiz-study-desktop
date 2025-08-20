import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { deleteDeck, getDeckDetail, updateDeck } from '../lib/api';

export default function EditDeck() {
  const { id = '' } = useParams();
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [text, setText] = useState('');

  const [stats, setStats] = useState<{ total: number; mastered: number; unmastered: number }>({
    total: 0, mastered: 0, unmastered: 0,
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const d = await getDeckDetail(id);
        if (!mounted) return;
        setName(d.name);
        setText(d.text || '');
        setStats({ total: d.totalQuestions, mastered: d.mastered, unmastered: d.unmastered });
      } catch (e: any) {
        alert(e?.message || 'Failed to load deck');
        setError(e?.message || 'Failed to load deck');
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [id]);

  const words = useMemo(() => (text.trim() ? text.trim().split(/\s+/).length : 0), [text]);

  async function onSave() {
    setSaving(true);
    try {
      await updateDeck(id, { name, text, regenerate: false });
      alert('Saved');
    } catch (e: any) {
      alert(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function onSaveAndRegen() {
    if (!confirm('This will replace all existing questions for this deck with newly generated cards. Continue?')) {
      return;
    }
    setRegenLoading(true);
    try {
      const out = await updateDeck(id, { name, text, regenerate: true, batchSize: 150 });
      const total = Number(out?.total ?? 0);
      alert(`Regenerated! New total: ${total}`);
      setStats(s => ({ ...s, total }));
    } catch (e: any) {
      alert(e?.message || 'Failed to regenerate');
    } finally {
      setRegenLoading(false);
    }
  }

  async function onDelete() {
    if (!confirm('Delete this deck? This removes all its questions (attempt history stays).')) return;
    try {
      await deleteDeck(id);
      nav('/'); // back to dashboard
    } catch (e: any) {
      alert(e?.message || 'Failed to delete deck');
    }
  }

  if (loading) {
    return <div className="p-6">Loading…</div>;
  }
  if (error) {
    return <div className="p-6 text-red-600">{error}</div>;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Deck</h1>
        <button className="btn bg-red-600 hover:bg-red-700" onClick={onDelete}>Delete Deck</button>
      </div>

      <div className="grid gap-4">
        <label className="label">Deck name</label>
        <input className="input p-2 border rounded" value={name} onChange={e => setName(e.target.value)} />

        <div className="flex items-center justify-between mt-4">
          <div className="label">Notes (source text)</div>
          <div className="text-xs text-slate-500">Words: {words}</div>
        </div>
        <textarea
          className="input w-full min-h-[320px] p-3 border rounded"
          placeholder="Paste or edit your notes here…"
          value={text}
          onChange={e => setText(e.target.value)}
        />

        <div className="text-sm text-slate-600">
          <span className="badge mr-2">Total: {stats.total}</span>
          <span className="badge mr-2">Mastered: {stats.mastered}</span>
          <span className="badge">Unmastered: {stats.unmastered}</span>
        </div>

        <div className="flex gap-3 mt-2">
          <button className="btn" disabled={saving || regenLoading} onClick={onSave}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            className="btn bg-blue-600 hover:bg-blue-700"
            disabled={saving || regenLoading}
            onClick={onSaveAndRegen}
            title="Save current notes and rebuild the question bank from them"
          >
            {regenLoading ? 'Regenerating…' : 'Save & Regenerate'}
          </button>
        </div>
      </div>
    </div>
  );
}
