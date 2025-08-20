import React, { useEffect, useState } from 'react';

type Props = {
  question: { id: string; prompt: string };
  onSubmit: (answer: string) => void;
  disabled?: boolean;
};

export default function QuestionCloze({ question, onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');

  // Reset input when the question changes
  useEffect(() => { setValue(''); }, [question.id]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && value.trim() && !disabled) onSubmit(value.trim());
  }

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      <div className="whitespace-pre-wrap">{question.prompt}</div>
      <input
        className="input"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Type the missing word/phrase"
        disabled={disabled}
      />
      <button className="btn" disabled={!value.trim() || disabled} onClick={() => onSubmit(value.trim())}>
        Submit
      </button>
    </div>
  );
}
