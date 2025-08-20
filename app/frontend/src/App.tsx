import React from 'react';
import { Link, Route, Routes, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import NewDeck from './pages/NewDeck';
import Study from './pages/Study';
import EditDeck from './pages/EditDeck';

function Nav() {
  const loc = useLocation();
  const is = (path: string) => loc.pathname.startsWith(path);

  return (
    <div className="w-full border-b bg-white">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
        <Link to="/" className="font-semibold">Quiz-First Study App</Link>
        <div className="flex-1" />
        <Link className={`btn ${is('/') ? 'bg-blue-600 text-white' : ''}`} to="/">Dashboard</Link>
        <Link className={`btn ${is('/new') ? 'bg-blue-600 text-white' : ''}`} to="/new">New Deck</Link>
        <Link className={`btn ${is('/study') ? 'bg-blue-600 text-white' : ''}`} to="/study">Study</Link>
      </div>
    </div>
  );
}

function NotFound() {
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Page not found</h1>
      <p className="text-slate-600 mt-2">
        Go back to the <Link className="text-blue-600 underline" to="/">dashboard</Link>.
      </p>
    </div>
  );
}

export default function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Nav />
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/new" element={<NewDeck />} />
          <Route path="/study" element={<Study />} />
          <Route path="/edit/:id" element={<EditDeck />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}
