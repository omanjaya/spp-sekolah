import type { DefaultSession, DefaultUser } from 'next-auth'
import type { JWT as DefaultJWT } from 'next-auth/jwt'
import type { Role } from '@/core/constants'

declare module 'next-auth' {
  interface Session {
    user: {
      userId: string
      email: string
      nama: string
      role: Role
    } & DefaultSession['user']
  }

  interface User extends DefaultUser {
    userId: string
    nama: string
    role: Role
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    userId: string
    nama: string
    role: Role
  }
}
