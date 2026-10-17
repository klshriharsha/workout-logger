import { z } from 'zod'

// Shared by the sign-in form (client) and /api/auth (server).

/** Digits in the emailed sign-in code. Matches `otp_length` in supabase/config.toml and the hosted project. */
export const SIGN_IN_CODE_LENGTH = 6

// Normalised before it's checked, so " Me@Example.com" is the same account as "me@example.com".
export const emailSchema = z
  .string('Enter your email address')
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254, 'Email is too long'))

export const requestCodeSchema = z.object({
  email: emailSchema,
})

export const verifyCodeSchema = z.object({
  email: emailSchema,
  code: z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`), `Enter the ${SIGN_IN_CODE_LENGTH}-digit code from the email`),
})

/**
 * Where to go after signing in: a path on this site, or home. Never another origin, so a crafted
 * `?next=` link can't bounce someone off to a lookalike site once they've signed in.
 */
export function safeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}
