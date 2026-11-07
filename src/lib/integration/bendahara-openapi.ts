/**
 * Kontrak OpenAPI 3.1 API integrasi bendahara v1.
 * Dokumentasi naratif: docs/integrasi-bendahara-api.md
 */

const money = { type: 'string', pattern: '^-?\\d+\\.\\d{2}$', description: 'Rupiah, string desimal 2 angka di belakang titik.', example: '350000.00' }
const instant = { type: 'string', format: 'date-time', description: 'Instan UTC (ISO 8601, akhiran Z).', example: '2026-11-03T02:15:04.120Z' }
const date = { type: 'string', format: 'date', example: '2026-11-03' }
const nullable = (s: Record<string, unknown>) => ({ ...s, type: [s.type as string, 'null'] })

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
})

const feedParams = [
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: '`next_cursor` dari halaman sebelumnya / sinkronisasi terakhir. Tidak boleh digabung dengan updated_since.' },
  { name: 'updated_since', in: 'query', schema: { type: 'string', format: 'date-time' }, description: 'Ambil perubahan dengan updated_at >= nilai ini (ISO 8601 dengan zona waktu).' },
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 1000, default: 200 } },
  { name: 'school_id', in: 'query', schema: { type: 'string' }, description: 'Opsional. Jika diisi harus sama dengan sekolah token, selain itu 403.' },
]

const paymentParams = [
  ...feedParams,
  {
    name: 'period_from',
    in: 'query',
    schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$', example: '2025-01' },
    description:
      'Hanya pembayaran dengan bulan iuran (allocations.year/month) >= YYYY-MM. Ikut tersimpan di next_cursor: halaman lanjutan cukup membawa cursor. Cursor dengan period_from berbeda ditolak 400.',
  },
]

const commonErrors = {
  '400': errorResponse('Parameter tidak valid (VALIDATION_ERROR / INVALID_CURSOR).'),
  '401': errorResponse('Token tidak ada, salah, atau sudah dicabut.'),
  '403': errorResponse('Token bukan untuk sekolah ini (SCHOOL_FORBIDDEN).'),
  '429': errorResponse('Batas permintaan terlampaui. Lihat header Retry-After.'),
}

