import React, { useState } from 'react';
import { createDeck } from '../lib/api';

export default function TextIngest({ onCreated }:{ onCreated: (deckId:string)=>void }) {
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [progressMsg, setProgressMsg] = useState('');

  async function submit() {
    setBusy(true);
    setProgressMsg('Sending to AI… (generates in batches until ≥50)');
    try {
      const r = await createDeck(name, text);
      setProgressMsg(`Created! MCQ: ${r.countsByType.MCQ}, Cloze: ${r.countsByType.CLOZE}, Short: ${r.countsByType.SHORT}, Total: ${r.countsByType.total}`);
      onCreated(r.deckId);
    } catch (e:any) {
      alert(e.message || 'Failed to create deck');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3">
      <div className="text-lg font-semibold">New Deck</div>
      <div>
        <div className="label mb-1">Deck name</div>
        <input className="input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g., Econ T1: Demand/Supply"/>
      </div>
      <div>
        <div className="label mb-1">Paste study text</div>
        <textarea className="input h-64" value={text} onChange={e=>setText(e.target.value)} placeholder="Paste textbook notes…"></textarea>
      </div>
      <div className="flex items-center gap-2">
        <button className="btn" onClick={submit} disabled={busy || !name || text.trim().length < 50}>
          {busy ? 'Generating…' : 'Generate Quiz'}
        </button>
        {progressMsg && <div className="text-sm text-slate-600">{progressMsg}</div>}
      </div>
    </div>
  );
}
