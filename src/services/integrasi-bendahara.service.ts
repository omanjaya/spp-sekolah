import { Prisma } from '@prisma/client'
import { z } from 'zod'

import { prisma } from '@/lib/db'
import { IntegrationError, type IntegrationClient } from '@/lib/integration/bendahara-auth'

/**
 * Service API integrasi bendahara (read-only).
 *
 * Sumber data:
 *  - Pembayaran  → payment. Satu baris = satu transaksi (satu No. Bukti BPD atau
 *                  satu input manual) untuk tepat satu bulan iuran, sehingga
 *                  `allocations` berisi satu elemen.
 *  - Pembayaran DIBATALKAN → status CANCELLED + adjustment REVERSAL.
 *  - Refund      → adjustment REFUND (uang benar-benar dikembalikan). Refund yang
 *                  dihapus tetap dikirim sebagai tombstone (status VOIDED).
 *
 * Konvensi waktu:
 *  - `Pembayaran.tanggalTransaksi` disimpan sebagai jam dinding lokal sekolah
 *    (WITA) di kolom timestamp tanpa zona, sehingga dikeluarkan dengan offset
 *    +08:00 tanpa konversi.
 *  - `createdAt`/`updatedAt`/`deletedAt`/`reviewedAt` adalah instan UTC asli.
 */

export const API_VERSION = '1.0.0'
export const SCHOOL_TIMEZONE = 'Asia/Makassar'
export const SCHOOL_UTC_OFFSET = '+08:00'
const OFFSET_MS = 8 * 60 * 60 * 1000
export const CURRENCY = 'IDR'

export const FUND = { code: 'SUMBANGAN_KOMITE', name: 'Sumbangan Komite (SPP)' } as const

const DEFAULT_LIMIT = 200
const MAX_LIMIT = 1000
const DEFAULT_SETTLE_SECONDS = 30

// ─── Format helpers ─────────────────────────────────────────────────────────

export function money(v: Prisma.Decimal | number | string): string {
  return new Prisma.Decimal(v).toFixed(2)
}

/** Timestamp jam-dinding lokal (disimpan sebagai UTC naif) → ISO dengan +08:00. */
export function wallClockIso(d: Date): string {
  return `${d.toISOString().slice(0, 19)}${SCHOOL_UTC_OFFSET}`
}

/** Instan UTC → tanggal kalender di zona sekolah. */
export function instantToLocalDate(d: Date): string {
  return new Date(d.getTime() + OFFSET_MS).toISOString().slice(0, 10)
}

export function academicYearOf(year: number, month: number): string {
  return month >= 7 ? `${year}/${year + 1}` : `${year - 1}/${year}`
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

// ─── Cursor (keyset di atas updatedAt, id) ─────────────────────────────────

interface Position {
  t: Date
  id: string
}

export function encodeCursor(p: Position): string {
  return Buffer.from(JSON.stringify({ v: 1, t: p.t.toISOString(), id: p.id }), 'utf8').toString('base64url')
}

export function decodeCursor(raw: string): Position {
  try {
    const obj = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as { v?: number; t?: string; id?: string }
    const t = new Date(obj.t ?? '')
    if (obj.v !== 1 || Number.isNaN(t.getTime()) || typeof obj.id !== 'string') throw new Error('bad')
    return { t, id: obj.id }
  } catch {
    throw new IntegrationError(400, 'INVALID_CURSOR', 'Cursor tidak valid.')
  }
}

const feedQuerySchema = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    updated_since: z
      .string()
      .datetime({ offset: true, message: 'Gunakan ISO 8601 dengan zona waktu, mis. 2026-11-01T00:00:00+08:00.' })
      .optional(),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  })
  .refine((q) => !(q.cursor && q.updated_since), {
    message: 'Gunakan salah satu: cursor atau updated_since.',
    path: ['cursor'],
  })

function parseFeedQuery(params: URLSearchParams): { position: Position | null; limit: number } {
  const q = feedQuerySchema.parse({
    cursor: params.get('cursor') ?? undefined,
    updated_since: params.get('updated_since') ?? undefined,
    limit: params.get('limit') ?? undefined,
  })
  // updated_since = posisi (t, '') → updatedAt >= t.
  const position = q.cursor ? decodeCursor(q.cursor) : q.updated_since ? { t: new Date(q.updated_since), id: '' } : null
  return { position, limit: q.limit }
}

function settledUntil(): Date {
  const raw = Number(process.env.BENDAHARA_API_SETTLE_SECONDS)
  const seconds = Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_SETTLE_SECONDS
  return new Date(Date.now() - seconds * 1000)
}

function keysetWhere(position: Position | null, upper: Date) {
  return {
    AND: [
      { updatedAt: { lte: upper } },
      ...(position
        ? [{ OR: [{ updatedAt: { gt: position.t } }, { updatedAt: position.t, id: { gt: position.id } }] }]
        : []),
    ],
  }
}

