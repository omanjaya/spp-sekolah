/**
 * Backfill historical data dari 2 file Excel:
 *   - scripts/backfill-data/recon-compile.xlsx  (kompilasi transaksi 2019–2026)
 *   - scripts/backfill-data/tagihan.xlsx        (master tagihan current period)
 *
 * Flow:
 *   1. Parse recon compile sebagai primary source (44k rows, 2,452 siswa)
 *   2. Merge dengan tagihan file untuk siswa yang belum ada
 *   3. Derive angkatan per siswa (tahun pertama di Kelas X)
 *   4. Upsert TahunAjaran, Rombel, Siswa, Enrollment, Pembayaran
 *   5. Create ImportBatch record untuk audit
 *
 * Run:  npx tsx scripts/backfill.ts
 */

import path from 'node:path'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import { Grade, PaymentSource, type Prisma } from '@prisma/client'
import { prisma } from '../src/lib/db'

const DATA_DIR = path.join(__dirname, 'backfill-data')
const RECON_FILE = path.join(DATA_DIR, 'recon-compile.xlsx')
const TAGIHAN_FILE = path.join(DATA_DIR, 'tagihan.xlsx')

// ─── Helpers ───────────────────────────────────────────────

const KELAS_MAP: Record<string, Grade> = {
  'X.': Grade.X,
  X: Grade.X,
  'XI.': Grade.XI,
  XI: Grade.XI,
  'XII.': Grade.XII,
  XII: Grade.XII,
}

function normKelas(v: unknown): Grade | null {
  const s = String(v ?? '').trim().toUpperCase()
  return KELAS_MAP[s] ?? null
}

/**
 * Parse Jurusan → { kode, nomor } where:
 *   - "1".."12"   → { kode: `${grade}.${n}`, nomor: n }
 *   - "MIPA1".."MIPA9" → { kode: `${grade}.MIPA${n}`, nomor: n }
 *   - "IPS1".."IPS2"   → { kode: `${grade}.IPS${n}`, nomor: 20 + n }  (offset to avoid clash)
 *   - "BB1".."BB2"     → { kode: `${grade}.BB${n}`, nomor: 30 + n }
 * Returns null if unparseable.
 */
function parseJurusan(grade: Grade, raw: unknown): { kode: string; nomor: number } | null {
  const s = String(raw ?? '').trim().toUpperCase()
  if (!s) return null
  // Pure number
  if (/^\d+$/.test(s)) {
    const n = Number(s)
    if (n < 1 || n > 50) return null
    return { kode: `${grade}.${n}`, nomor: n }
  }
  // MIPA<n> / IPS<n> / IPA<n> / etc
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

function ptr(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') {
    if (v instanceof Date) return v.toISOString()
    if ('text' in v && typeof v.text === 'string') return v.text
    if ('result' in v) return String(v.result ?? '')
    return JSON.stringify(v)
  }
  return String(v)
}

