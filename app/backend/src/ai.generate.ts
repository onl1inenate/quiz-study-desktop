import OpenAI from 'openai';
import { ENV } from './env.js';
import { AIGeneratedQuestionArray, AIGeneratedQuestion } from './schemas.js';

const REQUEST_TIMEOUT = (ENV as any).OPENAI_TIMEOUT_MS ?? 1_800_000;
const MAX_RETRIES = (ENV as any).OPENAI_MAX_RETRIES ?? 2;
const client = new OpenAI({
  apiKey: ENV.OPENAI_API_KEY,
  timeout: REQUEST_TIMEOUT
});

const JSON_SCHEMA_NAME = 'question_set';

/** Strict schema (no oneOf/anyOf). `options` is always an object with a,b,c,d. */
const jsonSchemaForAI = {
  name: JSON_SCHEMA_NAME,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['questions'],
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'type',
            'prompt',
            'options',
            'correct_answer',
            'explanation',
            'tags',
            'difficulty'
          ],
          properties: {
            type: { type: 'string', enum: ['MCQ', 'CLOZE', 'SHORT'] },
            prompt: { type: 'string' },
            options: {
              type: 'object',
              additionalProperties: false,
              required: ['a','b','c','d'],
              properties: {
                a: { type: 'string' },
                b: { type: 'string' },
                c: { type: 'string' },
                d: { type: 'string' }
              }
            },
            correct_answer: { type: 'string' },
            explanation: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            difficulty: { type: 'integer', minimum: 1, maximum: 5 }
          }
        }
      }
    }
  }
} as const;

function buildPrompt(batchTarget: number, sourceText: string) {
  return `
Generate high-quality study questions from the following text.

Distribution across the batch:
- 50% MCQ (4 options a/b/c/d; plausible distractors; include distractor rationales inside explanation)
- 25% Cloze (single blank '_____')
- 25% Short Answer

For EVERY question include these exact fields:
- type ("MCQ" | "CLOZE" | "SHORT")
- prompt (string)
- options (object with keys a,b,c,d). For CLOZE/SHORT still include options but set a,b,c,d to "".
- correct_answer (string)
- explanation (string; why the answer is correct; for MCQ mention distractor rationales)
- tags (array of topical strings)
- difficulty (integer 1–5)

Ground everything strictly in the source. Avoid duplicates; vary difficulty and tags.
- Use diverse question stems.
- Include scenario/application prompts.
- Mix straightforward recall with deeper analysis questions.
Write ${batchTarget} total.

SOURCE:
${sourceText}
`;
}