function pageMeta<T extends { updatedAt: Date; id: string }>(rows: T[], limit: number, position: Position | null, upper: Date) {
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  const next = last ? { t: last.updatedAt, id: last.id } : position
  return {
    page,
    pagination: {
      limit,
      has_more: hasMore,
      next_cursor: next ? encodeCursor(next) : null,
      settled_until: upper.toISOString(),
    },
  }
}

// ─── DTO ──────────────────────────────────────────────────────────────────

type RefundRow = Prisma.RefundGetPayload<Record<string, never>>

function refundAdjustment(r: RefundRow) {
  return {
    adjustment_id: r.id,
    type: 'REFUND' as const,
    payment_id: r.pembayaranId,
    student_id: r.siswaId,
    amount: money(r.amount),
    occurred_on: r.tanggal.toISOString().slice(0, 10),
    document_number: r.noBukti,
    reason: r.alasan,
    status: r.deletedAt ? ('VOIDED' as const) : ('ACTIVE' as const),
    voided_at: r.deletedAt ? r.deletedAt.toISOString() : null,
    created_at: r.createdAt.toISOString(),
    updated_at: r.updatedAt.toISOString(),
  }
}

const paymentInclude = {
  siswa: { select: { id: true, nis: true, nama: true } },
  refunds: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
  cancelRequests: {
    where: { status: 'APPROVED' },
    orderBy: { reviewedAt: 'desc' },
    take: 1,
    select: { id: true, alasan: true, reviewedAt: true },
  },
} satisfies Prisma.PembayaranInclude

type PaymentRow = Prisma.PembayaranGetPayload<{ include: typeof paymentInclude }>

interface EnrollmentInfo {
  academic_year: string
  grade: string
  rombel: string
  rombel_id: string
}

async function loadEnrollments(siswaIds: string[]): Promise<Map<string, EnrollmentInfo>> {
  const map = new Map<string, EnrollmentInfo>()
  if (siswaIds.length === 0) return map
  const rows = await prisma.enrollment.findMany({
    where: { siswaId: { in: siswaIds } },
    select: {
      siswaId: true,
      tahunAjaran: { select: { kode: true } },
      rombel: { select: { id: true, kode: true, grade: true } },
    },
  })
  for (const e of rows) {
    map.set(`${e.siswaId}|${e.tahunAjaran.kode}`, {
      academic_year: e.tahunAjaran.kode,
      grade: e.rombel.grade,
      rombel: e.rombel.kode,
      rombel_id: e.rombel.id,
    })
  }
  return map
}

/** Waktu & alasan pembatalan langsung (tanpa cancel request) dari audit log. */
async function loadDirectCancels(ids: string[]): Promise<Map<string, { at: Date; reason: string | null }>> {
  const map = new Map<string, { at: Date; reason: string | null }>()
  if (ids.length === 0) return map
  const logs = await prisma.auditLog.findMany({
    where: { action: 'PEMBAYARAN_CANCEL', entity: 'Pembayaran', entityId: { in: ids } },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, createdAt: true, metadata: true },
  })
  for (const l of logs) {
    if (!l.entityId || map.has(l.entityId)) continue
    const meta = l.metadata as { catatan?: unknown } | null
    map.set(l.entityId, { at: l.createdAt, reason: typeof meta?.catatan === 'string' ? meta.catatan : null })
  }
  return map
}

