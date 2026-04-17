import type { Role } from '@/core/constants'

/**
 * Shape of the user object we put inside the JWT and expose on `session.user`.
 * Kept separate from the NextAuth module augmentation so service/server code
 * can import it without pulling `next-auth` types.
 */
export interface AuthUser {
  userId: string
  email: string
  nama: string
  role: Role
}

export interface AuthSession {
  user: AuthUser
  expires: string
}
