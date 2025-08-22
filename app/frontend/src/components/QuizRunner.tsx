import React, { useMemo, useState } from 'react';
import { submitAnswer, startSession } from '../lib/api';
import QuestionMCQ from './QuestionMCQ';
import QuestionCloze from './QuestionCloze';
import QuestionShort from './QuestionShort';

export type QuizQuestion = {
  id: string;
  deckId: string;
  type: 'MCQ' | 'CLOZE' | 'SHORT';
  prompt: string;
  options?: { a: string; b: string; c: string; d: string };
};

type Props = {
  questions: QuizQuestion[];
  onExit: () => void;
};

type Graded = {
  questionId: string;
  isCorrect: boolean;
  correct_answer: string;
  explanation: string;
};

export default function QuizRunner({ questions, onExit }: Props) {
  const [qList, setQList] = useState(questions);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<'answer' | 'review' | 'done'>('answer');
  const [loading, setLoading] = useState(false);
  const [graded, setGraded] = useState<Graded[]>([]);
  const [streak, setStreak] = useState(0);
  const [difficulty, setDifficulty] = useState<'easy'|'medium'|'hard'>('easy');

  const current = useMemo(() => qList[idx], [qList, idx]);

  // Defensive: MCQ renderer will always get an options object
  const safeOptions = useMemo(
    () =>
      current?.options && typeof current.options === 'object'
        ? current.options
        : { a: '', b: '', c: '', d: '' },
    [current]
  );

  async function onSubmitUserAnswer(answer: string) {
    if (!current || loading || phase !== 'answer') return;
    setLoading(true);
    try {
      const r = await submitAnswer(current.id, answer);
      setGraded(g => [
        ...g,
        {
          questionId: current.id,
          isCorrect: r.isCorrect,
          correct_answer: r.correct_answer,
          explanation: r.explanation,
        },
      ]);
      const nextStreak = r.isCorrect ? streak + 1 : 0;
      setStreak(nextStreak);
      if (r.isCorrect && nextStreak >= 3 && difficulty !== 'hard') {
        const nextDiff = difficulty === 'easy' ? 'medium' : 'hard';
        try {
          const deckId = qList[0]?.deckId;
          if (deckId) {
            const extra = await startSession(deckId, 5, 'Mixed', nextDiff);
            if (extra && extra.length) {
              setQList(qs => [...qs, ...extra]);
              setDifficulty(nextDiff);
            }
          }
        } catch {}
        setStreak(0);
      }
      setPhase('review');
    } catch (e: any) {
      alert(e?.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  }

  function goNext() {
    if (idx + 1 >= qList.length) {
      setPhase('done');
    } else {
      setIdx(i => i + 1);
      setPhase('answer'); // next question starts fresh
    }
  }

  const correctCount = graded.filter(g => g.isCorrect).length;

  if (!current && phase !== 'done') {
    // Nothing to show (empty session)
    return (
      <div className="card">
        <div className="text-slate-600">No questions available.</div>
        <div className="mt-3"><button className="btn" onClick={onExit}>Back</button></div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="card space-y-3">
        <h3 className="text-lg font-semibold">Session complete</h3>
        <div className="text-slate-700">
          Score: {correctCount} / {qList.length} ({Math.round((correctCount / qList.length) * 100)}%)
        </div>
        <button className="btn" onClick={onExit}>Back to picker</button>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">Question {idx + 1} / {qList.length}</div>
        <div className="text-sm text-slate-600">{current?.type}</div>
      </div>

      {/* Render the correct question UI.
          Key by question id to force remount (inputs reset). */}
      {current?.type === 'MCQ' && (
        <QuestionMCQ
          key={current.id}
          question={{ id: current.id, prompt: current.prompt, options: safeOptions }}
          onSubmit={onSubmitUserAnswer}
          disabled={loading || phase !== 'answer'}
        />
      )}
      {current?.type === 'CLOZE' && (
        <QuestionCloze
          key={current.id}
          question={{ id: current.id, prompt: current.prompt }}
          onSubmit={onSubmitUserAnswer}
          disabled={loading || phase !== 'answer'}
        />
      )}
      {current?.type === 'SHORT' && (
        <QuestionShort
          key={current.id}
          question={{ id: current.id, prompt: current.prompt }}
          onSubmit={onSubmitUserAnswer}
          disabled={loading || phase !== 'answer'}
        />
      )}

      {/* Review panel */}
      {phase === 'review' && graded.length > 0 && (
        <div className="p-3 rounded border bg-slate-50">
          <div className="font-semibold mb-1">
            {graded[graded.length - 1].isCorrect ? 'Correct ✅' : 'Incorrect ❌'}
          </div>
          <div className="text-sm">
            <div><span className="font-medium">Answer:</span> {graded[graded.length - 1].correct_answer}</div>
            <div className="mt-1 whitespace-pre-wrap">{graded[graded.length - 1].explanation}</div>
          </div>
          <div className="mt-3">
            <button className="btn" onClick={goNext}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
