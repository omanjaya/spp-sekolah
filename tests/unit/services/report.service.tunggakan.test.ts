import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/repositories/tahun-ajaran.repo', () => ({
  tahunAjaranRepo: {
    findById: vi.fn(),
    findActive: vi.fn(),
  },
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    siswa: { findMany: vi.fn() },
    pembayaran: { findMany: vi.fn() },
    keringanan: { findMany: vi.fn() },
    pelunasan: { findMany: vi.fn() },
  },
}))

import { prisma } from '@/lib/db'
import { tahunAjaranRepo } from '@/repositories/tahun-ajaran.repo'
import { reportService } from '@/services/report.service'

/**
 * Tahun ajaran mock — short range: Jul, Aug, Sep 2025 (3 months).
 * tanggalAkhir is set in the PAST relative to the service's `new Date()` call,
 * so the service uses tanggalAkhir as `end`.
 * We set tanggalAkhir to Sep 30, 2025 — well in the past for any real test run.
 */
const mockTahunAjaran = {
  id: 'ta1',
  kode: '2025/2026',
  tahunMulai: 2025,
  tahunAkhir: 2026,
  tanggalMulai: new Date('2025-07-01T00:00:00.000Z'),
  tanggalAkhir: new Date('2025-09-30T23:59:59.000Z'),
  nominalSppDefault: 350000,
  isActive: true,
  createdAt: new Date('2025-06-01'),
}

function makeSiswa(overrides: Record<string, unknown> = {}) {
  return {
    id: 'siswa1',
    nis: '001',
    nama: 'Test Siswa',
    angkatan: 2025,
    enrollments: [{ rombel: { kode: 'X.1' } }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tahunAjaranRepo.findById).mockResolvedValue(mockTahunAjaran as any)
  vi.mocked(tahunAjaranRepo.findActive).mockResolvedValue(mockTahunAjaran as any)
})

describe('reportService._computeTunggakan()', () => {
  it('returns { totalSiswa: 0, rows: [] } when siswa list is empty', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([])

    const result = await reportService._computeTunggakan({}, 'ta1', 500)

    expect(result.totalSiswa).toBe(0)
    expect(result.rows).toEqual([])
  })

  it('includes siswa with no payments in tunggakan', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([makeSiswa()] as any)
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([])

    // minBulan default is 2; siswa has 3 missing months → included
    const result = await reportService._computeTunggakan({}, 'ta1', 500)

    expect(result.totalSiswa).toBe(1)
    expect(result.rows[0]!.siswaId).toBe('siswa1')
    expect(result.rows[0]!.bulanTunggak).toBe(3)
    expect(result.rows[0]!.totalTunggakan).toBe(3 * 350000)
    expect(result.rows[0]!.periodeTerlama).toBe('2025-07')
  })

  it('does not include siswa who has paid all months', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([makeSiswa()] as any)
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([
      { siswaId: 'siswa1', periodYear: 2025, periodMonth: 7 },
      { siswaId: 'siswa1', periodYear: 2025, periodMonth: 8 },
      { siswaId: 'siswa1', periodYear: 2025, periodMonth: 9 },
    ] as any)
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([])

    const result = await reportService._computeTunggakan({}, 'ta1', 500)

    expect(result.totalSiswa).toBe(0)
    expect(result.rows).toEqual([])
  })

  it('excludes siswa with only 1 missing month when minBulan=2', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([makeSiswa()] as any)
    // Paid Jul and Aug, missing Sep only
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([
      { siswaId: 'siswa1', periodYear: 2025, periodMonth: 7 },
      { siswaId: 'siswa1', periodYear: 2025, periodMonth: 8 },
    ] as any)
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([])

    const result = await reportService._computeTunggakan({ minBulan: 2 }, 'ta1', 500)

    expect(result.totalSiswa).toBe(0)
  })

  it('includes siswa with 2 missing months when minBulan=2', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([makeSiswa()] as any)
    // Paid Jul only, missing Aug and Sep
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([
      { siswaId: 'siswa1', periodYear: 2025, periodMonth: 7 },
    ] as any)
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([])

    const result = await reportService._computeTunggakan({ minBulan: 2 }, 'ta1', 500)

    expect(result.totalSiswa).toBe(1)
    expect(result.rows[0]!.bulanTunggak).toBe(2)
  })

  it('pelunasan covering all months removes siswa from tunggakan', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([makeSiswa()] as any)
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([])
    // Pelunasan covers Jul-Sep 2025
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([
      {
        siswaId: 'siswa1',
        periodeMulai: '2025-07',
        periodeAkhir: '2025-09',
      },
    ] as any)

    const result = await reportService._computeTunggakan({}, 'ta1', 500)

    expect(result.totalSiswa).toBe(0)
  })

  it('keringanan 100% covers specific months', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([makeSiswa()] as any)
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([])
    // Keringanan covers Jul and Aug (100%)
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([
      { siswaId: 'siswa1', periodYear: 2025, periodMonth: 7 },
      { siswaId: 'siswa1', periodYear: 2025, periodMonth: 8 },
    ] as any)
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([])

    // Only Sep missing (1 month) — below default minBulan=2
    const result = await reportService._computeTunggakan({}, 'ta1', 500)

    expect(result.totalSiswa).toBe(0)
  })

  it('respects the limit parameter', async () => {
    const siswaList = [
      makeSiswa({ id: 'siswa1', nis: '001', nama: 'A Siswa' }),
      makeSiswa({ id: 'siswa2', nis: '002', nama: 'B Siswa' }),
      makeSiswa({ id: 'siswa3', nis: '003', nama: 'C Siswa' }),
    ]
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce(siswaList as any)
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([])

    const result = await reportService._computeTunggakan({}, 'ta1', 2)

    expect(result.totalSiswa).toBe(3)
    expect(result.rows).toHaveLength(2) // limited to 2
  })

  it('includes rombel kode from enrollment', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([makeSiswa()] as any)
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([])

    const result = await reportService._computeTunggakan({}, 'ta1', 500)

    expect(result.rows[0]!.rombelKode).toBe('X.1')
  })

  it('sets rombelKode to null when no enrollment', async () => {
    vi.mocked(prisma.siswa.findMany).mockResolvedValueOnce([
      makeSiswa({ enrollments: [] }),
    ] as any)
    vi.mocked(prisma.pembayaran.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.keringanan.findMany).mockResolvedValueOnce([])
    vi.mocked(prisma.pelunasan.findMany).mockResolvedValueOnce([])

    const result = await reportService._computeTunggakan({}, 'ta1', 500)

    expect(result.rows[0]!.rombelKode).toBeNull()
  })
})
