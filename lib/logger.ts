import pino from 'pino'
import pinoPretty from 'pino-pretty'
import { config } from '@/lib/config'

const isDev = process.env.NODE_ENV !== 'production'

// In development, pipe through pino-pretty as a plain stream (not a `transport`,
// which spawns a worker thread that Turbopack can't resolve). In production the
// logger keeps emitting newline-delimited JSON for log collectors to parse.
export const logger = isDev
  ? pino(
      { level: config.LOG_LEVEL },
      pinoPretty({
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
        errorLikeObjectKeys: ['err', 'error'],
      }),
    )
  : pino({ level: config.LOG_LEVEL })
