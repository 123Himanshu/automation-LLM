import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  BASIC_AUTH_USERNAME: z.string().min(1),
  BASIC_AUTH_PASSWORD: z.string().min(6),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_ENDPOINT: z.string().optional(),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(200).default(50),
  AI_PROVIDER: z.enum(['openai', 'groq']).default('openai'),
  AI_API_KEY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  AI_BASE_URL: z.string().url().optional(),
  AI_MODEL: z.string().optional(),
  AI_MAX_TOKENS: z.coerce.number().int().default(4096),
  PORT: z.coerce.number().int().default(4000),
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Environment validation failed:\n${formatted}`);
  }
  return result.data;
}
