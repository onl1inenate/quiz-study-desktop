import React, { useEffect, useState } from 'react';

type Props = {
  question: { id: string; prompt: string };
  onSubmit: (answer: string) => void;
  disabled?: boolean;
};

export default function QuestionShort({ question, onSubmit, disabled }: Props) {
  const [value, setValue] = useState('');

  // Reset textarea when new question arrives
  useEffect(() => { setValue(''); }, [question.id]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'enter' && value.trim() && !disabled) {
      onSubmit(value);
    }
  }

  return (
    <div className="space-y-3" onKeyDown={handleKeyDown}>
      <div className="whitespace-pre-wrap">{question.prompt}</div>
      <textarea
        className="input"
        style={{ minHeight: 120 }}
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder="Type your answer (⌘/Ctrl + Enter to submit)"
        disabled={disabled}
      />
      <button className="btn" disabled={!value.trim() || disabled} onClick={() => onSubmit(value)}>
        Submit
      </button>
    </div>
  );
}
