import { z } from 'zod'

// Shared by the sign-in form (client) and /api/auth (server).

export const PASSWORD_MIN_LENGTH = 8

// Normalised before it's checked, so " Me@Example.com" is the same account as "me@example.com".
export const emailSchema = z
  .string('Enter your email address')
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254, 'Email is too long'))

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string('Enter your password').min(1, 'Enter your password').max(200, 'Password is too long'),
})

export const signUpSchema = z.object({
  email: emailSchema,
  password: z
    .string('Choose a password')
    .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(200, 'Password is too long'),
})

/**
 * Where to go after signing in: a path on this site, or home. Never another origin, so a crafted
 * `?next=` link can't bounce someone off to a lookalike site once they've signed in.
 */
export function safeNextPath(next: string | null | undefined) {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}
