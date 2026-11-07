import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import {
  pembayaranCancelSchema,
  pembayaranUpdateSchema,
} from '@/lib/validators/pembayaran.schema'
import { pembayaranService } from '@/services/pembayaran.service'

type RouteParams = { params: Promise<{ id: string }> }

export const GET = apiHandler<unknown, { id: string }>(async (_req, ctx) => {
  await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA, ROLES.TU, ROLES.VIEWER])
  const { id } = await ctx.params
  return pembayaranService.getById(id)
})

export const PATCH = apiHandler<unknown, { id: string }>(async (req: NextRequest, ctx) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const { id } = await ctx.params
  const body = pembayaranUpdateSchema.parse(await req.json())
  return pembayaranService.update(id, body, actor)
})

export const DELETE = apiHandler<unknown, { id: string }>(async (req: NextRequest, ctx) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN])
  const { id } = await ctx.params
  const body = pembayaranCancelSchema.parse(await req.json())
  return pembayaranService.cancel(id, body.catatan, actor)
})

export type { RouteParams }
