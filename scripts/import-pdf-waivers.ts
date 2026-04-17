/**
 * Import Keringanan + Pelunasan dari sample PDF (angkatan 2023, folder 03 XII).
 *
 * Data diekstrak via scripts/scan_pdf_waivers.py → ./scripts/waivers.json.
 *
 * Logic:
 *   - JUARA / OSN / JUARA_UMUM → tabel `Keringanan` (jenis sesuai).
 *   - LUNAS 36 bulan penuh (NIS 25112) → 1 row `Pelunasan` dengan nominal
 *     36 × 350.000 = 12.600.000.
 *
 * Idempotent: Keringanan pakai @@unique([siswaId, periodYear, periodMonth])
 * jadi createMany({ skipDuplicates: true }).
 *
 * Usage:  npx tsx scripts/import-pdf-waivers.ts [--apply]
 */

import path from 'node:path'
import { readFileSync } from 'node:fs'
import { JenisKeringanan, type Prisma } from '@prisma/client'
import { prisma } from '../src/lib/db'

const APPLY = process.argv.includes('--apply')
const WAIVERS_JSON = './scripts/waivers.json'

interface RawEntry {
  nis: string
  nama: string
  rombel: number
  grade: 'X' | 'XI' | 'XII'
  periodYear: number
  periodMonth: number
  jenis: 'JUARA' | 'OSN' | 'JUARA_UMUM' | 'LUNAS' | 'BEASISWA' | 'KKM'
}

const NOMINAL_SPP = 350_000

function mapJenis(jenis: string): JenisKeringanan | null {
  switch (jenis) {
    case 'JUARA': return JenisKeringanan.JUARA
    case 'OSN': return JenisKeringanan.OSN
    case 'JUARA_UMUM': return JenisKeringanan.JUARA_UMUM
    case 'BEASISWA': return JenisKeringanan.BEASISWA
    default: return null
  }
}

async function main() {
  const entries = JSON.parse(readFileSync(WAIVERS_JSON, 'utf-8')) as RawEntry[]
  console.log(`[import] loaded ${entries.length} entries from ${path.basename(WAIVERS_JSON)}`)

  // Look up siswa by NIS once
  const nisSet = new Set(entries.map((e) => e.nis))
  const siswas = await prisma.siswa.findMany({
    where: { nis: { in: [...nisSet] } },
    select: { id: true, nis: true, nama: true, angkatan: true },
  })
  const byNis = new Map(siswas.map((s) => [s.nis, s]))

  const missing = [...nisSet].filter((n) => !byNis.has(n))
  if (missing.length > 0) {
    console.warn(`[import] ⚠ NIS belum ada di master: ${missing.join(', ')}`)
  }

  // Partition entries
  const keringananInputs: Prisma.KeringananCreateManyInput[] = []
  const lunasByNis = new Map<string, RawEntry[]>()

  for (const e of entries) {
    const siswa = byNis.get(e.nis)
    if (!siswa) continue
    if (e.jenis === 'LUNAS') {
      const arr = lunasByNis.get(e.nis) ?? []
      arr.push(e)
      lunasByNis.set(e.nis, arr)
      continue
    }
    const jenis = mapJenis(e.jenis)
    if (!jenis) {
      console.warn(`[import] unknown jenis ${e.jenis} (NIS ${e.nis}) — skip`)
      continue
    }
    keringananInputs.push({
      siswaId: siswa.id,
      periodYear: e.periodYear,
      periodMonth: e.periodMonth,
      jenis,
      persentase: 100,
      alasan: `Import dari PDF arsip (rombel XII.${e.rombel})`,
    })
  }

  // Pelunasan: for each siswa with all-LUNAS entries, create single pelunasan
  interface PelunasanPlan {
    siswaId: string
    nis: string
    periodeMulai: string
    periodeAkhir: string
    nominalTotal: number
    jumlahBulan: number
  }
  const pelunasans: PelunasanPlan[] = []
  for (const [nis, arr] of lunasByNis) {
    const siswa = byNis.get(nis)!
    const sorted = [...arr].sort((a, b) =>
      a.periodYear === b.periodYear ? a.periodMonth - b.periodMonth : a.periodYear - b.periodYear,
    )
    const first = sorted[0]!
    const last = sorted[sorted.length - 1]!
    pelunasans.push({
      siswaId: siswa.id,
      nis,
      periodeMulai: `${first.periodYear}-${String(first.periodMonth).padStart(2, '0')}`,
      periodeAkhir: `${last.periodYear}-${String(last.periodMonth).padStart(2, '0')}`,
      nominalTotal: sorted.length * NOMINAL_SPP,
      jumlahBulan: sorted.length,
    })
  }

  console.log('\n=== PLAN ===')
  console.log(`Keringanan records  : ${keringananInputs.length}`)
  const byJenis: Record<string, number> = {}
  for (const k of keringananInputs) byJenis[k.jenis] = (byJenis[k.jenis] ?? 0) + 1
  for (const [j, n] of Object.entries(byJenis)) console.log(`  ${j}: ${n}`)

  console.log(`\nPelunasan records   : ${pelunasans.length}`)
  for (const p of pelunasans) {
    console.log(
      `  NIS ${p.nis}  ${p.periodeMulai} → ${p.periodeAkhir}  (${p.jumlahBulan} bulan × Rp ${NOMINAL_SPP.toLocaleString('id-ID')} = Rp ${p.nominalTotal.toLocaleString('id-ID')})`,
    )
  }

  if (!APPLY) {
    console.log('\n[dry-run] add --apply to commit.')
    return
  }

  console.log('\n[import] applying...')

  // Keringanan: bulk insert with skipDuplicates
  const kRes = await prisma.keringanan.createMany({
    data: keringananInputs,
    skipDuplicates: true,
  })
  console.log(`  Keringanan inserted: ${kRes.count} / ${keringananInputs.length}`)

  // Pelunasan: check existing then create
  let pInserted = 0
  for (const p of pelunasans) {
    const existing = await prisma.pelunasan.findFirst({
      where: {
        siswaId: p.siswaId,
        periodeMulai: p.periodeMulai,
        periodeAkhir: p.periodeAkhir,
      },
    })
    if (existing) {
      console.log(`  Pelunasan NIS ${p.nis} sudah ada — skip`)
      continue
    }
    await prisma.pelunasan.create({
      data: {
        siswaId: p.siswaId,
        periodeMulai: p.periodeMulai,
        periodeAkhir: p.periodeAkhir,
        tanggalLunas: new Date(),
        nominalTotal: p.nominalTotal,
        metodeLabel: 'Lunas manual (import dari PDF arsip)',
        catatan: `Bayar sekaligus ${p.jumlahBulan} bulan sesuai PDF rombel XII.11`,
      },
    })
    pInserted += 1
  }
  console.log(`  Pelunasan inserted: ${pInserted} / ${pelunasans.length}`)

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
          action: 'IMPORT_PDF_WAIVERS',
          metadata: {
            keringananInserted: kRes.count,
            pelunasanInserted: pInserted,
            script: 'scripts/import-pdf-waivers.ts',
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
