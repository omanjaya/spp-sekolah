/**
 * Backfill siswa yang belum ada di DB dari file Tagihan asik.bpdbali.
 *
 * Tagihan file berisi daftar lengkap siswa aktif (termasuk yang belum transaksi),
 * sedangkan recon compile hanya berisi siswa yang sudah pernah transaksi. Script
 * ini menambahkan siswa yang belum ada + enroll ke rombel sesuai data tagihan.
 *
 * Usage:
 *   npx tsx scripts/backfill-siswa-from-tagihan.ts <path-to-tagihan.xlsx>
 */

import path from 'node:path'
import ExcelJS from 'exceljs'
import { Grade } from '@prisma/client'
import { prisma } from '../src/lib/db'

const FILE = process.argv[2]
if (!FILE) {
  console.error('Usage: tsx scripts/backfill-siswa-from-tagihan.ts <file.xlsx>')
  process.exit(1)
}

const KELAS_MAP: Record<string, Grade> = {
  'X.': Grade.X, X: Grade.X,
  'XI.': Grade.XI, XI: Grade.XI,
  'XII.': Grade.XII, XII: Grade.XII,
}

function normKelas(v: unknown): Grade | null {
  const s = String(v ?? '').trim().toUpperCase()
  return KELAS_MAP[s] ?? null
}

function parseJurusan(grade: Grade, raw: unknown): { kode: string; nomor: number } | null {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return null
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    if (n < 1 || n > 50) return null
    return { kode: `${grade}.${n}`, nomor: n }
  }
  const m = s.match(/^([A-Z]+)\s*(\d+)$/)
  if (!m) return null
  const program = m[1]!
  const n = Number(m[2]!)
  if (n < 1 || n > 20) return null
  let offset = 0
  switch (program) {
    case 'MIPA':
    case 'IPA':
      offset = 0
      break
    case 'IPS':
      offset = 20
      break
    case 'BB':
    case 'BAHASA':
      offset = 40
      break
    default:
      offset = 60
  }
  return { kode: `${grade}.${program}${n}`, nomor: offset + n }
}

function taStartYear(year: number, month: number): number {
  return month >= 7 ? year : year - 1
}

function taKode(startYear: number): string {
  return `${startYear}/${startYear + 1}`
}

async function main() {
  console.log(`[siswa-backfill] reading ${path.basename(FILE!)} ...`)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(FILE!)
  const ws = wb.worksheets[0]!

  // Column positions (Tagihan format): 2=NIS, 3=Nama, 5=Alamat, 6=Kelas, 7=Jurusan, 8=Tahun, 9=Bulan
  const byNis = new Map<string, {
    nama: string
    alamat: string | null
    observations: Array<{ grade: Grade; jurusanRaw: string; ta: number }>
  }>()

  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r)
    const nis = String(row.getCell(2).value ?? '').trim()
    const nama = String(row.getCell(3).value ?? '').trim()
    const alamat = String(row.getCell(5).value ?? '').trim() || null
    const grade = normKelas(row.getCell(6).value)
    const jurusanRaw = String(row.getCell(7).value ?? '').trim()
    const tahun = Number(row.getCell(8).value)
    const bulan = Number(row.getCell(9).value)
    if (!nis || !nama || !grade || !tahun || !bulan) continue
    const ta = taStartYear(tahun, bulan)
    const existing = byNis.get(nis)
    if (!existing) {
      byNis.set(nis, { nama, alamat, observations: [{ grade, jurusanRaw, ta }] })
    } else {
      // deduplicate by (grade, ta)
      if (!existing.observations.some((o) => o.grade === grade && o.ta === ta)) {
        existing.observations.push({ grade, jurusanRaw, ta })
      }
      if (!existing.alamat && alamat) existing.alamat = alamat
    }
  }
  console.log(`[siswa-backfill] unique siswa in file: ${byNis.size}`)

  // Find which NIS are NOT yet in DB
  const allNis = [...byNis.keys()]
  const existing = await prisma.siswa.findMany({
    where: { nis: { in: allNis } },
    select: { nis: true },
  })
  const existingSet = new Set(existing.map((s) => s.nis))
  const newNis = allNis.filter((n) => !existingSet.has(n))
  console.log(`[siswa-backfill] already in DB: ${existingSet.size}, new to insert: ${newNis.length}`)

  if (newNis.length === 0) {
    console.log('[siswa-backfill] nothing to do.')
    return
  }

  // Prepare TahunAjaran (upsert as needed)
  const taStartYears = new Set<number>()
  for (const info of byNis.values()) for (const o of info.observations) taStartYears.add(o.ta)
  const taKodeToId = new Map<string, string>()
  for (const y of [...taStartYears].sort((a, b) => a - b)) {
    const kode = taKode(y)
    const ta = await prisma.tahunAjaran.upsert({
      where: { kode },
      create: {
        kode,
        tahunMulai: y,
        tahunAkhir: y + 1,
        tanggalMulai: new Date(y, 6, 1),
        tanggalAkhir: new Date(y + 1, 5, 30),
        isActive: false,
        nominalSppDefault: 350_000,
      },
      update: {},
      select: { id: true },
    })
    taKodeToId.set(kode, ta.id)
  }

  // Create siswa + enrollments
  let siswaCount = 0
  let enrollCount = 0
  for (const nis of newNis) {
    const info = byNis.get(nis)!
    // Derive angkatan: min (ta - offset) across observations
    const candidates = info.observations.map((o) => {
      const offset = o.grade === Grade.X ? 0 : o.grade === Grade.XI ? 1 : 2
      return o.ta - offset
    })
    const angkatan = Math.min(...candidates)

    const siswa = await prisma.siswa.create({
      data: {
        nis,
        nama: info.nama,
        angkatan,
        alamat: info.alamat ?? undefined,
      },
      select: { id: true },
    })
    siswaCount += 1

    // Create enrollments per observed TA
    for (const obs of info.observations) {
      const parsed = parseJurusan(obs.grade, obs.jurusanRaw)
      if (!parsed) continue
      const taId = taKodeToId.get(taKode(obs.ta))
      if (!taId) continue
      const rombel = await prisma.rombel.upsert({
        where: { tahunAjaranId_kode: { tahunAjaranId: taId, kode: parsed.kode } },
        create: {
          tahunAjaranId: taId,
          grade: obs.grade,
          nomor: parsed.nomor,
          kode: parsed.kode,
        },
        update: {},
        select: { id: true },
      })
      try {
        await prisma.enrollment.create({
          data: {
            siswaId: siswa.id,
            rombelId: rombel.id,
            tahunAjaranId: taId,
          },
        })
        enrollCount += 1
      } catch {
        // skip duplicate enrollment
      }
    }
    if (siswaCount % 20 === 0) {
      console.log(`[siswa-backfill]   ${siswaCount}/${newNis.length} siswa processed`)
    }
  }

  console.log(`\n=== SUMMARY ===`)
  console.log(`Siswa baru ditambah : ${siswaCount}`)
  console.log(`Enrollment dibuat   : ${enrollCount}`)
  const total = await prisma.siswa.count()
  console.log(`Total siswa sekarang: ${total}`)
}

main()
  .catch((err) => {
    console.error('Failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
