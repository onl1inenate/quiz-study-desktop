import React, { useEffect, useMemo, useState } from 'react';
import { submitAnswer } from '../lib/api';
import QuestionMCQ from './QuestionMCQ';
import QuestionCloze from './QuestionCloze';
import QuestionShort from './QuestionShort';
import QueueStats from './QueueStats';

export type QuizQuestion = {
  id: string;
  deckId: string;
  type: 'MCQ' | 'CLOZE' | 'SHORT';
  prompt: string;
  learning_content?: string;
  options?: { a: string; b: string; c: string; d: string };
  answerMap?: { a: string; b: string; c: string; d: string };
};

type Props = {
  questions: QuizQuestion[];
  learningMode?: boolean;
  onExit: () => void;
};

type Graded = {
  questionId: string;
  isCorrect: boolean;
  correct_answer: string;
  user_answer: string;
  correct_definition: string;
  user_definition: string;
  explanation: string;
};

export default function QuizRunner({ questions, learningMode, onExit }: Props) {
  // Determine deck and localStorage key for progress persistence
  const deckId = questions[0]?.deckId;
  const storageKey = deckId ? `session-${deckId}` : null;

  // Maintain a mutable queue so questions can be re-enqueued or removed.
  const [queue, setQueue] = useState<QuizQuestion[]>(() => [...questions]);
  const [phase, setPhase] = useState<'answer' | 'review' | 'done'>('answer');
  const [loading, setLoading] = useState(false);
  const [graded, setGraded] = useState<Graded[]>([]);
  // Track consecutive correct streak per question id.
  const [streaks, setStreaks] = useState<Record<string, number>>({});
  const [asked, setAsked] = useState(0);

  const current = queue[0];

  // Defensive: MCQ renderer will always get an options object
  const safeOptions = useMemo(
    () =>
      current?.options && typeof current.options === 'object'
        ? current.options
        : { a: '', b: '', c: '', d: '' },
    [current]
  );

  const safeMap = useMemo(
    () =>
      current?.answerMap && typeof current.answerMap === 'object'
        ? current.answerMap
        : { a: 'a', b: 'b', c: 'c', d: 'd' },
    [current]
  );

  async function onSubmitUserAnswer(answer: string) {
    if (!current || loading || phase !== 'answer') return;
    setLoading(true);
    try {
      const r = await submitAnswer(current.id, answer);
      const entry = {
        questionId: current.id,
        isCorrect: r.isCorrect,
        correct_answer: r.correct_answer,
        user_answer: r.user_answer,
        correct_definition: r.correct_definition,
        user_definition: r.user_definition,
        explanation: r.explanation,
      };
      setGraded(g => {
        const updated = [...g, entry];
        if (storageKey) {
          const answered = updated.map(x => x.questionId);
          try {
            localStorage.setItem(storageKey, JSON.stringify({ answered }));
          } catch {}
        }
        return updated;
      });
      setPhase('review');
    } catch (e: any) {
      alert(e?.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  }

  // Convert a question to a harder form for re-queueing after mistakes.
  function transformQuestion(q: QuizQuestion): QuizQuestion {
    if (q.type === 'MCQ' || q.type === 'CLOZE') {
      return { id: q.id, deckId: q.deckId, type: 'SHORT', prompt: q.prompt, learning_content: q.learning_content };
    }
    return q;
  }

  function goNext() {
    if (!current) return;
    const last = graded[graded.length - 1];
    const rest = queue.slice(1);
    let newQueue = rest;

    // Re-enqueue incorrectly answered questions in a harder form
    if (last && !last.isCorrect) {
      newQueue = [...newQueue, transformQuestion(current)];
    }

    setQueue(newQueue);
    setAsked(a => a + 1);
    setPhase(newQueue.length === 0 ? 'done' : 'answer');
  }

  const correctCount = graded.filter(g => g.isCorrect).length;

  function clearProgress() {
    if (storageKey) {
      try {
        localStorage.removeItem(storageKey);
      } catch {}
    }
  }

  function handleExit() {
    clearProgress();
    onExit();
  }

  useEffect(() => {
    if (phase === 'done') {
      clearProgress();
    }
  }, [phase]);

  if (!current && phase !== 'done') {
    // Nothing to show (empty session)
    return (
      <div className="card">
        <div className="text-slate-600">No questions available.</div>
        <div className="mt-3">
          <button className="btn" onClick={handleExit}>Back</button>
        </div>
      </div>
    );
  }

  if (phase === 'done') {
    return (
      <div className="card space-y-3">
        <h3 className="text-lg font-semibold">Session complete</h3>
        <div className="text-slate-700">
          Score: {correctCount} / {graded.length} ({graded.length ? Math.round((correctCount / graded.length) * 100) : 0}%)
        </div>
        <div className="mt-4">
          <QueueStats />
        </div>
        <button className="btn" onClick={handleExit}>Back to picker</button>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-medium">Question {asked + 1} / {asked + queue.length}</div>
        <div className="text-sm text-slate-600">{current?.type}</div>
      </div>

      {learningMode && current?.learning_content && (
        <div className="p-3 rounded bg-sky-50 whitespace-pre-wrap">
          {current.learning_content}
        </div>
      )}

      {/* Render question component here… */}
      {current?.type === 'MCQ' && (
        <QuestionMCQ
          key={current.id}
          question={{ id: current.id, prompt: current.prompt, options: safeOptions, answerMap: safeMap }}
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
          <div className="text-sm space-y-1">
            {/*
            <div>
              <span className="font-medium">Your Answer:</span> {graded[graded.length - 1].user_answer}
              {' '}
              <span className="text-slate-600">– {graded[graded.length - 1].user_definition || 'No definition available.'}</span>
            </div>
            */}
            <div>
              <span className="font-medium">Correct Answer:</span> {graded[graded.length - 1].correct_answer}
            </div>
            <div className="whitespace-pre-wrap">{graded[graded.length - 1].explanation}</div>
          </div>
          <div className="mt-3">
            <button className="btn" onClick={goNext}>Next</button>
          </div>
        </div>
      )}

      <div className="mt-4">
        <QueueStats />
      </div>

      <button className="btn mt-4" onClick={goNext} disabled={loading || phase !== 'answer'}>
        Next Question
      </button>
    </div>
  );
}
