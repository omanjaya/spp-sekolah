import { apiHandler, requireAuth } from '@/lib/api-handler'
import { NotFoundError } from '@/core/errors'
import { prisma } from '@/lib/db'
import { buildMatrix } from '@/services/matrix-data.service'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export const GET = apiHandler<unknown, { id: string }>(async (_req, ctx) => {
  await requireAuth()
  const { id } = await ctx.params

  const siswa = await prisma.siswa.findUnique({
    where: { id },
    select: {
      id: true,
      angkatan: true,
      enrollments: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { rombelId: true, rombel: { select: { tahunAjaran: { select: { isActive: true } } } } },
      },
    },
  })

  if (!siswa) throw new NotFoundError('Siswa tidak ditemukan.')

  const rombelId = siswa.enrollments[0]?.rombelId
  const matrix = await buildMatrix({
    angkatan: siswa.angkatan,
    rombelId: rombelId ?? undefined,
  })

  const rombels = matrix.rombels.map((r) => ({
    ...r,
    siswa: r.siswa.filter((s) => s.id === id),
  }))

  return { ...matrix, rombels }
})
