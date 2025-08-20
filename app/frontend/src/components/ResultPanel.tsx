import React from 'react';

export default function ResultPanel(props: {
  total: number;
  correct: number;
  masteredInRun: number;
  wrongByType: Record<string, number>;
}) {
  const acc = props.total ? Math.round((props.correct/props.total)*100) : 0;
  return (
    <div className="card space-y-2">
      <div className="text-lg font-semibold">Session Results</div>
      <div>Accuracy: <span className="font-semibold">{acc}%</span> ({props.correct}/{props.total})</div>
      <div>Mastered this run: <span className="font-semibold">{props.masteredInRun}</span></div>
      <div className="text-sm text-slate-600">Missed by type: {Object.entries(props.wrongByType).map(([k,v]) => <span key={k} className="badge mr-1">{k}:{v}</span>)}</div>
    </div>
  );
}