async function withTimeout<T = any>(
  fn: (signal: AbortSignal) => Promise<T>,
  label: string
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    return await fn(controller.signal);
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      throw new Error(`Timeout: ${label} after ${REQUEST_TIMEOUT}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** Extract text from Responses API result without relying on SDK typings. */
function extractOutputText(resp: any): string {
  if (resp?.output_text) return String(resp.output_text);

  // Try to stitch text parts from structured output
  const parts =
    resp?.output?.[0]?.content ??
    resp?.output ??
    [];
  const text = (Array.isArray(parts) ? parts : [parts])
    .map((p: any) => p?.text ?? p?.content?.[0]?.text ?? '')
    .filter(Boolean)
    .join('\n');

  return String(text || '');
}

/** Prefer Responses (text.format), then Chat Completions, then legacy Completions. */
async function callStructuredJSON(prompt: string) {
  const c = client as any;
  if (!c?.responses?.create && !c?.chat?.completions?.create) {
    throw new Error(
      'OpenAI SDK has neither responses.create nor chat.completions.create. ' +
      'Update the SDK: cd app/backend && npm i openai@latest'
    );
  }

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // --- 1) New Responses API ---
    if (c?.responses?.create) {
      try {
        const r = await withTimeout<any>(
          (signal) =>
            c.responses.create(
              {
                model: ENV.OPENAI_MODEL,
                input: prompt,
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: JSON_SCHEMA_NAME,
                    schema: jsonSchemaForAI.schema,
                    strict: true
                  }
                }
              } as any,
              { signal }
            ),
          'responses.create'
        );
        return extractOutputText(r);
      } catch (err) {
        lastError = err;
      }
    }

    // --- 2) Chat Completions (widely available) ---
    if (c?.chat?.completions?.create) {
      try {
        const r2 = await withTimeout<any>(
          (signal) =>
            c.chat.completions.create(
              {
                model: ENV.OPENAI_MODEL,
                messages: [{ role: 'user', content: prompt }],
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: JSON_SCHEMA_NAME,
                    schema: jsonSchemaForAI.schema,
                    strict: true
                  }
                }
              } as any,
              { signal }
            ),
          'chat.completions.create'
        );
        return String(r2?.choices?.[0]?.message?.content ?? '');
      } catch (err) {
        lastError = err;
      }
    }

    if (attempt < MAX_RETRIES) {
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
    }
  }

  throw new Error('OpenAI call failed: ' + (lastError as any)?.message);
}

export async function generateAIBatch(
  text: string,
  batchTarget = ((ENV as any).GEN_BATCH_SIZE ?? 25)
): Promise<AIGeneratedQuestion[]> {
  const content = await callStructuredJSON(buildPrompt(batchTarget, text));
  if (!content) throw new Error('Empty AI response');

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    const repaired = await callStructuredJSON(
`You produced invalid JSON earlier. Repair it to match this schema exactly and return ONLY valid JSON (no commentary).

Schema name: ${JSON_SCHEMA_NAME}

JSON to repair:
${content}`
    );
    parsed = JSON.parse(repaired || '');
  }

  const questionsRaw = parsed?.questions;
  const z = AIGeneratedQuestionArray.safeParse(questionsRaw);
  if (!z.success) {
    throw new Error('AI JSON failed schema validation: ' + z.error.message);
  }

  return z.data;
}

/** Flexible generator:
 * - if minTotal > 0 → generate at least that many
 * - else → keep generating until time budget or maxTotal
 * - deduplicate by normalized (type|prompt)
 */
export async function generateQuestionsFlexible(
  text: string,
  opts: { minTotal?: number; timeBudgetMs?: number; maxTotal?: number } = {}
): Promise<AIGeneratedQuestion[]> {
  const minTotal = opts.minTotal ?? 0;
  const timeBudgetMs = opts.timeBudgetMs ?? ((ENV as any).GEN_TIME_BUDGET_MS ?? 1_800_000);
  const maxTotal = opts.maxTotal ?? ((ENV as any).GEN_MAX_TOTAL ?? 1_000);
  const batchSize = ((ENV as any).GEN_BATCH_SIZE ?? 25);

  const start = Date.now();
  const out: AIGeneratedQuestion[] = [];
  const seen = new Set<string>();
  const key = (q: AIGeneratedQuestion) =>
    (`${q.type}|${q.prompt}`).toLowerCase().replace(/\s+/g, ' ').trim();

  while (out.length < (minTotal > 0 ? minTotal : maxTotal)) {
    if (Date.now() - start > timeBudgetMs) break;

    const need = Math.max(1, minTotal > 0 ? Math.min(batchSize, minTotal - out.length)
                                          : Math.min(batchSize, maxTotal - out.length));
    const batch = await generateAIBatch(text, need);

    for (const q of batch) {
      const k = key(q);
      if (!seen.has(k)) {
        seen.add(k);
        // Ensure options exist for CLOZE/SHORT
        if (!(q as any).options) (q as any).options = { a: '', b: '', c: '', d: '' };
        out.push(q);
        if (minTotal === 0 && out.length >= maxTotal) break;
      }
    }
  }

  return out;
}

/** Back-compat wrapper used elsewhere. */
export async function generateQuestionsAtLeast(text: string, minTotal = 50) {
  return generateQuestionsFlexible(text, { minTotal });
}
