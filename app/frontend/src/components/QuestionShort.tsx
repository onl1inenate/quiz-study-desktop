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
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      value.trim() &&
      !disabled
    ) {
      e.preventDefault();
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
        placeholder="Type your answer (Enter to submit, Shift+Enter for newline)"
        disabled={disabled}
      />
      <button className="btn" disabled={!value.trim() || disabled} onClick={() => onSubmit(value)}>
        Submit
      </button>
    </div>
  );
}