function toPayment(
  p: PaymentRow,
  schoolId: string,
  enrollments: Map<string, EnrollmentInfo>,
  directCancels: Map<string, { at: Date; reason: string | null }>,
) {
  const cancelled = p.statusBayar === 'DIBATALKAN'
  const academicYear = academicYearOf(p.periodYear, p.periodMonth)
  const paidAt = p.tanggalTransaksi
  const hasTime = paidAt.toISOString().slice(11, 19) !== '00:00:00'

  const adjustments: Array<Record<string, unknown>> = []
  if (cancelled) {
    const req = p.cancelRequests[0]
    const direct = directCancels.get(p.id)
    const at = req?.reviewedAt ?? direct?.at ?? p.updatedAt
    adjustments.push({
      adjustment_id: `rev_${p.id}`,
      type: 'REVERSAL',
      payment_id: p.id,
      student_id: p.siswaId,
      amount: money(p.amount),
      occurred_at: at.toISOString(),
      occurred_on: instantToLocalDate(at),
      document_number: null,
      reason: req?.alasan ?? direct?.reason ?? p.catatan,
      status: 'ACTIVE',
      source: req ? 'CANCEL_REQUEST' : direct ? 'DIRECT_CANCEL' : 'UNKNOWN',
      cancel_request_id: req?.id ?? null,
    })
  }
  let refunded = new Prisma.Decimal(0)
  for (const r of p.refunds) {
    adjustments.push(refundAdjustment(r))
    if (!r.deletedAt) refunded = refunded.plus(r.amount)
  }
  const amount = new Prisma.Decimal(p.amount)
  const effective = cancelled ? new Prisma.Decimal(0) : amount

  return {
    payment_id: p.id,
    school_id: schoolId,
    student: { student_id: p.siswa.id, nis: p.siswa.nis, name: p.siswa.nama },
    enrollment: enrollments.get(`${p.siswaId}|${academicYear}`) ?? null,
    receipt_number: p.noBukti,
    fund: FUND,
    channel: {
      code: p.source === 'MANUAL' ? 'MANUAL' : 'BPD',
      source: p.source,
      branch_code: p.kodeCabang,
      teller: p.tellerUser,
    },
    currency: CURRENCY,
    amount: money(amount),
    admin_fee: money(p.biayaAdm),
    total_paid: money(amount.plus(p.biayaAdm)),
    is_cash_receipt: amount.greaterThan(0),
    paid_at: wallClockIso(paidAt),
    paid_date: paidAt.toISOString().slice(0, 10),
    paid_time_known: hasTime,
    status: cancelled ? 'CANCELLED' : 'PAID',
    allocations: [
      {
        allocation_id: `${p.id}:${periodKey(p.periodYear, p.periodMonth)}`,
        year: p.periodYear,
        month: p.periodMonth,
        academic_year: academicYear,
        amount: money(amount),
      },
    ],
    refunded_amount: money(refunded),
    net_amount: money(effective.minus(refunded)),
    adjustments,
    note: p.catatan,
    created_at: p.createdAt.toISOString(),
    updated_at: p.updatedAt.toISOString(),
  }
}

export type PaymentDto = ReturnType<typeof toPayment>

// ─── Summary ──────────────────────────────────────────────────────────────

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal YYYY-MM-DD.')