function cellNum(cell: ExcelJS.Cell): number | null {
  const v = cell.value
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return v
  const s = String(v).replace(/[^\d.-]/g, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

function cellDate(cell: ExcelJS.Cell): Date | null {
  const v = cell.value
  if (v === null || v === undefined) return null
  if (v instanceof Date) return v
  if (typeof v === 'string' && v.length >= 8) {
    const parts = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
    if (parts) {
      return new Date(
        Number(parts[3]),
        Number(parts[2]) - 1,
        Number(parts[1]),
        Number(parts[4] ?? 0),
        Number(parts[5] ?? 0),
        Number(parts[6] ?? 0),
      )
    }
  }
  return null
}

/**
 * TA_startYear = year if month >= 7 else year - 1.
 * E.g. periode SPP bulan=3 tahun=2024 → TA 2023/2024 (TA_startYear=2023).
 */
function taStartYear(year: number, month: number): number {
  return month >= 7 ? year : year - 1
}

function taKode(startYear: number): string {
  return `${startYear}/${startYear + 1}`
}

// ─── Parsed row types ──────────────────────────────────────

interface ReconRow {
  nis: string
  nama: string
  kelas: Grade
  jurusanRaw: string
  periodYear: number
  periodMonth: number
  amount: number
  biayaAdm: number
  tanggalTransaksi: Date
  kodeCabang: string | null
  tellerUser: string | null
  statusTerbayar: boolean
  noBukti: string
  alamat: string | null
}

async function parseRecon(filePath: string): Promise<ReconRow[]> {
  console.log(`[recon] reading ${path.basename(filePath)} ...`)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const ws = wb.worksheets[0]!
  const rows: ReconRow[] = []
  let skipped = 0

  // Header at row 1
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r)
    const nis = ptr(row.getCell(2)).trim()
    const nama = ptr(row.getCell(3)).trim()
    const kelas = normKelas(row.getCell(9).value)
    const jurusanRaw = ptr(row.getCell(10)).trim()
    const periodYear = cellNum(row.getCell(11))
    const periodMonth = cellNum(row.getCell(12))
    const amount = cellNum(row.getCell(4)) ?? 0
    const tgl = cellDate(row.getCell(15))
    const stsBayar = ptr(row.getCell(17)).trim()
    const kdCab = ptr(row.getCell(18)).trim() || null
    const kdUser = ptr(row.getCell(19)).trim() || null
    const noBukti = ptr(row.getCell(21)).trim()
    const alamat = ptr(row.getCell(8)).trim() || null
    const terbayar = stsBayar === '1' || stsBayar.toLowerCase() === 'terbayar'

    if (!nis || !kelas || !periodYear || !periodMonth || !tgl || !noBukti || !terbayar) {
      skipped += 1
      continue
    }

    rows.push({
      nis,
      nama,
      kelas,
      jurusanRaw,
      periodYear,
      periodMonth,
      amount: amount > 0 ? amount : 350_000,
      biayaAdm: 0,
      tanggalTransaksi: tgl,
      kodeCabang: kdCab,
      tellerUser: kdUser,
      statusTerbayar: true,
      noBukti,
      alamat,
    })
  }

  console.log(`[recon] parsed=${rows.length}, skipped=${skipped}`)
  return rows
}

interface TagihanRow {
  nis: string
  nama: string
  kelas: Grade
  jurusanRaw: string
  periodYear: number
  periodMonth: number
  alamat: string | null
}

async function parseTagihan(filePath: string): Promise<TagihanRow[]> {
  console.log(`[tagihan] reading ${path.basename(filePath)} ...`)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)
  const ws = wb.worksheets[0]!
  const rows: TagihanRow[] = []
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r)
    const nis = ptr(row.getCell(2)).trim()
    const nama = ptr(row.getCell(3)).trim()
    const kelas = normKelas(row.getCell(6).value)
    const jurusanRaw = ptr(row.getCell(7)).trim()
    const periodYear = cellNum(row.getCell(8))
    const periodMonth = cellNum(row.getCell(9))
    const alamat = ptr(row.getCell(5)).trim() || null
    if (!nis || !kelas || !periodYear || !periodMonth) continue
    rows.push({ nis, nama, kelas, jurusanRaw, periodYear, periodMonth, alamat })
  }
  console.log(`[tagihan] parsed=${rows.length}`)
  return rows
}

// ─── Main backfill ────────────────────────────────────────

