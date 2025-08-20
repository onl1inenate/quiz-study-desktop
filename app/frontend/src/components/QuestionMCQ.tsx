import React, { useEffect, useState } from 'react';

type Props = {
  question: {
    id: string;
    prompt: string;
    options: { a: string; b: string; c: string; d: string };
  };
  onSubmit: (answer: string) => void;
  disabled?: boolean;
};

export default function QuestionMCQ({ question, onSubmit, disabled }: Props) {
  const [selected, setSelected] = useState<string>('');

  // Reset selection on every new question
  useEffect(() => {
    setSelected('');
  }, [question.id]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && selected && !disabled) onSubmit(selected);
  }

  const groupName = `mcq-${question.id}`; // unique group prevents carry-over

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      <div className="whitespace-pre-wrap">{question.prompt}</div>
      {(['a','b','c','d'] as const).map((k) => (
        <label key={k} className="flex items-center gap-2 p-2 rounded border cursor-pointer">
          <input
            type="radio"
            name={groupName}
            value={k}
            checked={selected === k}
            onChange={() => setSelected(k)}
            disabled={disabled}
          />
          <span className="font-medium uppercase">{k}.</span>
          <span className="flex-1">{question.options[k]}</span>
        </label>
      ))}
      <div className="pt-1">
        <button className="btn" disabled={!selected || disabled} onClick={() => onSubmit(selected)}>
          Submit
        </button>
      </div>
    </div>
  );
}
