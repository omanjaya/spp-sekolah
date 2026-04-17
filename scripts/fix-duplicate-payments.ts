/**
 * Fix duplikat pembayaran dengan roll-forward.
 *
 * Setelah backfill `recon compile.xlsx`, ada 43 kombinasi (siswa, tahun, bulan)
 * yang punya ≥2 transaksi positif di source — semua dianggap pembayaran valid
 * (double-pay di bulan yang sama, bukan refund). Unique constraint
 * `(siswaId, periodYear, periodMonth)` di DB menyebabkan 55 transaksi extra
 * ter-skip saat backfill.
 *
 * Script ini:
 *  1. Untuk tiap pair duplikat, positif pertama di-keep di periode asli.
 *     Catatan di-update menjelaskan ada duplikat.
 *  2. Positif ke-2, ke-3, dst di-roll-forward ke periode berikutnya yang
 *     belum dibayar (dalam SPP window siswa: 36 bulan Jul-angkatan → Jun-lulus).
 *     Catatan: "Roll-forward dari duplikat bayar periode YYYY-MM".
 *  3. Amount negatif (kalau ada) diabaikan — system noise dari BPD.
 *
 * Jalankan:  npx tsx scripts/fix-duplicate-payments.ts [--apply]
 *
 * Tanpa `--apply` = dry-run.
 */

import path from 'node:path'
import ExcelJS from 'exceljs'
import { PaymentSource } from '@prisma/client'
import { prisma } from '../src/lib/db'

const SOURCE_FILE = path.join(__dirname, 'backfill-data', 'recon-compile.xlsx')
const APPLY = process.argv.includes('--apply')

interface SourceTx {
  nis: string
  periodYear: number
  periodMonth: number
  tgl: Date
  noBukti: string
  kodeCabang: string | null
  tellerUser: string | null
  amount: number
}

function cellStr(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v).trim()
}

function cellNum(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = Number(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

function cellDate(v: unknown): Date | null {
  if (v instanceof Date) return v
  return null
}

async function parseSource(): Promise<SourceTx[]> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(SOURCE_FILE)
  const ws = wb.worksheets[0]!
  const rows: SourceTx[] = []
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r)
    const nis = cellStr(row.getCell(2).value)
    const py = row.getCell(11).value
    const pm = row.getCell(12).value
    const tgl = cellDate(row.getCell(15).value)
    const nobukti = cellStr(row.getCell(21).value)
    const amount = cellNum(row.getCell(4).value)
    const kodeCabang = cellStr(row.getCell(18).value) || null
    const tellerUser = cellStr(row.getCell(19).value) || null
    if (!nis || !py || !pm || !tgl || !nobukti || amount <= 0) continue
    rows.push({
      nis,
      periodYear: Number(py),
      periodMonth: Number(pm),
      tgl,
      noBukti: nobukti,
      kodeCabang,
      tellerUser,
      amount,
    })
  }
  return rows
}

function groupKey(nis: string, y: number, m: number): string {
  return `${nis}|${y}|${String(m).padStart(2, '0')}`
}

function monthKey(y: number, m: number): string {
  return `${y}|${String(m).padStart(2, '0')}`
}

/** Enumerate SPP window periodes for an angkatan: Jul(a) .. Jun(a+3) — 36 months. */
function sppPeriods(angkatan: number): Array<{ y: number; m: number }> {
  const out: Array<{ y: number; m: number }> = []
  // Year offsets: X = a (Jul a - Jun a+1), XI = a+1, XII = a+2
  for (let grade = 0; grade < 3; grade += 1) {
    for (let month = 7; month <= 12; month += 1) out.push({ y: angkatan + grade, m: month })
    for (let month = 1; month <= 6; month += 1) out.push({ y: angkatan + grade + 1, m: month })
  }
  return out
}

