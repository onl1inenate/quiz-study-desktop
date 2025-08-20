import 'dotenv/config';

export const ENV = {
  PORT: parseInt(process.env.PORT || '3001', 10),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-5-mini', // default → mini
  DATABASE_FILE: process.env.DATABASE_FILE || './data.sqlite',
  USE_OPENAI_GRADING: (process.env.USE_OPENAI_GRADING || 'true').toLowerCase() === 'true',
  OPENAI_TIMEOUT_MS: parseInt(process.env.OPENAI_TIMEOUT_MS || '120000', 10),
  GEN_BATCH_SIZE: parseInt(process.env.GEN_BATCH_SIZE || '25', 10),
  GEN_MAX_TOTAL: parseInt(process.env.GEN_MAX_TOTAL || '1000', 10), // hard safety ceiling
  GEN_TIME_BUDGET_MS: parseInt(process.env.GEN_TIME_BUDGET_MS || '180000', 10) // 3 min default
};

if (!ENV.OPENAI_API_KEY) {
  console.warn('[WARN] OPENAI_API_KEY missing. Generation/grading will fail until provided.');
}
