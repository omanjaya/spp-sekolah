import type { NextRequest } from 'next/server'

import { apiHandler, requireRole, type RouteContext } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { kwitansiUpdateSchema } from '@/lib/validators/kwitansi.schema'
import { kwitansiService } from '@/services/kwitansi.service'

export const GET = apiHandler(async (_req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU, ROLES.VIEWER])
  const { id } = await ctx.params
  return kwitansiService.getById(id)
})

export const PATCH = apiHandler(async (req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const { id } = await ctx.params
  const body = kwitansiUpdateSchema.parse(await req.json())
  return kwitansiService.update(id, body)
})

export const DELETE = apiHandler(async (_req: NextRequest, ctx: RouteContext<{ id: string }>) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const { id } = await ctx.params
  await kwitansiService.delete(id)
  return { message: 'Kwitansi berhasil dihapus.' }
})
