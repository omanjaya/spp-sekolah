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
  // Passwords must be supplied via env. No default/fallback values — prevents
  // shipping known credentials to production.
  const superAdminPwd = process.env.SEED_SUPERADMIN_PASSWORD
  const bendaharaPwd = process.env.SEED_BENDAHARA_PASSWORD
  if (!superAdminPwd || !bendaharaPwd) {
    throw new Error(
      '[seed] SEED_SUPERADMIN_PASSWORD dan SEED_BENDAHARA_PASSWORD wajib di-set di env sebelum menjalankan seed.',
    )
  }
  if (superAdminPwd.length < 12 || bendaharaPwd.length < 12) {
    throw new Error('[seed] Password minimal 12 karakter.')
  }

  const superAdminHash = await bcrypt.hash(superAdminPwd, 12)
  const bendaharaHash = await bcrypt.hash(bendaharaPwd, 12)

  // IMPORTANT: passwordHash hanya diset pada CREATE. Re-run seed TIDAK akan
  // menimpa password user existing (jaga-jaga di prod).
  const superAdmin = await prisma.user.upsert({
    where: { email: 'superadmin@sman1dps.sch.id' },
    update: {
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
