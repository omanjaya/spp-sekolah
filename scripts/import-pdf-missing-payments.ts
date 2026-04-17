/**
 * Import pembayaran yang ada di PDF tapi tidak ada di DB.
 * Pattern: bendahara terima cash → catat di PDF arsip → tidak lewat recon BPD.
 *
 * Source data: /tmp/missing_payments.json (dari scan_pdf_vs_db.py).
 * Target: Pembayaran dengan source=MANUAL, noBukti=null, catatan eksplisit.
 *
 * Usage:  npx tsx scripts/import-pdf-missing-payments.ts [--apply]
 */

import { readFileSync } from 'node:fs'
import { PaymentSource } from '@prisma/client'
import { prisma } from '../src/lib/db'

const APPLY = process.argv.includes('--apply')
const INPUT = './scripts/missing_payments.json'
const NOMINAL = 350_000

interface MissingEntry {
  nis: string
  nama: string
  rombel: number
  periodYear: number
  periodMonth: number
  tanggalBayar: string // "DD/MM/YYYY"
}

function parseDDMMYYYY(s: string): Date | null {
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd))
  return Number.isNaN(d.getTime()) ? null : d
}

async function main() {
  const entries = JSON.parse(readFileSync(INPUT, 'utf-8')) as MissingEntry[]
  console.log(`[import] loaded ${entries.length} missing payments`)

  const nisSet = new Set(entries.map((e) => e.nis))
  const siswas = await prisma.siswa.findMany({
    where: { nis: { in: [...nisSet] } },
    select: { id: true, nis: true, nama: true },
  })
  const byNis = new Map(siswas.map((s) => [s.nis, s]))

  // Plan + filter
  interface Plan extends MissingEntry {
    siswaId: string
    tgl: Date
  }
  const plans: Plan[] = []
  const skipped: string[] = []
  for (const e of entries) {
    const siswa = byNis.get(e.nis)
    if (!siswa) {
      skipped.push(`NIS ${e.nis} tidak ada di master`)
      continue
    }
    const tgl = parseDDMMYYYY(e.tanggalBayar)
    if (!tgl) {
      skipped.push(`NIS ${e.nis} periode ${e.periodYear}-${e.periodMonth}: tanggal invalid`)
      continue
    }
    plans.push({ ...e, siswaId: siswa.id, tgl })
  }

  console.log('\n=== PLAN ===')
  console.log(`Ready to insert : ${plans.length}`)
  console.log(`Skipped         : ${skipped.length}`)
  if (skipped.length > 0) {
    console.log('\nSkipped details:')
    for (const s of skipped) console.log(`  - ${s}`)
  }

  const totalNominal = plans.length * NOMINAL
  console.log(`\nTotal nominal masuk: Rp ${totalNominal.toLocaleString('id-ID')}`)

  if (!APPLY) {
    console.log('\n[dry-run] add --apply to commit.')
    return
  }

  console.log('\n[import] applying one-by-one (respect unique constraint)...')
  let inserted = 0
  let duplicate = 0
  let failed = 0
  for (const p of plans) {
    try {
      const existing = await prisma.pembayaran.findUnique({
        where: {
          siswaId_periodYear_periodMonth: {
            siswaId: p.siswaId,
            periodYear: p.periodYear,
            periodMonth: p.periodMonth,
          },
        },
      })
      if (existing) {
        duplicate += 1
        continue
      }
      await prisma.pembayaran.create({
        data: {
          siswaId: p.siswaId,
          periodYear: p.periodYear,
          periodMonth: p.periodMonth,
          amount: NOMINAL,
          biayaAdm: 0,
          tanggalTransaksi: p.tgl,
          noBukti: null,
          kodeCabang: null,
          tellerUser: null,
          statusBayar: 'TERBAYAR',
          source: PaymentSource.MANUAL,
          catatan: `Import dari PDF arsip rombel XII.${p.rombel} — tidak ada di rekon BPD. Bayar tunai ke bendahara 6 bulan sekaligus (${p.tanggalBayar}).`,
        },
      })
      inserted += 1
    } catch (err) {
      failed += 1
      console.error(`  ✖ NIS ${p.nis} ${p.periodYear}-${p.periodMonth}: ${(err as Error).message}`)
    }
  }

  console.log(`\nInserted : ${inserted}`)
  console.log(`Duplicate: ${duplicate}`)
  console.log(`Failed   : ${failed}`)

  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    })
    if (admin) {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: admin.id } },
          action: 'IMPORT_PDF_MANUAL_PAYMENTS',
          metadata: {
            inserted,
            duplicate,
            failed,
            source: 'PDF arsip angkatan 2023',
          },
        },
      })
    }
  } catch {
    /* best-effort */
  }

  console.log('\n=== DONE ===')
}

main()
  .catch((err) => {
    console.error('Failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
