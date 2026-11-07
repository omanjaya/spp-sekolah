/**
 * Test integrasi API bendahara terhadap Postgres sungguhan dengan data sintetis.
 * Jalankan: DATABASE_URL=<db sekali pakai> npm run test:integration
 * PERINGATAN: test ini MENGHAPUS seluruh isi tabel di DATABASE_URL.
 */
import { NextRequest } from 'next/server'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { GET as getInfo } from '../../app/api/integrations/bendahara/v1/info/route'
import { GET as getPayments } from '../../app/api/integrations/bendahara/v1/payments/route'
import { GET as getRefunds } from '../../app/api/integrations/bendahara/v1/refunds/route'
import { GET as getSummary } from '../../app/api/integrations/bendahara/v1/summary/route'
import { prisma } from '@/lib/db'
import { hashToken, resetIntegrationLimiters } from '@/lib/integration/bendahara-auth'
import { cancelRequestService } from '@/services/cancel-request.service'
import { refundService } from '@/services/refund.service'
import type { PaymentDto } from '@/services/integrasi-bendahara.service'

const SCHOOL = '99990001'
const TOKEN = `sppbdh_bdh-test_${'a1'.repeat(32)}`
const TOKEN_OTHER_SCHOOL = `sppbdh_bdh-lain_${'b2'.repeat(32)}`
const TOKEN_REVOKED = `sppbdh_bdh-lama_${'c3'.repeat(32)}`
const BASE = 'https://spp.example.test/api/integrations/bendahara/v1'

type Handler = (req: NextRequest) => Promise<Response>

