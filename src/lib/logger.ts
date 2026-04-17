/**
 * Pino logger.
 *
 * - Plain JSON output (works everywhere: Node, Next.js edge, worker threads)
 * - Log level from process.env.LOG_LEVEL (fallback: 'info')
 * - Redacts common sensitive fields
 *
 * Note: pino-pretty's worker-thread transport crashes under Next.js bundling,
 * so we emit JSON directly. Pipe `npm run dev` through `pino-pretty` in a
 * terminal if you want colored local output:
 *   `npm run dev | npx pino-pretty`
 *
 * Usage: `import logger from '@/lib/logger'`
 */
import pino, { type LoggerOptions } from 'pino'

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'password',
      'passwordHash',
      'authorization',
      '*.password',
      '*.passwordHash',
      '*.authorization',
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    censor: '[REDACTED]',
  },
  base: undefined, // drop pid/hostname noise
}

const logger = pino(options)

export default logger
