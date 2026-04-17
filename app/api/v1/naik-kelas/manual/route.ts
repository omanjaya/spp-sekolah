import { z } from 'zod'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { prisma } from '@/lib/db'
import { ConflictError, NotFoundError } from '@/core/errors'
import { auditLogRepo } from '@/repositories/audit-log.repo'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const bodySchema = z.object({
  siswaId: z.string().min(1),
  rombelKode: z.string().trim().min(1, 'Rombel tujuan wajib diisi.'),
  tahunAjaranId: z.string().min(1),
})

export const POST = apiHandler(async (req) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])
  const body = bodySchema.parse(await req.json())

  const [siswa, ta] = await Promise.all([
    prisma.siswa.findUnique({
      where: { id: body.siswaId },
      select: { id: true, nis: true, nama: true },
    }),
    prisma.tahunAjaran.findUnique({
      where: { id: body.tahunAjaranId },
      select: { id: true, kode: true },
    }),
  ])

  if (!siswa) throw new NotFoundError('Siswa tidak ditemukan.')
  if (!ta) throw new NotFoundError('Tahun ajaran tidak ditemukan.')

  const existing = await prisma.enrollment.findUnique({
    where: {
      siswaId_tahunAjaranId: {
        siswaId: siswa.id,
        tahunAjaranId: ta.id,
      },
    },
  })
  if (existing) {
    throw new ConflictError(
      `${siswa.nama} (${siswa.nis}) sudah ter-assign di TA ${ta.kode}. Hapus enrollment lama dulu jika ingin pindah rombel.`,
    )
  }

  const kode = body.rombelKode.trim()
  const gradeMatch = kode.match(/^(X{1,3}|XII|XI|X)\./)
  const grade = gradeMatch
    ? (gradeMatch[1] as 'X' | 'XI' | 'XII')
    : kode.startsWith('XII')
      ? 'XII'
      : kode.startsWith('XI')
        ? 'XI'
        : 'X'

  const nomorMatch = kode.match(/\.(\d+)$/)
  const nomor = nomorMatch ? Number(nomorMatch[1]) : 1

  let rombel = await prisma.rombel.findFirst({
    where: { tahunAjaranId: ta.id, kode },
  })

  if (!rombel) {
    rombel = await prisma.rombel.create({
      data: {
        tahunAjaranId: ta.id,
        grade,
        nomor,
        kode,
      },
    })
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      siswaId: siswa.id,
      rombelId: rombel.id,
      tahunAjaranId: ta.id,
    },
  })

  await auditLogRepo
    .create({
      user: { connect: { id: actor.userId } },
      action: 'NAIK_KELAS_MANUAL',
      entity: 'Enrollment',
      entityId: enrollment.id,
      metadata: {
        nis: siswa.nis,
        nama: siswa.nama,
        rombelKode: kode,
        tahunAjaran: ta.kode,
      },
    })
    .catch(() => {})

  return {
    enrollmentId: enrollment.id,
    nis: siswa.nis,
    nama: siswa.nama,
    rombelKode: kode,
    tahunAjaran: ta.kode,
  }
})
