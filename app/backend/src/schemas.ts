import { z } from 'zod';

export const QuestionType = z.enum(['MCQ','CLOZE','SHORT']);
export type QuestionTypeT = z.infer<typeof QuestionType>;

export const MCQOptions = z.object({
  a: z.string(),
  b: z.string(),
  c: z.string(),
  d: z.string()
});

export const QuestionSchema = z.object({
  id: z.string().uuid(),
  deckId: z.string().uuid(),
  type: QuestionType,
  prompt: z.string().min(1),
  options: MCQOptions.optional(),
  correct_answer: z.string().min(1),
  explanation: z.string().min(1),
  tags: z.array(z.string()).default([]),
  difficulty: z.number().int().min(1).max(5)
});
export type Question = z.infer<typeof QuestionSchema>;
export const QuestionArraySchema = z.array(QuestionSchema);

export const AIGeneratedQuestionSchema = z.object({
  type: QuestionType,
  prompt: z.string().min(1),
  options: MCQOptions.optional().nullable(),   // <-- allow null or missing
  correct_answer: z.string().min(1),
  explanation: z.string().min(1),
  tags: z.array(z.string()).default([]),
  difficulty: z.number().int().min(1).max(5)
});
export type AIGeneratedQuestion = z.infer<typeof AIGeneratedQuestionSchema>;
export const AIGeneratedQuestionArray = z.array(AIGeneratedQuestionSchema);

export const CreateDeckReq = z.object({
  name: z.string().min(1),
  text: z.string().min(1)
});

export const QuizSessionReq = z.object({
  deckId: z.string().uuid(),
  count: z.number().int().min(1).max(100).default(10),
  mode: z.enum(['Mixed','Weak','Due']).default('Mixed')
});

export const SubmitReq = z.object({
  questionId: z.string().uuid(),
  userAnswer: z.string().min(1)
});