async function call(handler: Handler, path: string, token: string | null = TOKEN) {
  const headers: Record<string, string> = { 'x-forwarded-for': '203.0.113.7' }
  if (token) headers.authorization = `Bearer ${token}`
  const res = await handler(new NextRequest(`${BASE}${path}`, { headers }))
  return { status: res.status, headers: res.headers, body: (await res.json()) as any }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Sinkronisasi penuh/inkremental seperti yang dilakukan aplikasi bendahara. */
async function syncPayments(store: Map<string, PaymentDto>, cursor: string | null, limit = 2) {
  let pages = 0
  let next = cursor
  for (;;) {
    const qs = new URLSearchParams({ limit: String(limit) })
    if (next) qs.set('cursor', next)
    const { status, body } = await call(getPayments, `/payments?${qs}`)
    expect(status).toBe(200)
    pages += 1
    for (const p of body.data as PaymentDto[]) store.set(p.payment_id, p) // upsert
    next = body.pagination.next_cursor
    if (!body.pagination.has_more) return { cursor: next as string | null, pages, last: body }
  }
}

let userId = ''
const siswa: Record<string, string> = {}
const pay: Record<string, string> = {}

async function wipe() {
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`)
}

/** Jam dinding WITA → disimpan naif (sama seperti importer BPD). */
const wita = (s: string) => new Date(`${s}Z`)

async function seed() {
  await wipe()
  await prisma.setting.createMany({
    data: [
      { key: 'school.name', value: 'SMA Contoh Sintetis' },
      { key: 'school.npsn', value: SCHOOL },
      { key: 'school.address', value: 'Jl. Contoh No. 1' },
    ],
  })
  const user = await prisma.user.create({
    data: { email: 'bendahara@example.test', passwordHash: 'x', nama: 'Bendahara Uji', role: 'SUPER_ADMIN' },
  })
  userId = user.id
  const ta25 = await prisma.tahunAjaran.create({
    data: { kode: '2025/2026', tahunMulai: 2025, tahunAkhir: 2026, tanggalMulai: new Date('2025-07-01'), tanggalAkhir: new Date('2026-06-30') },
  })
  const ta26 = await prisma.tahunAjaran.create({
    data: { kode: '2026/2027', tahunMulai: 2026, tahunAkhir: 2027, tanggalMulai: new Date('2026-07-01'), tanggalAkhir: new Date('2027-06-30'), isActive: true },
  })
  const r11 = await prisma.rombel.create({ data: { tahunAjaranId: ta25.id, grade: 'XI', nomor: 4, kode: 'XI.4' } })
  const r12 = await prisma.rombel.create({ data: { tahunAjaranId: ta26.id, grade: 'XII', nomor: 4, kode: 'XII.4' } })
  const r10 = await prisma.rombel.create({ data: { tahunAjaranId: ta26.id, grade: 'X', nomor: 2, kode: 'X.2' } })

  for (const [key, nis, nama, angkatan] of [
    ['a', '900001', 'Siswa Sintetis A', 2024],
    ['b', '900002', 'Siswa Sintetis B', 2024],
    ['c', '900003', 'Siswa Sintetis C', 2026],
  ] as const) {
    siswa[key] = (await prisma.siswa.create({ data: { nis, nama, angkatan } })).id
  }
  await prisma.enrollment.createMany({
    data: [
      { siswaId: siswa.a!, rombelId: r11.id, tahunAjaranId: ta25.id },
      { siswaId: siswa.a!, rombelId: r12.id, tahunAjaranId: ta26.id },
      { siswaId: siswa.b!, rombelId: r12.id, tahunAjaranId: ta26.id },
      { siswaId: siswa.c!, rombelId: r10.id, tahunAjaranId: ta26.id },
    ],
  })

  const mk = async (key: string, data: Record<string, unknown>) => {
    pay[key] = (
      await prisma.pembayaran.create({
        data: { amount: 350000, source: 'IMPORT_EXCEL', kodeCabang: 'TLR', tellerUser: 'webteller', ...data } as never,
      })
    ).id
    await sleep(3)
  }
  // Transaksi lama (tahun ajaran sebelumnya).
  await mk('a_2025_08', { siswaId: siswa.a, periodYear: 2025, periodMonth: 8, tanggalTransaksi: wita('2025-08-11T09:00:00'), noBukti: 'SYN-0001' })
  // Siswa A membayar 3 bulan sekaligus pada satu kunjungan (3 No. Bukti, jam sama).
  for (const [m, nb] of [[7, 'SYN-0101'], [8, 'SYN-0102'], [9, 'SYN-0103']] as const) {
    await mk(`a_2026_0${m}`, { siswaId: siswa.a, periodYear: 2026, periodMonth: m, tanggalTransaksi: wita('2026-08-05T10:15:00'), noBukti: nb, kodeCabang: 'EB', tellerUser: 'igate_pac' })
  }
  await mk('b_2026_07', { siswaId: siswa.b, periodYear: 2026, periodMonth: 7, tanggalTransaksi: wita('2026-07-20T14:30:00'), noBukti: 'SYN-0201' })
  await mk('b_2026_08', { siswaId: siswa.b, periodYear: 2026, periodMonth: 8, tanggalTransaksi: wita('2026-08-31T23:59:00'), noBukti: 'SYN-0202' })
  // Manual (tanggal saja) + biaya administrasi.
  await mk('c_2026_07', { siswaId: siswa.c, periodYear: 2026, periodMonth: 7, tanggalTransaksi: new Date('2026-08-01T00:00:00Z'), noBukti: null, source: 'MANUAL', kodeCabang: null, tellerUser: null, biayaAdm: 2500 })
  // Penanda keringanan (nominal 0).
  await mk('c_2026_08', { siswaId: siswa.c, periodYear: 2026, periodMonth: 8, tanggalTransaksi: new Date('2026-08-01T00:00:00Z'), noBukti: null, source: 'MANUAL', kodeCabang: null, tellerUser: null, amount: 0, catatan: 'JUARA — keringanan' })
}

beforeAll(async () => {
  process.env.BENDAHARA_API_TOKENS = [
    `bdh-test:${SCHOOL}:${hashToken(TOKEN)}`,
    `bdh-lain:88880002:${hashToken(TOKEN_OTHER_SCHOOL)}`,
  ].join(',')
  process.env.BENDAHARA_API_SETTLE_SECONDS = '0'
  delete process.env.BENDAHARA_SCHOOL_ID
  await seed()
})

beforeEach(() => {
  process.env.BENDAHARA_API_RATE_PER_MINUTE = '1000'
  resetIntegrationLimiters()
})

afterAll(async () => {
  await prisma.$disconnect()
})

describe('akses & token', () => {
  it('menolak tanpa token, token salah, dan token yang sudah dicabut', async () => {
    const none = await call(getInfo, '/info', null)
    expect(none.status).toBe(401)
    expect(none.body.error.code).toBe('UNAUTHORIZED')
    expect(none.headers.get('www-authenticate')).toBe('Bearer')
    expect((await call(getInfo, '/info', 'sppbdh_bdh-test_' + '00'.repeat(32))).status).toBe(401)
    expect((await call(getInfo, '/info', TOKEN_REVOKED)).status).toBe(401)
    expect((await call(getInfo, '/info', 'random-junk')).status).toBe(401)
  })

  it('membatasi token ke satu sekolah', async () => {
    const other = await call(getPayments, '/payments', TOKEN_OTHER_SCHOOL)
    expect(other.status).toBe(403)
    expect(other.body.error.code).toBe('SCHOOL_FORBIDDEN')
    expect(JSON.stringify(other.body)).not.toContain('SYN-')
    const mismatch = await call(getPayments, '/payments?school_id=88880002')
    expect(mismatch.status).toBe(403)
    expect((await call(getPayments, `/payments?school_id=${SCHOOL}&limit=1`)).status).toBe(200)
  })

  it('pencabutan token berlaku setelah konfigurasi diubah', async () => {
    const saved = process.env.BENDAHARA_API_TOKENS
    process.env.BENDAHARA_API_TOKENS = saved!.split(',').filter((e) => !e.startsWith('bdh-test:')).join(',')
    expect((await call(getInfo, '/info')).status).toBe(401)
    process.env.BENDAHARA_API_TOKENS = saved
    expect((await call(getInfo, '/info')).status).toBe(200)
  })

  it('membatasi jumlah permintaan per token', async () => {
    process.env.BENDAHARA_API_RATE_PER_MINUTE = '3'
    resetIntegrationLimiters()
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await call(getInfo, '/info')).status)
    expect(statuses).toEqual([200, 200, 200, 429])
    const limited = await call(getInfo, '/info')
    expect(limited.body.error.code).toBe('RATE_LIMITED')
    expect(Number(limited.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(limited.headers.get('x-ratelimit-limit')).toBe('3')
  })

  it('membatasi percobaan token gagal per IP', async () => {
    const statuses: number[] = []
    for (let i = 0; i < 21; i++) statuses.push((await call(getInfo, '/info', 'salah')).status)
    expect(statuses.slice(0, 20).every((s) => s === 401)).toBe(true)
    expect(statuses[20]).toBe(429)
  })
})

describe('info', () => {
  it('mengembalikan identitas sekolah, versi, mata uang, zona waktu', async () => {
    const { status, body, headers } = await call(getInfo, '/info')
    expect(status).toBe(200)
    expect(headers.get('cache-control')).toBe('no-store')
    expect(body).toMatchObject({
      api_version: '1.0.0',
      school: { school_id: SCHOOL, name: 'SMA Contoh Sintetis', npsn: SCHOOL },
      currency: 'IDR',
      timezone: 'Asia/Makassar',
      utc_offset: '+08:00',
      token: { token_id: 'bdh-test', scopes: ['payments:read'] },
    })
  })
})

describe('sinkronisasi pembayaran', () => {
  const store = new Map<string, PaymentDto>()
  let cursor: string | null = null

  it('pengambilan awal seluruh riwayat dengan pagination stabil', async () => {
    const res = await syncPayments(store, null, 2)
    cursor = res.cursor
    expect(store.size).toBe(Object.keys(pay).length)
    expect(res.pages).toBe(Math.ceil(Object.keys(pay).length / 2))
    expect(cursor).toBeTruthy()
  })

  it('format pembayaran: nominal string, waktu ISO, bulan iuran terpisah dari tanggal bayar', () => {
    const p = store.get(pay.a_2026_07!)!
    expect(p).toMatchObject({
      school_id: SCHOOL,
      student: { student_id: siswa.a, nis: '900001', name: 'Siswa Sintetis A' },
      enrollment: { academic_year: '2026/2027', grade: 'XII', rombel: 'XII.4' },
      receipt_number: 'SYN-0101',
      fund: { code: 'SUMBANGAN_KOMITE' },
      channel: { code: 'BPD', branch_code: 'EB', teller: 'igate_pac' },
      amount: '350000.00',
      admin_fee: '0.00',
      paid_at: '2026-08-05T10:15:00+08:00',
      paid_date: '2026-08-05',
      paid_time_known: true,
      status: 'PAID',
      allocations: [{ allocation_id: `${pay.a_2026_07}:2026-07`, year: 2026, month: 7, academic_year: '2026/2027', amount: '350000.00' }],
    })
    expect(p.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    // Transaksi lama → kelas pada tahun ajaran bulan iurannya.
    expect(store.get(pay.a_2025_08!)!.enrollment).toMatchObject({ academic_year: '2025/2026', rombel: 'XI.4' })
  })

  it('pembayaran beberapa bulan sekaligus: satu alokasi per bulan, jumlah alokasi = nominal', () => {
    const multi = [...store.values()].filter((p) => p.student.student_id === siswa.a && p.paid_at === '2026-08-05T10:15:00+08:00')
    expect(multi.map((p) => p.allocations[0]!.month).sort()).toEqual([7, 8, 9])
    for (const p of store.values()) {
      const sum = p.allocations.reduce((s, a) => s + Number(a.amount), 0)
      expect(sum.toFixed(2)).toBe(p.amount)
    }
    const allocIds = [...store.values()].flatMap((p) => p.allocations.map((a) => a.allocation_id))
    expect(new Set(allocIds).size).toBe(allocIds.length)
  })

  it('biaya administrasi terpisah dan penanda nominal 0', () => {
    const manual = store.get(pay.c_2026_07!)!
    expect(manual).toMatchObject({ amount: '350000.00', admin_fee: '2500.00', total_paid: '352500.00', receipt_number: null, channel: { code: 'MANUAL' }, paid_time_known: false, paid_at: '2026-08-01T00:00:00+08:00' })
    expect(store.get(pay.c_2026_08!)!).toMatchObject({ amount: '0.00', is_cash_receipt: false })
  })

  it('sinkronisasi ulang tanpa perubahan tidak mengembalikan data; impor ulang penuh tidak menggandakan', async () => {
    const again = await syncPayments(store, cursor, 2)
    expect(again.last.data).toHaveLength(0)
    expect(again.cursor).toBe(cursor)

    const fresh = new Map<string, PaymentDto>()
    await syncPayments(fresh, null, 3)
    expect([...fresh.keys()].sort()).toEqual([...store.keys()].sort())
    expect(fresh.size).toBe(store.size)
  })

  it('refund sebagian muncul di sinkronisasi berikutnya', async () => {
    await sleep(5)
    const refund = await refundService.create(
      { siswaId: siswa.b!, pembayaranId: pay.b_2026_07!, amount: 100000, alasan: 'Kelebihan bayar (sintetis)', tanggal: new Date('2026-09-02'), noBukti: 'RF-SYN-01' },
      userId,
    )
    const res = await syncPayments(store, cursor, 2)
    cursor = res.cursor
    expect(res.last.data.map((p: PaymentDto) => p.payment_id)).toContain(pay.b_2026_07)
    const p = store.get(pay.b_2026_07!)!
    expect(p).toMatchObject({ status: 'PAID', amount: '350000.00', refunded_amount: '100000.00', net_amount: '250000.00' })
    expect(p.adjustments).toEqual([
      expect.objectContaining({ adjustment_id: refund.id, type: 'REFUND', amount: '100000.00', occurred_on: '2026-09-02', status: 'ACTIVE', payment_id: pay.b_2026_07, document_number: 'RF-SYN-01' }),
    ])

    const refunds = await call(getRefunds, '/refunds')
    expect(refunds.body.data).toEqual([expect.objectContaining({ adjustment_id: refund.id, status: 'ACTIVE', student: expect.objectContaining({ nis: '900002' }) })])
  })

  it('pembatalan pembayaran → status CANCELLED + REVERSAL', async () => {
    await sleep(5)
    const req = await cancelRequestService.request(pay.b_2026_08!, 'Salah input siswa (sintetis)', userId)
    await cancelRequestService.approve(req.id, userId, 'ok')
    const res = await syncPayments(store, cursor, 2)
    cursor = res.cursor
    const p = store.get(pay.b_2026_08!)!
    expect(p).toMatchObject({ status: 'CANCELLED', amount: '350000.00', net_amount: '0.00' })
    expect(p.adjustments).toEqual([
      expect.objectContaining({ adjustment_id: `rev_${pay.b_2026_08}`, type: 'REVERSAL', amount: '350000.00', status: 'ACTIVE', source: 'CANCEL_REQUEST', cancel_request_id: req.id, reason: 'Salah input siswa (sintetis)' }),
    ])
  })

  it('penghapusan refund terlihat sebagai tombstone VOIDED', async () => {
    await sleep(5)
    const refundId = store.get(pay.b_2026_07!)!.adjustments[0]!.adjustment_id as string
    await refundService.delete(refundId)
    const res = await syncPayments(store, cursor, 2)
    cursor = res.cursor
    const p = store.get(pay.b_2026_07!)!
    expect(p).toMatchObject({ refunded_amount: '0.00', net_amount: '350000.00' })
    expect(p.adjustments[0]).toMatchObject({ adjustment_id: refundId, status: 'VOIDED' })
    expect(p.adjustments[0]!.voided_at).toBeTruthy()

    const refunds = await call(getRefunds, '/refunds')
    expect(refunds.body.data[0]).toMatchObject({ adjustment_id: refundId, status: 'VOIDED' })
    // Baris tetap ada di DB (tidak dihapus permanen).
    expect(await prisma.refund.count()).toBe(1)
  })

  it('perubahan transaksi lama terkirim ulang dengan ID yang sama', async () => {
    await sleep(5)
    // Seperti importer "replace": nominal & No. Bukti transaksi 2025 dikoreksi.
    await prisma.pembayaran.update({ where: { id: pay.a_2025_08! }, data: { amount: 175000, noBukti: 'SYN-0001-K' } })
    const before = store.size
    const res = await syncPayments(store, cursor, 2)
    cursor = res.cursor
    expect(res.last.data.map((p: PaymentDto) => p.payment_id)).toEqual([pay.a_2025_08])
    expect(store.size).toBe(before)
    expect(store.get(pay.a_2025_08!)).toMatchObject({ amount: '175000.00', receipt_number: 'SYN-0001-K', allocations: [{ allocation_id: `${pay.a_2025_08}:2025-08`, amount: '175000.00' }] })
  })

  it('perubahan di tengah pagination tidak membuat transaksi terlewat', async () => {
    const local = new Map<string, PaymentDto>()
    const seen: string[] = []
    const qs = (c: string | null) => `/payments?limit=3${c ? `&cursor=${c}` : ''}`
    let r = await call(getPayments, qs(null))
    r.body.data.forEach((p: PaymentDto) => { local.set(p.payment_id, p); seen.push(p.payment_id) })
    // Ubah satu baris yang sudah dibaca dan satu yang belum dibaca.
    await sleep(5)
    const readId = r.body.data[0].payment_id as string
    const unreadId = pay.c_2026_08!
    expect(seen).not.toContain(unreadId)
    await prisma.pembayaran.update({ where: { id: readId }, data: { catatan: 'diubah saat sinkron' } })
    await prisma.pembayaran.update({ where: { id: unreadId }, data: { catatan: 'diubah juga' } })
    while (r.body.pagination.has_more) {
      r = await call(getPayments, qs(r.body.pagination.next_cursor))
      r.body.data.forEach((p: PaymentDto) => { local.set(p.payment_id, p); seen.push(p.payment_id) })
    }
    expect(local.size).toBe(Object.keys(pay).length)
    expect(local.get(readId)!.note).toBe('diubah saat sinkron')
    expect(local.get(unreadId)!.note).toBe('diubah juga')
    // Baris yang diubah setelah dibaca muncul lagi (upsert), sisanya tepat sekali.
    expect(seen.filter((id) => id === readId)).toHaveLength(2)
    expect(seen.filter((id) => id === unreadId)).toHaveLength(1)
  })

  it('updated_since dan validasi parameter', async () => {
    const future = await call(getPayments, `/payments?updated_since=${encodeURIComponent('2999-01-01T00:00:00+08:00')}`)
    expect(future.status).toBe(200)
    expect(future.body.data).toHaveLength(0)
    const all = await call(getPayments, `/payments?updated_since=${encodeURIComponent('2000-01-01T00:00:00+08:00')}&limit=1000`)
    expect(all.body.data).toHaveLength(Object.keys(pay).length)
    expect((await call(getPayments, '/payments?updated_since=2026-01-01')).status).toBe(400)
    expect((await call(getPayments, `/payments?cursor=${cursor}&updated_since=2026-01-01T00:00:00Z`)).status).toBe(400)
    const bad = await call(getPayments, '/payments?cursor=bukan-cursor')
    expect(bad.status).toBe(400)
    expect(bad.body.error.code).toBe('INVALID_CURSOR')
    expect((await call(getPayments, '/payments?limit=5000')).status).toBe(400)
  })

  it('jeda pengendapan menahan baris yang baru berubah', async () => {
    process.env.BENDAHARA_API_SETTLE_SECONDS = '30'
    await prisma.pembayaran.update({ where: { id: pay.a_2026_09! }, data: { catatan: 'baru saja' } })
    const r = await call(getPayments, `/payments?cursor=${cursor}`)
    expect(r.body.data.map((p: PaymentDto) => p.payment_id)).not.toContain(pay.a_2026_09)
    process.env.BENDAHARA_API_SETTLE_SECONDS = '0'
    const r2 = await call(getPayments, `/payments?cursor=${cursor}&limit=1000`)
    expect(r2.body.data.map((p: PaymentDto) => p.payment_id)).toContain(pay.a_2026_09)
  })
})

describe('ringkasan', () => {
  it('penerimaan, refund, bersih, jumlah transaksi per periode tanggal bayar', async () => {
    // Tambah refund aktif (tanggal 2026-08-10) untuk transaksi multi-bulan.
    await refundService.create(
      { siswaId: siswa.a!, pembayaranId: pay.a_2026_08!, amount: 50000, alasan: 'Refund sebagian (sintetis)', tanggal: new Date('2026-08-10'), noBukti: undefined },
      userId,
    )
    const { status, body } = await call(getSummary, '/summary?from=2026-08-01&to=2026-08-31')
    expect(status).toBe(200)
    // PAID Agustus 2026: A×3 (1.050.000) + C manual 350.000 + C nol = 1.400.000; B 31/08 dibatalkan.
    expect(body).toMatchObject({
      school_id: SCHOOL,
      currency: 'IDR',
      period: { from: '2026-08-01', to: '2026-08-31', basis: 'payment_date', timezone: 'Asia/Makassar' },
      gross_receipts: '1400000.00',
      refunds: '50000.00',
      net_receipts: '1350000.00',
      admin_fees: '2500.00',
      cancelled_amount: '350000.00',
      counts: { payments: 5, cash_payments: 4, cancelled_payments: 1, refunds: 1 },
    })
    // Batas hari: transaksi 31/08 23:59 WITA masuk Agustus, bukan September.
    const sept = await call(getSummary, '/summary?from=2026-09-01&to=2026-09-30')
    expect(sept.body).toMatchObject({ gross_receipts: '0.00', cancelled_amount: '0.00', refunds: '0.00', counts: { refunds: 0 } })
  })

  it('group_by month dan validasi', async () => {
    const { body } = await call(getSummary, '/summary?from=2025-07-01&to=2026-12-31&group_by=month')
    expect(body.groups.map((g: { key: string }) => g.key)).toEqual(['2025-08', '2026-07', '2026-08'])
    expect(body.groups[0]).toMatchObject({ key: '2025-08', gross_receipts: '175000.00' })
    const totalFromGroups = body.groups.reduce((s: number, g: { gross_receipts: string }) => s + Number(g.gross_receipts), 0)
    expect(totalFromGroups.toFixed(2)).toBe(body.gross_receipts)
    expect((await call(getSummary, '/summary?from=2026-09-01&to=2026-08-01')).status).toBe(400)
    expect((await call(getSummary, '/summary?from=2026-08-01')).status).toBe(400)
  })
})
