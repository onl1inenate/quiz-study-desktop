import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  listFolders,
  type FolderMeta,
  updateDeck,
  deleteDeck,
  createFolder,
  updateFolder,
  deleteFolder,
} from '../lib/api';

export default function Dashboard() {
  const [folders, setFolders] = useState<FolderMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [rename, setRename] = useState<Record<string, string>>({});
  const [folderRename, setFolderRename] = useState<Record<string, string>>({});
  const [newFolder, setNewFolder] = useState('');
  const nav = useNavigate();

  async function refresh() {
    setLoading(true);
    try {
      const f = await listFolders();
      setFolders(f);
      const r: Record<string, string> = {};
      const fr: Record<string, string> = {};
      f.forEach((folder) => {
        fr[folder.id] = folder.name;
        folder.decks.forEach((x) => (r[x.id] = x.name));
      });
      setRename(r);
      setFolderRename(fr);
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

  async function onFolderRename(id: string) {
    try {
      await updateFolder(id, { name: folderRename[id] ?? '' });
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

  async function onFolderDelete(id: string) {
    if (!confirm('Delete this folder and its decks?')) return;
    try {
      await deleteFolder(id);
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    }
  }

  async function onCreateFolder() {
    if (!newFolder.trim()) return;
    try {
      await createFolder(newFolder.trim());
      setNewFolder('');
      await refresh();
    } catch (e: any) {
      alert(e?.message || 'Create failed');
    }
  }

  if (loading) return <div className="p-6">Loading…</div>;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Your Folders</h1>
        <div className="flex gap-2">
          <input
            className="input p-2 border rounded"
            placeholder="New folder"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
          />
          <button className="btn" onClick={onCreateFolder}>Add</button>
        </div>
      </div>

      {!folders.length && <div className="text-slate-500">No folders yet. Create one!</div>}

      <div className="grid gap-8">
        {folders.map((f) => (
          <div key={f.id} className="border rounded p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-lg">{f.name}</div>
              <div className="flex items-center gap-2">
                <input
                  className="input p-2 border rounded"
                  value={folderRename[f.id] ?? ''}
                  onChange={(e) =>
                    setFolderRename((r) => ({ ...r, [f.id]: e.target.value }))
                  }
                />
                <button className="btn" onClick={() => onFolderRename(f.id)}>
                  Save
                </button>
                <Link className="btn" to={`/new?folder=${f.id}`}>
                  New Deck
                </Link>
                <button
                  className="btn bg-red-600 hover:bg-red-700"
                  onClick={() => onFolderDelete(f.id)}
                >
                  Delete
                </button>
              </div>
            </div>

            {!f.decks.length && (
              <div className="text-slate-500">No decks in this folder.</div>
            )}

            <div className="grid gap-4">
              {f.decks.map((d) => (
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
                          onChange={(e) =>
                            setRename((r) => ({ ...r, [d.id]: e.target.value }))
                          }
                        />
                        <button className="btn" onClick={() => onRename(d.id)}>
                          Save
                        </button>
                      </div>
                    </div>

                    <div className="flex md:justify-end items-end gap-2">
                      <button
                        className="btn"
                        onClick={() => nav(`/study?deck=${d.id}`)}
                      >
                        Study
                      </button>
                      <button
                        className="btn"
                        onClick={() => nav(`/edit/${d.id}`)}
                      >
                        Edit Notes
                      </button>
                      <button
                        className="btn bg-red-600 hover:bg-red-700"
                        onClick={() => onDelete(d.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
