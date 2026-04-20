import NextAuth, { type NextAuthConfig } from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import bcrypt from 'bcryptjs'
import { headers } from 'next/headers'

import { prisma } from '@/lib/db'
import logger from '@/lib/logger'
import { loginSchema } from '@/lib/validators/auth.schema'
import { loginLimiter, getClientIp } from '@/lib/rate-limit'
import { ROLES, SESSION, type Role } from '@/core/constants'

if (process.env.NODE_ENV === 'production') {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error('[auth] AUTH_SECRET must be set in production')
}

/**
 * Auth.js v5 (next-auth@beta) configuration.
 *
 * Notes:
 *  - Credentials provider verifies bcrypt hash against `User.passwordHash`.
 *  - Session strategy: JWT (required for middleware use in edge runtime).
 *  - `authorize` returns `null` for any bad-credentials / inactive-account
 *    case so Auth.js surfaces the generic CredentialsSignin error. Never
 *    leak which side (email vs password) was wrong.
 *  - `events.signIn` updates `lastLoginAt` (best-effort; a DB failure here
 *    must not block an already-successful login).
 */

const isProd = process.env.NODE_ENV === 'production'

export const authConfig = {
  basePath: '/api/v1/auth',
  session: {
    strategy: 'jwt',
    maxAge: SESSION.MAX_AGE_SECONDS,
    updateAge: SESSION.UPDATE_AGE_SECONDS,
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  cookies: {
    sessionToken: {
      name: isProd ? '__Secure-authjs.session-token' : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: isProd,
      },
    },
  },
  trustHost: true,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Kata sandi', type: 'password' },
      },
      async authorize(raw) {
        const rawEmail = (raw as { email?: string }).email ?? 'unknown'
        // Dual-key rate limit — blok per-email DAN per-IP, supaya attacker tidak
        // bisa round-robin banyak email dari satu IP.
        let ip = 'unknown'
        try {
          ip = getClientIp(await headers())
        } catch {
          // headers() mungkin gagal di konteks non-HTTP; fallback 'unknown'.
        }
        const rlEmail = loginLimiter.check(`login:email:${rawEmail}`)
        const rlIp = loginLimiter.check(`login:ip:${ip}`)
        if (!rlEmail.allowed || !rlIp.allowed) {
          logger.warn({ email: rawEmail, ip, emailBlocked: !rlEmail.allowed, ipBlocked: !rlIp.allowed }, 'auth.authorize: rate limited')
          return null
        }

        const parsed = loginSchema.safeParse(raw)
        if (!parsed.success) {
          logger.warn({ issues: parsed.error.flatten() }, 'auth.authorize: invalid input shape')
          return null
        }
        const { email, password } = parsed.data

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            nama: true,
            role: true,
            isActive: true,
            passwordHash: true,
          },
        })

        if (!user) {
          logger.info({ email }, 'auth.authorize: user not found')
          return null
        }

        if (!user.isActive) {
          logger.info({ userId: user.id }, 'auth.authorize: account inactive')
          return null
        }

        const ok = await bcrypt.compare(password, user.passwordHash)
        if (!ok) {
          logger.info({ userId: user.id }, 'auth.authorize: bad password')
          // Best-effort audit — user found but password wrong; userId is known
          void prisma.auditLog.create({
            data: {
              userId: user.id,
              action: 'LOGIN_FAILED',
              entity: 'auth',
              metadata: { reason: 'bad_password' },
            },
          }).catch(() => {})
          return null
        }

        // The returned shape is what Auth.js forwards into the `jwt` callback
        // on first sign-in as the `user` argument.
        return {
          id: user.id,
          userId: user.id,
          email: user.email,
          name: user.nama,
          nama: user.nama,
          role: user.role as Role,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on initial sign-in.
      if (user) {
        token.userId = (user as { userId?: string }).userId ?? (user.id as string)
        token.nama = (user as { nama?: string }).nama ?? (user.name ?? '')
        token.role = (user as { role?: Role }).role ?? ROLES.VIEWER
        if (user.email) token.email = user.email
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.userId = token.userId
        session.user.nama = token.nama
        session.user.role = token.role
        if (token.email) session.user.email = token.email
      }
      return session
    },
  },
  events: {
    async signIn({ user }) {
      const userId = (user as { id?: string; userId?: string }).id ?? (user as { userId?: string }).userId
      if (!userId) return

      // Reset rate limiter on successful login (email only; IP kita biarkan
      // tetap mentally-tracked — mungkin ada attacker share-IP dengan user sah).
      loginLimiter.reset(`login:email:${user.email ?? ''}`)

      try {
        await prisma.user.update({
          where: { id: userId },
          data: { lastLoginAt: new Date() },
        })
      } catch (err) {
        logger.warn({ err, userId }, 'auth.events.signIn: failed to update lastLoginAt')
      }

      // Best-effort audit log — must not block a successful login
      void prisma.auditLog.create({
        data: {
          userId,
          action: 'LOGIN_SUCCESS',
          entity: 'auth',
          metadata: {},
        },
      }).catch(() => {})
    },

    async signOut(message) {
      // `message` is a union — token only present when using JWT strategy
      const token = 'token' in message ? message.token : null
      const userId = (token as { userId?: string } | null)?.userId
      if (!userId) return
      void prisma.auditLog.create({
        data: { userId, action: 'LOGOUT', entity: 'auth' },
      }).catch(() => {})
    },
  },
  logger: {
    error(error) {
      logger.error({ err: error }, 'auth: error')
    },
    warn(code) {
      logger.warn({ code }, 'auth: warn')
    },
    debug() {
      // Swallow debug logs in production; pino logger handles levels.
    },
  },
} satisfies NextAuthConfig

export const { auth, handlers, signIn, signOut } = NextAuth(authConfig)