const summaryQuerySchema = z
  .object({
    from: dateString,
    to: dateString,
    group_by: z.enum(['none', 'day', 'month']).default('none'),
  })
  .refine((q) => q.from <= q.to, { message: '`from` harus <= `to`.', path: ['to'] })
  .refine((q) => !Number.isNaN(Date.parse(`${q.from}T00:00:00Z`)) && !Number.isNaN(Date.parse(`${q.to}T00:00:00Z`)), {
    message: 'Tanggal tidak valid.',
    path: ['from'],
  })
  .refine((q) => Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`) <= 3660 * 86_400_000, {
    message: 'Rentang maksimal 10 tahun.',
    path: ['to'],
  })

interface Bucket {
  gross: Prisma.Decimal
  adminFees: Prisma.Decimal
  payments: number
  cashPayments: number
  cancelledAmount: Prisma.Decimal
  cancelledPayments: number
  refunds: Prisma.Decimal
  refundCount: number
}

function emptyBucket(): Bucket {
  const zero = new Prisma.Decimal(0)
  return { gross: zero, adminFees: zero, payments: 0, cashPayments: 0, cancelledAmount: zero, cancelledPayments: 0, refunds: zero, refundCount: 0 }
}

function bucketJson(b: Bucket) {
  return {
    gross_receipts: money(b.gross),
    refunds: money(b.refunds),
    net_receipts: money(b.gross.minus(b.refunds)),
    admin_fees: money(b.adminFees),
    cancelled_amount: money(b.cancelledAmount),
    counts: {
      payments: b.payments,
      cash_payments: b.cashPayments,
      cancelled_payments: b.cancelledPayments,
      refunds: b.refundCount,
    },
  }
}

// ─── Service ──────────────────────────────────────────────────────────────

export const integrasiBendaharaService = {
  async info(client: IntegrationClient) {
    const keys = ['school.name', 'school.address', 'school.npsn']
    const settings = await prisma.setting.findMany({ where: { key: { in: keys } } })
    const get = (k: string) => {
      const v = settings.find((s) => s.key === k)?.value
      return typeof v === 'string' && v.trim() ? v : null
    }
    return {
      api_version: API_VERSION,
      school: {
        school_id: client.schoolId,
        name: get('school.name'),
        npsn: get('school.npsn'),
        address: get('school.address'),
      },
      currency: CURRENCY,
      timezone: SCHOOL_TIMEZONE,
      utc_offset: SCHOOL_UTC_OFFSET,
      funds: [FUND],
      token: { token_id: client.tokenId, scopes: client.scopes },
      sync: {
        settle_lag_seconds: Math.round((Date.now() - settledUntil().getTime()) / 1000),
        max_page_size: MAX_LIMIT,
        default_page_size: DEFAULT_LIMIT,
      },
      server_time: new Date().toISOString(),
    }
  },

  async payments(client: IntegrationClient, params: URLSearchParams) {
    const { position, limit } = parseFeedQuery(params)
    const upper = settledUntil()
    const rows = await prisma.pembayaran.findMany({
      where: keysetWhere(position, upper),
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: paymentInclude,
    })
    const { page, pagination } = pageMeta(rows, limit, position, upper)
    const cancelledWithoutRequest = page
      .filter((p) => p.statusBayar === 'DIBATALKAN' && p.cancelRequests.length === 0)
      .map((p) => p.id)
    const [enrollments, directCancels] = await Promise.all([
      loadEnrollments([...new Set(page.map((p) => p.siswaId))]),
      loadDirectCancels(cancelledWithoutRequest),
    ])
    return {
      data: page.map((p) => toPayment(p, client.schoolId, enrollments, directCancels)),
      pagination,
    }
  },

  async refunds(client: IntegrationClient, params: URLSearchParams) {
    const { position, limit } = parseFeedQuery(params)
    const upper = settledUntil()
    const rows = await prisma.refund.findMany({
      where: keysetWhere(position, upper),
      orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      include: { siswa: { select: { id: true, nis: true, nama: true } } },
    })
    const { page, pagination } = pageMeta(rows, limit, position, upper)
    return {
      data: page.map((r) => ({
        ...refundAdjustment(r),
        school_id: client.schoolId,
        student: { student_id: r.siswa.id, nis: r.siswa.nis, name: r.siswa.nama },
        currency: CURRENCY,
      })),
      pagination,
    }
  },

  async summary(client: IntegrationClient, params: URLSearchParams) {
    const q = summaryQuerySchema.parse({
      from: params.get('from') ?? undefined,
      to: params.get('to') ?? undefined,
      group_by: params.get('group_by') ?? undefined,
    })
    // tanggalTransaksi = jam dinding WITA disimpan naif → batas tanggal dibandingkan langsung.
    const start = new Date(`${q.from}T00:00:00.000Z`)
    const end = new Date(Date.parse(`${q.to}T00:00:00.000Z`) + 86_400_000)
    const fmt = q.group_by === 'day' ? 'YYYY-MM-DD' : q.group_by === 'month' ? 'YYYY-MM' : '"all"'

    const [payRows, refundRows] = await Promise.all([
      prisma.$queryRaw<
        Array<{ k: string; status: string; cash: boolean; n: bigint; amount: Prisma.Decimal | null; adm: Prisma.Decimal | null }>
      >`
        SELECT to_char("tanggalTransaksi", ${fmt}) AS k, "statusBayar"::text AS status, (amount > 0) AS cash,
               count(*) AS n, sum(amount) AS amount, sum("biayaAdm") AS adm
        FROM "Pembayaran"
        WHERE "tanggalTransaksi" >= ${start} AND "tanggalTransaksi" < ${end}
        GROUP BY 1, 2, 3`,
      prisma.$queryRaw<Array<{ k: string; n: bigint; amount: Prisma.Decimal | null }>>`
        SELECT to_char(tanggal, ${fmt}) AS k, count(*) AS n, sum(amount) AS amount
        FROM "Refund"
        WHERE "deletedAt" IS NULL AND tanggal >= ${start}::date AND tanggal < ${end}::date
        GROUP BY 1`,
    ])

    const total = emptyBucket()
    const groups = new Map<string, Bucket>()
    const bucketsFor = (k: string) => {
      if (q.group_by === 'none') return [total]
      let b = groups.get(k)
      if (!b) groups.set(k, (b = emptyBucket()))
      return [total, b]
    }
    for (const r of payRows) {
      const amount = new Prisma.Decimal(r.amount ?? 0)
      const n = Number(r.n)
      for (const b of bucketsFor(r.k)) {
        if (r.status === 'DIBATALKAN') {
          b.cancelledAmount = b.cancelledAmount.plus(amount)
          b.cancelledPayments += n
        } else {
          b.gross = b.gross.plus(amount)
          b.adminFees = b.adminFees.plus(r.adm ?? 0)
          b.payments += n
          if (r.cash) b.cashPayments += n
        }
      }
    }
    for (const r of refundRows) {
      for (const b of bucketsFor(r.k)) {
        b.refunds = b.refunds.plus(r.amount ?? 0)
        b.refundCount += Number(r.n)
      }
    }

    return {
      school_id: client.schoolId,
      currency: CURRENCY,
      period: { from: q.from, to: q.to, basis: 'payment_date', timezone: SCHOOL_TIMEZONE },
      ...bucketJson(total),
      ...(q.group_by !== 'none'
        ? {
            group_by: q.group_by,
            groups: [...groups.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, b]) => ({ key, ...bucketJson(b) })),
          }
        : {}),
      generated_at: new Date().toISOString(),
    }
  },
}
