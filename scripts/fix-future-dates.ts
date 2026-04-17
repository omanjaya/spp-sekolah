/**
 * Fix future-dated `tanggalTransaksi` rows caused by asik.bpdbali Excel
 * exporter swapping DD↔MM when exporting typed-date cells (e.g.
 * "12/01/2026" interpreted as Dec 1 2026 instead of Jan 12 2026).
 *
 * Heuristic (mirrors parser `maybeFixDDMMSwap`):
 *   - Row candidate: tanggalTransaksi > now
 *   - Swap day ↔ month; skip if original day > 12 (invalid month after swap)
 *   - Accept swap only if swapped date <= now AND year >= 2019
 *
 * Run:  docker compose exec app npx tsx scripts/fix-future-dates.ts [--apply]
 *
 * Without `--apply`: dry-run (print what would change).
 * With    `--apply`: update DB in one transaction + write AuditLog entry.
 */

import { prisma } from '../src/lib/db'

const APPLY = process.argv.includes('--apply')

function swapDayMonth(d: Date): Date | null {
  const day = d.getDate()
  const month = d.getMonth() + 1
  if (day < 1 || day > 12) return null
  return new Date(
    d.getFullYear(),
    day - 1,
    month,
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  )
}

function maybeFixDDMMSwap(d: Date, now: number): Date | null {
  if (d.getTime() <= now) return null
  const swapped = swapDayMonth(d)
  if (!swapped) return null
  if (swapped.getTime() > now) return null
  if (swapped.getFullYear() < 2019) return null
  return swapped
}

async function main() {
  const now = Date.now()
  const rows = await prisma.pembayaran.findMany({
    where: { tanggalTransaksi: { gt: new Date(now) } },
    select: {
      id: true,
      tanggalTransaksi: true,
      periodYear: true,
      periodMonth: true,
      noBukti: true,
      siswa: { select: { nis: true, nama: true } },
    },
    orderBy: { tanggalTransaksi: 'asc' },
  })

  console.log(`[fix-dates] future-dated rows detected: ${rows.length}`)
  if (rows.length === 0) {
    console.log('[fix-dates] nothing to fix.')
    return
  }

  const fixable: Array<{
    id: string
    oldDate: Date
    newDate: Date
    nis: string
    periode: string
    noBukti: string | null
  }> = []
  const unfixable: typeof rows = []

  for (const r of rows) {
    const swapped = maybeFixDDMMSwap(r.tanggalTransaksi, now)
    if (swapped) {
      fixable.push({
        id: r.id,
        oldDate: r.tanggalTransaksi,
        newDate: swapped,
        nis: r.siswa?.nis ?? '?',
        periode: `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`,
        noBukti: r.noBukti,
      })
    } else {
      unfixable.push(r)
    }
  }

  console.log(`[fix-dates] fixable  : ${fixable.length}`)
  console.log(`[fix-dates] unfixable: ${unfixable.length} (day > 12 atau swap masih future)`)
  console.log('')

  // Show sample
  console.log('=== Sample yang akan di-fix (first 5) ===')
  for (const f of fixable.slice(0, 5)) {
    const o = f.oldDate.toISOString().replace('T', ' ').slice(0, 19)
    const n = f.newDate.toISOString().replace('T', ' ').slice(0, 19)
    console.log(`  NIS ${f.nis}  periode ${f.periode}  bukti ${f.noBukti}`)
    console.log(`    ${o}  →  ${n}`)
  }

  if (unfixable.length > 0) {
    console.log('\n=== Sample unfixable (first 5) ===')
    for (const r of unfixable.slice(0, 5)) {
      console.log(`  NIS ${r.siswa?.nis}  bukti ${r.noBukti}  ${r.tanggalTransaksi.toISOString()}`)
    }
  }

  if (!APPLY) {
    console.log('\n[dry-run] add --apply to actually update the DB.')
    return
  }

  console.log(`\n[fix-dates] applying ${fixable.length} updates in transaction...`)
  const BATCH = 200
  let updated = 0
  for (let i = 0; i < fixable.length; i += BATCH) {
    const chunk = fixable.slice(i, i + BATCH)
    await prisma.$transaction(
      chunk.map((f) =>
        prisma.pembayaran.update({
          where: { id: f.id },
          data: { tanggalTransaksi: f.newDate },
        }),
      ),
    )
    updated += chunk.length
    process.stdout.write(`\r[fix-dates]   ${updated}/${fixable.length}  `)
  }
  process.stdout.write('\n')

  // Audit log (single entry)
  try {
    const admin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    })
    if (admin) {
      await prisma.auditLog.create({
        data: {
          user: { connect: { id: admin.id } },
          action: 'FIX_FUTURE_DATES',
          entity: 'Pembayaran',
          metadata: {
            updated: fixable.length,
            unfixable: unfixable.length,
            script: 'scripts/fix-future-dates.ts',
          },
        },
      })
    }
  } catch {
    /* audit is best-effort */
  }

  console.log(`\n=== DONE ===`)
  console.log(`Updated  : ${fixable.length}`)
  console.log(`Unfixable: ${unfixable.length}`)
}

main()
  .catch((err) => {
    console.error('Failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
