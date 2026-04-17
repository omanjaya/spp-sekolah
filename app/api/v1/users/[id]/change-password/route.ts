import type { NextRequest } from 'next/server'

import { apiHandler, requireAuth, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { ForbiddenError } from '@/core/errors'
import { idSchema } from '@/lib/validators/common.schema'
import {
  adminChangePasswordSchema,
  selfChangePasswordSchema,
} from '@/lib/validators/user.schema'
import { userService } from '@/services/user.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

function pickId(raw: string | string[] | undefined): string {
  const v = Array.isArray(raw) ? raw[0] : raw
  return idSchema.parse(v)
}

/**
 * Rules:
 *  - SUPER_ADMIN bisa reset password user lain (tanpa currentPassword).
 *  - User bisa ganti password-nya sendiri (butuh currentPassword).
 */
export async function POST(req: NextRequest, ctx: RouteParams): Promise<Response> {
  return apiHandler(async () => {
    const me = await requireAuth()
    const { id } = await ctx.params
    const targetId = pickId(id)
    const payload = (await req.json()) as unknown

    if (me.userId === targetId) {
      const body = selfChangePasswordSchema.parse(payload)
      await userService.selfChangePassword(targetId, body)
      return { id: targetId }
    }

    // Bukan diri sendiri -> harus SUPER_ADMIN.
    if (me.role !== ROLES.SUPER_ADMIN) {
      throw new ForbiddenError()
    }
    // Re-verify via requireRole (konsistensi + audit side-effects future-proof).
    await requireRole([ROLES.SUPER_ADMIN])
    const body = adminChangePasswordSchema.parse(payload)
    await userService.adminChangePassword(targetId, body)
    return { id: targetId }
  })(req)
}