export const bendaharaOpenApi = {
  openapi: '3.1.0',
  info: {
    title: 'SPP SMAN 1 Denpasar — API Integrasi Bendahara',
    version: '1.1.0',
    description:
      'API baca-saja antarpeladen untuk menyinkronkan pembayaran Sumbangan Komite (SPP), refund, dan pembatalan ke aplikasi bendahara.',
  },
  servers: [{ url: 'https://spp.nouma.id/api/integrations/bendahara/v1' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/info': {
      get: {
        summary: 'Identitas sekolah, versi API, mata uang, zona waktu',
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Info' } } } }, ...commonErrors },
      },
    },
    '/payments': {
      get: {
        summary: 'Feed pembayaran (pengambilan awal + perubahan inkremental)',
        description:
          'Diurutkan stabil berdasarkan (updated_at, payment_id). Tanpa cursor/updated_since = seluruh riwayat dari awal. Setiap perubahan (pembatalan, refund, koreksi) menaikkan updated_at sehingga pembayaran muncul lagi; upsert berdasarkan payment_id.',
        parameters: paymentParams,
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data', 'pagination', 'filters'],
                  properties: {
                    data: { type: 'array', items: { $ref: '#/components/schemas/Payment' } },
                    pagination: { $ref: '#/components/schemas/Pagination' },
                    filters: { type: 'object', properties: { period_from: { type: ['string', 'null'], example: '2025-01' } } },
                  },
                },
              },
            },
          },
          ...commonErrors,
        },
      },
    },
    '/refunds': {
      get: {
        summary: 'Feed refund (termasuk refund tanpa pembayaran asal dan tombstone refund yang dibatalkan)',
        parameters: feedParams,
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['data', 'pagination'],
                  properties: { data: { type: 'array', items: { $ref: '#/components/schemas/RefundRecord' } }, pagination: { $ref: '#/components/schemas/Pagination' } },
                },
              },
            },
          },
          ...commonErrors,
        },
      },
    },
    '/summary': {
      get: {
        summary: 'Ringkasan penerimaan untuk rentang tanggal pembayaran',
        parameters: [
          { name: 'from', in: 'query', required: true, schema: date, description: 'Tanggal awal (inklusif), zona Asia/Makassar.' },
          { name: 'to', in: 'query', required: true, schema: date, description: 'Tanggal akhir (inklusif).' },
          { name: 'group_by', in: 'query', schema: { type: 'string', enum: ['none', 'day', 'month'], default: 'none' } },
          { name: 'school_id', in: 'query', schema: { type: 'string' } },
        ],
        responses: { '200': { description: 'OK', content: { 'application/json': { schema: { $ref: '#/components/schemas/Summary' } } } }, ...commonErrors },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', description: 'Token `sppbdh_<token_id>_<64 hex>`. Baca-saja, terikat satu sekolah.' },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: { type: 'string', enum: ['UNAUTHORIZED', 'SCHOOL_FORBIDDEN', 'RATE_LIMITED', 'VALIDATION_ERROR', 'INVALID_CURSOR', 'NOT_CONFIGURED', 'INTERNAL_ERROR'] },
              message: { type: 'string' },
              details: {},
            },
          },
        },
      },
      Pagination: {
        type: 'object',
        required: ['limit', 'has_more', 'next_cursor', 'settled_until'],
        properties: {
          limit: { type: 'integer' },
          has_more: { type: 'boolean', description: 'true = segera ambil halaman berikutnya dengan next_cursor.' },
          next_cursor: { type: ['string', 'null'], description: 'Watermark. Simpan nilai ini setelah halaman terakhir (has_more=false) untuk sinkronisasi berikutnya.' },
          settled_until: { ...instant, description: 'Hanya baris dengan updated_at <= nilai ini yang dikirim (jeda pengendapan transaksi).' },
        },
      },
      Info: {
        type: 'object',
        properties: {
          api_version: { type: 'string', example: '1.0.0' },
          school: {
            type: 'object',
            properties: { school_id: { type: 'string' }, name: { type: ['string', 'null'] }, npsn: { type: ['string', 'null'] }, address: { type: ['string', 'null'] } },
          },
          currency: { type: 'string', example: 'IDR' },
          timezone: { type: 'string', example: 'Asia/Makassar' },
          utc_offset: { type: 'string', example: '+08:00' },
          funds: { type: 'array', items: { $ref: '#/components/schemas/Fund' } },
          token: { type: 'object', properties: { token_id: { type: 'string' }, scopes: { type: 'array', items: { type: 'string' } } } },
          sync: { type: 'object', properties: { settle_lag_seconds: { type: 'integer' }, max_page_size: { type: 'integer' }, default_page_size: { type: 'integer' } } },
          server_time: instant,
        },
      },
      Fund: {
        type: 'object',
        properties: { code: { type: 'string', example: 'SUMBANGAN_KOMITE' }, name: { type: 'string', example: 'Sumbangan Komite (SPP)' } },
      },
      Allocation: {
        type: 'object',
        required: ['allocation_id', 'year', 'month', 'academic_year', 'amount'],
        properties: {
          allocation_id: { type: 'string', description: 'Tetap: `<payment_id>:<YYYY-MM>`.' },
          year: { type: 'integer', description: 'Tahun bulan iuran (bukan tahun pembayaran).' },
          month: { type: 'integer', minimum: 1, maximum: 12 },
          academic_year: { type: 'string', example: '2026/2027' },
          amount: money,
        },
      },
      Adjustment: {
        type: 'object',
        required: ['adjustment_id', 'type', 'amount', 'status'],
        properties: {
          adjustment_id: { type: 'string', description: 'REFUND: id refund. REVERSAL: `rev_<payment_id>`.' },
          type: { type: 'string', enum: ['REFUND', 'REVERSAL'] },
          payment_id: { type: ['string', 'null'] },
          student_id: { type: 'string' },
          amount: money,
          occurred_on: { ...date, description: 'Tanggal kejadian (zona sekolah).' },
          occurred_at: { ...instant, description: 'Hanya REVERSAL.' },
          document_number: { type: ['string', 'null'] },
          reason: { type: ['string', 'null'] },
          status: { type: 'string', enum: ['ACTIVE', 'VOIDED'], description: 'VOIDED = refund dihapus/dibatalkan di SPP (tombstone).' },
          voided_at: nullable(instant),
          source: { type: 'string', enum: ['CANCEL_REQUEST', 'DIRECT_CANCEL', 'UNKNOWN'], description: 'Hanya REVERSAL.' },
          cancel_request_id: { type: ['string', 'null'] },
          created_at: instant,
          updated_at: instant,
        },
      },
      Payment: {
        type: 'object',
        required: ['payment_id', 'school_id', 'student', 'amount', 'admin_fee', 'paid_at', 'status', 'allocations', 'updated_at'],
        properties: {
          payment_id: { type: 'string', description: 'ID tetap dan unik; kunci upsert.' },
          school_id: { type: 'string' },
          student: {
            type: 'object',
            properties: { student_id: { type: 'string' }, nis: { type: 'string' }, name: { type: 'string' } },
          },
          enrollment: {
            type: ['object', 'null'],
            description: 'Kelas/rombel siswa pada tahun ajaran bulan iuran. null jika siswa tidak terdaftar di rombel tahun ajaran tersebut.',
            properties: { academic_year: { type: 'string' }, grade: { type: 'string', enum: ['X', 'XI', 'XII'] }, rombel: { type: 'string', example: 'XII.4' }, rombel_id: { type: 'string' } },
          },
          receipt_number: { type: ['string', 'null'], description: 'No. Bukti BPD. null untuk input manual.' },
          fund: { $ref: '#/components/schemas/Fund' },
          channel: {
            type: 'object',
            properties: {
              code: { type: 'string', enum: ['BPD', 'MANUAL'] },
              source: { type: 'string', enum: ['IMPORT_EXCEL', 'PASTE_SPREADSHEET', 'MANUAL'] },
              branch_code: { type: ['string', 'null'], description: 'Kode cabang/kanal mentah dari BPD (mis. TLR, EB, GAPURA, UEL, nomor cabang).' },
              teller: { type: ['string', 'null'] },
            },
          },
          currency: { type: 'string', example: 'IDR' },
          amount: { ...money, description: 'Nominal iuran (tanpa biaya administrasi).' },
          admin_fee: money,
          total_paid: { ...money, description: 'amount + admin_fee.' },
          is_cash_receipt: { type: 'boolean', description: 'false jika amount = 0 (penanda keringanan/pindahan, bukan uang masuk).' },
          paid_at: { type: 'string', format: 'date-time', example: '2026-11-03T10:15:00+08:00', description: 'Waktu pembayaran sebenarnya (WITA).' },
          paid_date: date,
          paid_time_known: { type: 'boolean', description: 'false jika sumber hanya memberi tanggal (jam 00:00:00).' },
          status: { type: 'string', enum: ['PAID', 'CANCELLED'] },
          allocations: { type: 'array', items: { $ref: '#/components/schemas/Allocation' } },
          refunded_amount: { ...money, description: 'Jumlah refund ACTIVE yang terkait pembayaran ini.' },
          net_amount: { ...money, description: '(amount jika PAID, 0 jika CANCELLED) - refunded_amount.' },
          adjustments: { type: 'array', items: { $ref: '#/components/schemas/Adjustment' } },
          note: { type: ['string', 'null'] },
          created_at: instant,
          updated_at: instant,
        },
      },
      RefundRecord: {
        allOf: [
          { $ref: '#/components/schemas/Adjustment' },
          {
            type: 'object',
            properties: {
              school_id: { type: 'string' },
              currency: { type: 'string' },
              student: { type: 'object', properties: { student_id: { type: 'string' }, nis: { type: 'string' }, name: { type: 'string' } } },
            },
          },
        ],
      },
      SummaryTotals: {
        type: 'object',
        properties: {
          gross_receipts: { ...money, description: 'Jumlah amount pembayaran PAID dengan tanggal bayar dalam periode.' },
          refunds: { ...money, description: 'Jumlah refund ACTIVE dengan tanggal refund dalam periode.' },
          net_receipts: { ...money, description: 'gross_receipts - refunds.' },
          admin_fees: { ...money, description: 'Biaya administrasi pembayaran PAID (tidak termasuk gross).' },
          cancelled_amount: { ...money, description: 'Informasi: nominal pembayaran CANCELLED dengan tanggal bayar dalam periode (tidak termasuk gross).' },
          counts: {
            type: 'object',
            properties: {
              payments: { type: 'integer' },
              cash_payments: { type: 'integer' },
              cancelled_payments: { type: 'integer' },
              refunds: { type: 'integer' },
            },
          },
        },
      },
      Summary: {
        allOf: [
          { $ref: '#/components/schemas/SummaryTotals' },
          {
            type: 'object',
            properties: {
              school_id: { type: 'string' },
              currency: { type: 'string' },
              period: {
                type: 'object',
                properties: { from: date, to: date, basis: { type: 'string', enum: ['payment_date'] }, timezone: { type: 'string' } },
              },
              group_by: { type: 'string', enum: ['day', 'month'] },
              groups: {
                type: 'array',
                items: { allOf: [{ type: 'object', properties: { key: { type: 'string', example: '2026-11' } } }, { $ref: '#/components/schemas/SummaryTotals' }] },
              },
              generated_at: instant,
            },
          },
        ],
      },
    },
  },
} as const