async function main() {
  const superadmin = await prisma.user.findUnique({
    where: { email: 'superadmin@sman1dps.sch.id' },
    select: { id: true },
  })
  if (!superadmin) throw new Error('superadmin user not found — run seed first')

  const reconRows = await parseRecon(RECON_FILE)
  const tagihanRows = await parseTagihan(TAGIHAN_FILE)

  // ─── 1. Siswa master ─────────────────────────────────
  // For each NIS: collect (kelas, taStartYear, jurusanRaw) observations to derive angkatan.
  interface SiswaObservation {
    nama: string
    alamat: string | null
    ta: Map<number, { kelas: Grade; jurusanRaw: string }> // ta_startYear → obs
  }
  const byNis = new Map<string, SiswaObservation>()

  const ingest = (
    nis: string,
    nama: string,
    kelas: Grade,
    jurusanRaw: string,
    py: number,
    pm: number,
    alamat: string | null,
  ) => {
    const taY = taStartYear(py, pm)
    const existing = byNis.get(nis)
    if (!existing) {
      byNis.set(nis, {
        nama,
        alamat,
        ta: new Map([[taY, { kelas, jurusanRaw }]]),
      })
    } else {
      if (!existing.ta.has(taY)) existing.ta.set(taY, { kelas, jurusanRaw })
      if (!existing.alamat && alamat) existing.alamat = alamat
    }
  }

  for (const r of reconRows) ingest(r.nis, r.nama, r.kelas, r.jurusanRaw, r.periodYear, r.periodMonth, r.alamat)
  for (const r of tagihanRows) ingest(r.nis, r.nama, r.kelas, r.jurusanRaw, r.periodYear, r.periodMonth, r.alamat)

  console.log(`[siswa] unique NIS: ${byNis.size}`)

  // Derive angkatan per siswa:
  //   For each observed (ta, kelas), normalize to angkatan = ta - (0 if X, 1 if XI, 2 if XII)
  //   Take minimum (most reliable = earliest reference).
  const siswaData = new Map<string, { nama: string; alamat: string | null; angkatan: number }>()
  for (const [nis, obs] of byNis) {
    const candidates: number[] = []
    for (const [ta, { kelas }] of obs.ta) {
      const offset = kelas === Grade.X ? 0 : kelas === Grade.XI ? 1 : 2
      candidates.push(ta - offset)
    }
    const angkatan = Math.min(...candidates)
    siswaData.set(nis, { nama: obs.nama, alamat: obs.alamat, angkatan })
  }

  // Upsert siswa
  console.log(`[siswa] upserting ${siswaData.size}...`)
  let siswaCreated = 0
  const nisToId = new Map<string, string>()
  let i = 0
  for (const [nis, info] of siswaData) {
    const s = await prisma.siswa.upsert({
      where: { nis },
      create: {
        nis,
        nama: info.nama,
        angkatan: info.angkatan,
        alamat: info.alamat ?? undefined,
      },
      update: {
        nama: info.nama,
        angkatan: info.angkatan,
        alamat: info.alamat ?? undefined,
      },
      select: { id: true, createdAt: true },
    })
    nisToId.set(nis, s.id)
    // crude check for created vs updated
    if (Date.now() - s.createdAt.getTime() < 60_000) siswaCreated += 1
    i += 1
    if (i % 200 === 0) console.log(`[siswa]   ${i}/${siswaData.size}`)
  }
  console.log(`[siswa] done — created≈${siswaCreated}, total=${siswaData.size}`)

  // ─── 2. TahunAjaran ──────────────────────────────────
  const taStartYears = new Set<number>()
  for (const obs of byNis.values()) for (const ta of obs.ta.keys()) taStartYears.add(ta)
  for (const r of reconRows) taStartYears.add(taStartYear(r.periodYear, r.periodMonth))

  const sortedTaYears = [...taStartYears].sort((a, b) => a - b)
  const taKodeToId = new Map<string, string>()
  for (const y of sortedTaYears) {
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
  // Set latest as active
  const latestTa = taKode(sortedTaYears[sortedTaYears.length - 1]!)
  await prisma.tahunAjaran.updateMany({ data: { isActive: false } })
  await prisma.tahunAjaran.update({ where: { kode: latestTa }, data: { isActive: true } })
  console.log(`[tahun-ajaran] ${sortedTaYears.length} TA (active=${latestTa})`)

  // ─── 3. Rombel ────────────────────────────────────────
  // Collect unique (taStartYear, grade, jurusanRaw) and upsert.
  const rombelSet = new Set<string>() // key: ta|grade|jurusanRaw
  for (const r of reconRows) {
    const ta = taStartYear(r.periodYear, r.periodMonth)
    rombelSet.add(`${ta}|${r.kelas}|${r.jurusanRaw}`)
  }
  for (const r of tagihanRows) {
    const ta = taStartYear(r.periodYear, r.periodMonth)
    rombelSet.add(`${ta}|${r.kelas}|${r.jurusanRaw}`)
  }

  const rombelKey = (taY: number, grade: Grade, jurusanRaw: string) =>
    `${taY}|${grade}|${jurusanRaw}`
  const rombelIdByKey = new Map<string, string>()

  let rombelSkipped = 0
  for (const key of rombelSet) {
    const [taYStr, grade, jurusanRaw] = key.split('|') as [string, Grade, string]
    const taY = Number(taYStr)
    const parsed = parseJurusan(grade, jurusanRaw)
    if (!parsed) {
      rombelSkipped += 1
      continue
    }
    const taId = taKodeToId.get(taKode(taY))!
    const rombel = await prisma.rombel.upsert({
      where: {
        tahunAjaranId_kode: { tahunAjaranId: taId, kode: parsed.kode },
      },
      create: {
        tahunAjaranId: taId,
        grade,
        nomor: parsed.nomor,
        kode: parsed.kode,
      },
      update: {},
      select: { id: true },
    })
    rombelIdByKey.set(key, rombel.id)
  }
  console.log(`[rombel] created/upserted=${rombelIdByKey.size}, skipped(unparseable jurusan)=${rombelSkipped}`)

  // ─── 4. Enrollment ───────────────────────────────────
  // For each siswa × observed TA, create Enrollment if rombel exists.
  const enrollInputs: Prisma.EnrollmentCreateManyInput[] = []
  for (const [nis, obs] of byNis) {
    const siswaId = nisToId.get(nis)!
    for (const [taY, { kelas, jurusanRaw }] of obs.ta) {
      const rombelId = rombelIdByKey.get(rombelKey(taY, kelas, jurusanRaw))
      if (!rombelId) continue
      enrollInputs.push({
        siswaId,
        rombelId,
        tahunAjaranId: taKodeToId.get(taKode(taY))!,
      })
    }
  }
  const enrollRes = await prisma.enrollment.createMany({ data: enrollInputs, skipDuplicates: true })
  console.log(`[enrollment] inserted=${enrollRes.count}, total attempts=${enrollInputs.length}`)

  // ─── 5. Import batch (audit anchor) ──────────────────
  const reconBuf = readFileSync(RECON_FILE)
  const fileHash = createHash('sha256').update(reconBuf).digest('hex')

  let batch = await prisma.importBatch.findFirst({
    where: { fileHash },
    orderBy: { uploadedAt: 'desc' },
  })
  if (!batch) {
    batch = await prisma.importBatch.create({
      data: {
        fileName: 'recon-compile.xlsx (backfill)',
        fileSize: reconBuf.length,
        fileHash,
        uploadedBy: superadmin.id,
        totalRows: reconRows.length,
        status: 'PROCESSING',
      },
    })
  } else {
    console.log(`[import-batch] already exists (id=${batch.id}) — reusing`)
  }

  // ─── 6. Pembayaran ───────────────────────────────────
  console.log(`[pembayaran] inserting ${reconRows.length} rows in chunks of 1000...`)
  let inserted = 0
  let dupSkipped = 0
  const CHUNK = 1000
  for (let start = 0; start < reconRows.length; start += CHUNK) {
    const chunk = reconRows.slice(start, start + CHUNK)
    const inputs: Prisma.PembayaranCreateManyInput[] = []
    for (const r of chunk) {
      const siswaId = nisToId.get(r.nis)
      if (!siswaId) continue
      inputs.push({
        siswaId,
        periodYear: r.periodYear,
        periodMonth: r.periodMonth,
        amount: r.amount,
        biayaAdm: r.biayaAdm,
        tanggalTransaksi: r.tanggalTransaksi,
        noBukti: r.noBukti,
        kodeCabang: r.kodeCabang,
        tellerUser: r.tellerUser,
        statusBayar: 'TERBAYAR',
        source: PaymentSource.IMPORT_EXCEL,
        importBatchId: batch.id,
      })
    }
    const res = await prisma.pembayaran.createMany({ data: inputs, skipDuplicates: true })
    inserted += res.count
    dupSkipped += inputs.length - res.count
    process.stdout.write(`\r[pembayaran]   ${Math.min(start + CHUNK, reconRows.length)}/${reconRows.length} (inserted=${inserted}, dup-skipped=${dupSkipped})   `)
  }
  process.stdout.write('\n')

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      successCount: inserted,
      duplicateCount: dupSkipped,
      errorCount: 0,
      status: 'COMPLETED',
    },
  })

  // ─── Summary ─────────────────────────────────────────
  console.log('\n─── SUMMARY ───')
  const [siswaTotal, rombelTotal, enrollTotal, pembayaranTotal] = await Promise.all([
    prisma.siswa.count(),
    prisma.rombel.count(),
    prisma.enrollment.count(),
    prisma.pembayaran.count(),
  ])
  console.log(`Siswa         : ${siswaTotal}`)
  console.log(`Tahun Ajaran  : ${sortedTaYears.length}`)
  console.log(`Rombel        : ${rombelTotal}`)
  console.log(`Enrollment    : ${enrollTotal}`)
  console.log(`Pembayaran    : ${pembayaranTotal}`)
  console.log(`Batch ID      : ${batch.id}`)
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
