/**
 * Fix tanggalTransaksi yang DD↔MM tertukar karena bug exporter asik.bpdbali.
 *
 * Heuristik:
 *   - Ambil semua Pembayaran
 *   - Kalau month(tanggalTransaksi) != periodMonth
 *     AND day(tanggalTransaksi) == periodMonth   ← ini signature swap
 *     AND day ≤ 12                                ← swap valid
 *   - Swap DD↔MM agar month match periodMonth
 *
 * Contoh: periode 2026-02, tanggal 02/04/2026 22:09 → swap ke 04/02/2026 22:09.
 *
 * Run:  npx tsx scripts/fix-swapped-dates.ts [--apply]
 */

import { prisma } from '../src/lib/db'

const APPLY = process.argv.includes('--apply')

function swapDayMonth(d: Date): Date {
  return new Date(
    d.getFullYear(),
    d.getDate() - 1, // day → month (0-indexed)
    d.getMonth() + 1, // month → day (back to 1-indexed)
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
  )
}

async function main() {
  const rows = await prisma.pembayaran.findMany({
    select: {
      id: true,
      periodYear: true,
      periodMonth: true,
      tanggalTransaksi: true,
      noBukti: true,
      siswa: { select: { nis: true } },
    },
  })
  console.log(`[fix-swap] total rows: ${rows.length}`)

  const toFix: Array<{
    id: string
    nis: string
    periode: string
    oldDate: Date
    newDate: Date
    bukti: string | null
  }> = []

  for (const r of rows) {
    const d = r.tanggalTransaksi
    const day = d.getDate()
    const month = d.getMonth() + 1
    // Swap signature: day == periodMonth but month != periodMonth, and day ≤ 12
    if (
      day >= 1 &&
      day <= 12 &&
      day === r.periodMonth &&
      month !== r.periodMonth
    ) {
      const swapped = swapDayMonth(d)
      toFix.push({
        id: r.id,
        nis: r.siswa?.nis ?? '?',
        periode: `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`,
        oldDate: d,
        newDate: swapped,
        bukti: r.noBukti,
      })
    }
  }

  console.log(`[fix-swap] candidates to fix: ${toFix.length}`)
  if (toFix.length === 0) {
    console.log('[fix-swap] nothing to do.')
    return
  }

  console.log('\n=== Sample (first 8) ===')
  for (const f of toFix.slice(0, 8)) {
    const o = f.oldDate.toISOString().replace('T', ' ').slice(0, 19)
    const n = f.newDate.toISOString().replace('T', ' ').slice(0, 19)
    console.log(`  NIS ${f.nis.padEnd(6)}  periode ${f.periode}  bukti ${f.bukti}`)
    console.log(`    ${o}  →  ${n}`)
  }

  if (!APPLY) {
    console.log('\n[dry-run] add --apply to commit.')
    return
  }

  console.log(`\n[fix-swap] applying ${toFix.length} updates in batches...`)
  const BATCH = 250
  let done = 0
  for (let i = 0; i < toFix.length; i += BATCH) {
    const chunk = toFix.slice(i, i + BATCH)
    await prisma.$transaction(
      chunk.map((f) =>
        prisma.pembayaran.update({
          where: { id: f.id },
          data: { tanggalTransaksi: f.newDate },
        }),
      ),
    )
    done += chunk.length
    process.stdout.write(`\r[fix-swap]   ${done}/${toFix.length}  `)
  }
  process.stdout.write('\n')

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
          action: 'FIX_SWAPPED_DATES',
          entity: 'Pembayaran',
          metadata: { updated: toFix.length, script: 'scripts/fix-swapped-dates.ts' },
        },
      })
    }
  } catch {
    /* best-effort */
  }

  console.log(`\n=== DONE === Updated ${toFix.length} rows.`)
}

main()
  .catch((err) => {
    console.error('Failed:', err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
