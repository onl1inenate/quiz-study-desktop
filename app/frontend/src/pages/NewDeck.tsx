import React, { useState } from 'react';
import { createDeck } from '../lib/api';
import { useNavigate } from 'react-router-dom';

export default function NewDeck() {
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);

  async function onCreate() {
    if (!name.trim() || !text.trim()) {
      alert('Please enter a deck name and some notes.');
      return;
    }
    setLoading(true);
    try {
      const out = await createDeck(name.trim(), text.trim());
      alert('Deck created!');
      nav(`/edit/${out.deckId}`); // jump into editor for further tweaks if desired
    } catch (e: any) {
      alert(e?.message || 'Failed to create deck');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Create a Deck</h1>

      <div>
        <label className="label">Deck name</label>
        <input
          className="input p-2 border rounded w-full"
          placeholder="e.g. Economics – Chapter 3"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label className="label">Paste study text</label>
        <textarea
          className="input p-3 border rounded w-full min-h-[320px]"
          placeholder="Paste notes, textbook excerpts, slides text…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </div>

      <button className="btn bg-blue-600 hover:bg-blue-700" disabled={loading} onClick={onCreate}>
        {loading ? 'Generating…' : 'Generate Deck'}
      </button>
    </div>
  );
}
