import OpenAI from 'openai';
import { ENV } from '../env.js';

const REQUEST_TIMEOUT = (ENV as any).OPENAI_TIMEOUT_MS ?? 1_800_000;
const client = new OpenAI({
  apiKey: ENV.OPENAI_API_KEY,
  timeout: REQUEST_TIMEOUT
});

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function gradeMCQ(userAnswer: string, correct: string) {
  const ua = normalize(userAnswer);
  const ca = normalize(correct);
  if (['a','b','c','d'].includes(ua) && ua === ca) return true;
  return ua === ca;
}

export function gradeCloze(userAnswer: string, correct: string) {
  return normalize(userAnswer) === normalize(correct);
}

export async function gradeShortAnswer(userAnswer: string, correct: string, explanation: string): Promise<boolean> {
  const txt = (correct + ' ' + explanation).toLowerCase();
  const words = Array.from(new Set(txt.match(/[a-z0-9\-]+/g) || []))
    .filter(w => w.length > 3 && !['this','that','with','from','which','their','there','these','those','into','about','because','between','might','could','would','shall'].includes(w));

  const keywords = words.slice(0, 8);
  const ans = normalize(userAnswer);
  const hits = keywords.filter(k => ans.includes(k)).length;

  if (!ENV.USE_OPENAI_GRADING) {
    return hits >= Math.max(2, Math.floor(keywords.length * 0.25));
  }

  const prompt = `
You are a strict grader. Given a user's short answer, the expected correct answer, and a brief explanation, return ONLY "TRUE" if the user's answer demonstrates knowledge equivalent to the correct answer (allow synonyms and paraphrases), otherwise "FALSE".

User Answer: ${userAnswer}
Correct Answer: ${correct}
Why (explanation): ${explanation}

Output only TRUE or FALSE.
`;

  try {
    const anyClient = client as any;

    if (anyClient.responses?.create) {
      const resp = await anyClient.responses.create({
        model: ENV.OPENAI_MODEL,
        input: prompt
      } as any);
      const text = (resp.output_text?.trim().toUpperCase() || '');
      if (text.includes('TRUE')) return true;
      if (text.includes('FALSE')) return false;
    } else if (anyClient.chat?.completions?.create) {
      const r = await anyClient.chat.completions.create({
        model: ENV.OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }]
      } as any);
      const text = (r.choices?.[0]?.message?.content ?? '').trim().toUpperCase();
      if (text.includes('TRUE')) return true;
      if (text.includes('FALSE')) return false;
    }

    return hits >= Math.max(2, Math.floor(keywords.length * 0.25));
  } catch {
    return hits >= Math.max(2, Math.floor(keywords.length * 0.25));
  }
}
