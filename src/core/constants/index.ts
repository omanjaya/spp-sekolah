/**
 * Application-wide constants.
 * No magic numbers in business code — pull them from here.
 */

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const

export type HttpStatus = (typeof HTTP_STATUS)[keyof typeof HTTP_STATUS]

/**
 * Machine-readable error codes. Clients should branch on `code`, not message.
 */
export const ERROR_CODES = {
  // Client errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_INACTIVE: 'ACCOUNT_INACTIVE',
  // Server errors
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

/**
 * Roles. Must mirror Prisma `Role` enum exactly.
 */
export const ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  BENDAHARA: 'BENDAHARA',
  TU: 'TU',
  VIEWER: 'VIEWER',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const ALL_ROLES: Role[] = [
  ROLES.SUPER_ADMIN,
  ROLES.BENDAHARA,
  ROLES.TU,
  ROLES.VIEWER,
]

/**
 * Session lifetimes (seconds).
 */
export const SESSION = {
  /** Absolute maximum session age — 12 hours. */
  MAX_AGE_SECONDS: 12 * 60 * 60,
  /** Idle timeout before re-issuing the JWT — 30 minutes. */
  UPDATE_AGE_SECONDS: 30 * 60,
} as const

/**
 * Password policy.
 */
export const PASSWORD_POLICY = {
  MIN_LENGTH: 10,
  BCRYPT_COST: 12,
} as const

/**
 * Rate-limit windows (ms) and caps.
 */
export const RATE_LIMITS = {
  LOGIN: { max: 5, windowMs: 60 * 1000 },
  UPLOAD: { max: 10, windowMs: 60 * 1000 },
} as const

/**
 * Pagination defaults.
 */
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const

/**
 * Auth.js cookie names. Must match the v5 defaults we rely on.
 */
export const AUTH_COOKIE = {
  SESSION_TOKEN: 'authjs.session-token',
  SESSION_TOKEN_SECURE: '__Secure-authjs.session-token',
  CALLBACK_URL: 'authjs.callback-url',
  CSRF_TOKEN: 'authjs.csrf-token',
} as const

/**
 * Public paths that must not be gated by auth middleware.
 */
export const PUBLIC_PATHS = [
  '/login',
  '/api/v1/auth',
  '/_next',
  '/favicon.ico',
  '/robots.txt',
] as const
