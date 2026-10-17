import { randomBytes, scrypt, timingSafeEqual, type BinaryLike } from 'node:crypto'

// Stored as `scrypt$<salt>$<key>` (base64url). Node's default scrypt cost (N=16384, r=8, p=1).
const KEY_LENGTH = 64

const derive = (password: string, salt: BinaryLike) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password.normalize('NFKC'), salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key))),
  )

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  const key = await derive(password, salt)

  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`
}

// Checked against when the account doesn't exist, so a wrong email takes as long as a wrong
// password and response times don't reveal who has an account.
const decoy = hashPassword(randomBytes(16).toString('hex'))

/** Whether `password` matches `stored`. A missing hash (no such account, or no password yet) never matches. */
export async function verifyPassword(password: string, stored: string | null | undefined) {
  const [scheme, salt, key] = (stored ?? (await decoy)).split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false

  const expected = Buffer.from(key, 'base64url')
  const actual = await derive(password, Buffer.from(salt, 'base64url'))

  return Boolean(stored) && timingSafeEqual(actual, expected)
}
