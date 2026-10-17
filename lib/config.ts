import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string().startsWith('postgres', 'DATABASE_URL must be a postgres:// connection string'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
})

const parsedEnv = envSchema.safeParse(process.env)

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`).join('\n')

  throw new Error(`Invalid environment configuration:\n${issues}`)
}

export const config = parsedEnv.data
