// Sets (or resets) an account's password: `pnpm set-password you@example.com`.
//
// There's no email, so no "forgot password" link: this is how a password gets reset, and how an
// account carried over from the emailed-code days gets its first one. Reads DATABASE_URL from
// .env.local (or the environment), so point that at the database you mean to change.

import { stdin, stdout } from 'node:process'
import postgres from 'postgres'
import { emailSchema, signUpSchema } from '../lib/auth-schema.ts'
import { hashPassword } from '../lib/password.ts'

/** Reads a line from the terminal without echoing it. */
function promptHidden(question: string) {
  stdout.write(question)
  stdin.setRawMode(true)
  stdin.setEncoding('utf8')
  stdin.resume()

  return new Promise<string>((resolve) => {
    let value = ''
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\u0003') process.exit(130) // Ctrl-C
        if (char === '\r' || char === '\n') {
          stdin.off('data', onData)
          stdin.setRawMode(false)
          stdin.pause()
          stdout.write('\n')
          return resolve(value)
        }
        value = char === '\u007f' ? value.slice(0, -1) : value + char
      }
    }
    stdin.on('data', onData)
  })
}

function fail(message: string): never {
  console.error(message)
  process.exit(1)
}

const email = emailSchema.safeParse(process.argv[2])
if (!email.success) fail('Usage: pnpm set-password <email>')
if (!process.env.DATABASE_URL) fail('DATABASE_URL is not set (see .env.example).')
if (!stdin.isTTY) fail('Run this in a terminal: it asks for the password.')

const password = await promptHidden('New password: ')
const valid = signUpSchema.shape.password.safeParse(password)
if (!valid.success) fail(valid.error.issues[0].message)
if ((await promptHidden('Repeat it: ')) !== password) fail('The passwords don’t match.')

const sql = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 })
try {
  const updated = await sql`
    update public.users set password_hash = ${await hashPassword(password)} where email = ${email.data}
  `
  if (updated.count === 0) fail(`No account for ${email.data}. To create one, sign up in the app.`)

  // A new password signs out every device, in case the old one was the problem.
  await sql`delete from public.sessions where user_id = (select id from public.users where email = ${email.data})`
  console.log(`Password set for ${email.data}.`)
} finally {
  await sql.end()
}
