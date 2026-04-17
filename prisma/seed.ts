/**
 * Seed script — run with: npx tsx prisma/seed.ts
 *
 * NOTE for Track A: Please add the following to package.json scripts:
 *   "db:seed": "tsx prisma/seed.ts"
 * and optionally:
 *   "prisma": { "seed": "tsx prisma/seed.ts" }
 *
 * This script is idempotent — uses upsert everywhere so rerunning is safe.
 */
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('[seed] starting...')

  // ─── Users ─────────────────────────────────────────────
  const superAdminHash = await bcrypt.hash('SuperAdmin@2026', 12)
  const bendaharaHash = await bcrypt.hash('Bendahara@2026', 12)

  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@sman1dps.sch.id' },
    update: {
      passwordHash: superAdminHash,
      nama: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
    create: {
      email: 'superadmin@sman1dps.sch.id',
      passwordHash: superAdminHash,
      nama: 'Super Admin',
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  })
  console.log(`[seed] user: ${superAdmin.email}`)

  const bendahara = await prisma.user.upsert({
    where: { email: 'bendahara@sman1dps.sch.id' },
    update: {
      passwordHash: bendaharaHash,
      nama: 'Bendahara',
      role: 'BENDAHARA',
      isActive: true,
    },
    create: {
      email: 'bendahara@sman1dps.sch.id',
      passwordHash: bendaharaHash,
      nama: 'Bendahara',
      role: 'BENDAHARA',
      isActive: true,
    },
  })
  console.log(`[seed] user: ${bendahara.email}`)

  // ─── TahunAjaran aktif ─────────────────────────────────
  const tahun = await prisma.tahunAjaran.upsert({
    where: { kode: '2025/2026' },
    update: {
      tahunMulai: 2025,
      tahunAkhir: 2026,
      tanggalMulai: new Date('2025-07-01'),
      tanggalAkhir: new Date('2026-06-30'),
      isActive: true,
      nominalSppDefault: 350000,
    },
    create: {
      kode: '2025/2026',
      tahunMulai: 2025,
      tahunAkhir: 2026,
      tanggalMulai: new Date('2025-07-01'),
      tanggalAkhir: new Date('2026-06-30'),
      isActive: true,
      nominalSppDefault: 350000,
    },
  })
  console.log(`[seed] tahun ajaran: ${tahun.kode} (active=${tahun.isActive})`)

  // ─── Settings ──────────────────────────────────────────
  const settings: Array<{ key: string; value: unknown; description?: string }> = [
    { key: 'school.name', value: 'SMAN 1 Denpasar', description: 'Nama sekolah' },
    {
      key: 'school.address',
      value: 'Jl Kamboja No 4, Denpasar',
      description: 'Alamat sekolah',
    },
    { key: 'school.npsn', value: '50103017', description: 'NPSN sekolah' },
    { key: 'school.headmaster', value: '', description: 'Nama kepala sekolah' },
    {
      key: 'pdf.header_title',
      value: 'DAFTAR SISWA YANG MEMBAYAR UANG KOMITE',
      description: 'Judul header PDF export',
    },
  ]

  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as never, description: s.description },
      create: { key: s.key, value: s.value as never, description: s.description },
    })
    console.log(`[seed] setting: ${s.key}`)
  }

  console.log('[seed] done')
}

main()
  .catch((err) => {
    console.error('[seed] failed:', err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