async function main() {
  const startTs = Date.now()
  console.log('[fix-dup] parsing source file...')
  const rows = await parseSource()
  console.log(`[fix-dup] positive transactions: ${rows.length}`)

  // Group by (nis, year, month)
  const groups = new Map<string, SourceTx[]>()
  for (const tx of rows) {
    const k = groupKey(tx.nis, tx.periodYear, tx.periodMonth)
    const arr = groups.get(k) ?? []
    arr.push(tx)
    groups.set(k, arr)
  }

  const duplicates = [...groups.entries()].filter(([, v]) => v.length > 1)
  console.log(`[fix-dup] duplicate groups: ${duplicates.length}`)
  const totalExtras = duplicates.reduce((s, [, v]) => s + (v.length - 1), 0)
  console.log(`[fix-dup] total extra transactions to roll-forward: ${totalExtras}`)
  console.log('')

  // Pre-load all affected siswa + their paid periodes
  const affectedNis = new Set(duplicates.map(([, txs]) => txs[0]!.nis))
  const siswas = await prisma.siswa.findMany({
    where: { nis: { in: [...affectedNis] } },
    select: { id: true, nis: true, nama: true, angkatan: true },
  })
  const siswaByNis = new Map(siswas.map((s) => [s.nis, s]))

  const existingPayments = await prisma.pembayaran.findMany({
    where: { siswaId: { in: siswas.map((s) => s.id) } },
    select: { id: true, siswaId: true, periodYear: true, periodMonth: true, noBukti: true, catatan: true },
  })
  const paidByS: Map<string, Set<string>> = new Map()
  for (const p of existingPayments) {
    const s = paidByS.get(p.siswaId) ?? new Set()
    s.add(monthKey(p.periodYear, p.periodMonth))
    paidByS.set(p.siswaId, s)
  }

  interface PlannedUpdate {
    id: string
    catatan: string
  }
  interface PlannedInsert {
    siswaId: string
    nis: string
    nama: string
    fromPeriod: string
    toPeriod: { y: number; m: number }
    tx: SourceTx
    catatan: string
    skipReason?: 'no_slot_in_window'
  }

  const updates: PlannedUpdate[] = []
  const inserts: PlannedInsert[] = []
  const skipped: PlannedInsert[] = []

  for (const [key, txs] of duplicates) {
    const [nis, yStr, mStr] = key.split('|') as [string, string, string]
    const y = Number(yStr)
    const m = Number(mStr)
    const siswa = siswaByNis.get(nis)
    if (!siswa) continue
    const txsAsc = [...txs].sort((a, b) => a.tgl.getTime() - b.tgl.getTime())
    const firstTx = txsAsc[0]!
    const extras = txsAsc.slice(1)

    // Find the current DB row for (siswa, y, m)
    const dbRow = existingPayments.find(
      (p) => p.siswaId === siswa.id && p.periodYear === y && p.periodMonth === m,
    )

    // Update original row's catatan
    if (dbRow) {
      const rollForwardInfo = extras.length > 0
        ? ` ${extras.length} transaksi dipindah ke bulan berikutnya.`
        : ''
      const catatan =
        `Duplikat bayar: total ${txsAsc.length} transaksi tercatat untuk periode ${y}-${String(m).padStart(2, '0')}.${rollForwardInfo}`
      if (dbRow.catatan !== catatan) {
        updates.push({ id: dbRow.id, catatan })
      }
    }

    // Roll-forward extras
    const paidSet = paidByS.get(siswa.id) ?? new Set<string>()
    const window = sppPeriods(siswa.angkatan)
    const startIdx = window.findIndex((p) => p.y === y && p.m === m)
    // Allocate sequentially after the duplicate periode
    for (const extra of extras) {
      let placed: { y: number; m: number } | null = null
      const searchFrom = startIdx >= 0 ? startIdx + 1 : 0
      for (let i = searchFrom; i < window.length; i += 1) {
        const p = window[i]!
        if (!paidSet.has(monthKey(p.y, p.m))) {
          placed = p
          paidSet.add(monthKey(p.y, p.m)) // reserve
          break
        }
      }
      const plan: PlannedInsert = {
        siswaId: siswa.id,
        nis: siswa.nis,
        nama: siswa.nama,
        fromPeriod: `${y}-${String(m).padStart(2, '0')}`,
        toPeriod: placed ?? { y: 0, m: 0 },
        tx: extra,
        catatan: placed
          ? `Roll-forward dari duplikat bayar periode ${y}-${String(m).padStart(2, '0')} (bukti asli ${extra.noBukti}).`
          : 'Duplikat bayar — tidak ada periode SPP tersisa untuk roll-forward. Perlu review.',
        skipReason: placed ? undefined : 'no_slot_in_window',
      }
      if (placed) inserts.push(plan)
      else skipped.push(plan)
    }
    paidByS.set(siswa.id, paidSet)
  }

  console.log(`[fix-dup] planned updates (catatan on existing rows): ${updates.length}`)
  console.log(`[fix-dup] planned inserts (roll-forward)             : ${inserts.length}`)
  console.log(`[fix-dup] skipped (no slot in SPP window)            : ${skipped.length}`)
  console.log('')

  console.log('=== Sample roll-forward (first 8) ===')
  for (const p of inserts.slice(0, 8)) {
    console.log(
      `  NIS ${p.nis.padEnd(6)}  ${p.fromPeriod} → ${p.toPeriod.y}-${String(p.toPeriod.m).padStart(2, '0')}  ` +
        `(bukti ${p.tx.noBukti}, Rp ${p.tx.amount.toLocaleString('id-ID')})`,
    )
  }
  if (skipped.length > 0) {
    console.log('\n=== Skipped (no slot) ===')
    for (const p of skipped) {
      console.log(`  NIS ${p.nis}  asal ${p.fromPeriod}  bukti ${p.tx.noBukti}`)
    }
  }

  if (!APPLY) {
    console.log('\n[dry-run] add --apply to commit.')
    return
  }

  console.log(`\n[fix-dup] applying in transaction...`)

  await prisma.$transaction(async (tx) => {
    for (const u of updates) {
      await tx.pembayaran.update({
        where: { id: u.id },
        data: { catatan: u.catatan },
      })
    }
    for (const p of inserts) {
      await tx.pembayaran.create({
        data: {
          siswaId: p.siswaId,
          periodYear: p.toPeriod.y,
          periodMonth: p.toPeriod.m,
          amount: p.tx.amount,
          biayaAdm: 0,
          tanggalTransaksi: p.tx.tgl,
          noBukti: p.tx.noBukti,
          kodeCabang: p.tx.kodeCabang,
          tellerUser: p.tx.tellerUser,
          statusBayar: 'TERBAYAR',
          source: PaymentSource.IMPORT_EXCEL,
          catatan: p.catatan,
        },
      })
    }
  })

  // Audit
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    })
    if (admin) {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: admin.id } },
          action: 'FIX_DUPLICATE_PAYMENTS',
          entity: 'Pembayaran',
          metadata: {
            duplicateGroups: duplicates.length,
            catatanUpdates: updates.length,
            rollForwardInserts: inserts.length,
            skipped: skipped.length,
            script: 'scripts/fix-duplicate-payments.ts',
          },
        },
      })
    }
  } catch {
    /* best-effort */
  }

  const elapsed = ((Date.now() - startTs) / 1000).toFixed(1)
  console.log(`\n=== DONE in ${elapsed}s ===`)
  console.log(`Catatan updated        : ${updates.length}`)
  console.log(`Roll-forward inserted  : ${inserts.length}`)
  console.log(`Skipped (no slot)      : ${skipped.length}`)
}

main()
  .catch((err) => {
    console.error('Failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
