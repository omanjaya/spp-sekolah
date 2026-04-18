/**
 * Kwitansi PDF — ukuran F4 (215mm × 330mm) portrait.
 * Satu halaman berisi 2 lembar identik (asli + tembusan) dipisah garis putus.
 *
 * Ukuran dalam react-pdf points (1pt = 1/72 inch):
 *   215mm → 609.45pt  ≈ 609
 *   330mm → 935.43pt  ≈ 935
 */

import { Document, Page, Text, View, StyleSheet, Line, Svg } from '@react-pdf/renderer'

import type { KwitansiDto } from '@/services/kwitansi.service'

// ─── Constants ──────────────────────────────────────────────────────────────

const F4_W = 609
const F4_H = 935

const MONTH_NAMES = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth() + 1]} ${d.getFullYear()}`
}

function fmtRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}

/** Terbilang sederhana (sampai ratusan juta). */
function terbilang(n: number): string {
  const satuan = ['', 'satu', 'dua', 'tiga', 'empat', 'lima',
    'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas']
  if (n < 12) return satuan[n]!
  if (n < 20) return satuan[n - 10]! + ' belas'
  if (n < 100) {
    const d = Math.floor(n / 10), s = n % 10
    return satuan[d]! + ' puluh' + (s ? ' ' + satuan[s]! : '')
  }
  if (n < 200) return 'seratus' + (n % 100 ? ' ' + terbilang(n % 100) : '')
  if (n < 1000) {
    const d = Math.floor(n / 100), s = n % 100
    return satuan[d]! + ' ratus' + (s ? ' ' + terbilang(s) : '')
  }
  if (n < 2000) return 'seribu' + (n % 1000 ? ' ' + terbilang(n % 1000) : '')
  if (n < 1_000_000) {
    const d = Math.floor(n / 1000), s = n % 1000
    return terbilang(d) + ' ribu' + (s ? ' ' + terbilang(s) : '')
  }
  if (n < 1_000_000_000) {
    const d = Math.floor(n / 1_000_000), s = n % 1_000_000
    return terbilang(d) + ' juta' + (s ? ' ' + terbilang(s) : '')
  }
  const d = Math.floor(n / 1_000_000_000), s = n % 1_000_000_000
  return terbilang(d) + ' miliar' + (s ? ' ' + terbilang(s) : '')
}

function terbilangRupiah(n: number): string {
  if (n === 0) return 'Nol rupiah'
  const result = terbilang(Math.round(n))
  return result.charAt(0).toUpperCase() + result.slice(1) + ' rupiah'
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const C = {
  ink:    '#0f172a',
  muted:  '#64748b',
  faint:  '#94a3b8',
  line:   '#cbd5e1',
  bg:     '#f8fafc',
  head:   '#0f172a',
  accent: '#1e40af',   // biru sekolah
}

const s = StyleSheet.create({
  page: {
    width: F4_W,
    height: F4_H,
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 16,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.ink,
    backgroundColor: '#ffffff',
  },

  // ── receipt block (dipakai 2x: asli + tembusan) ──
  block: {
    flex: 1,
    flexDirection: 'column',
  },

  // header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
    borderBottomWidth: 1.5,
    borderBottomColor: C.head,
    paddingBottom: 6,
  },
  logoBox: {
    width: 40,
    height: 40,
    borderRadius: 4,
    backgroundColor: C.head,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  logoText: {
    color: '#ffffff',
    fontFamily: 'Helvetica-Bold',
    fontSize: 10,
    textAlign: 'center',
  },
  schoolCol: {
    flex: 1,
  },
  schoolName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
    color: C.head,
    letterSpacing: 0.5,
  },
  schoolAddress: {
    fontSize: 7,
    color: C.muted,
    marginTop: 1,
  },
  titleBox: {
    alignItems: 'flex-end',
  },
  titleLabel: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 14,
    color: C.accent,
    letterSpacing: 1,
  },
  nomorText: {
    fontSize: 7.5,
    color: C.muted,
    marginTop: 2,
  },

  // meta baris
  metaSection: {
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  metaLabel: {
    width: 110,
    fontSize: 8,
    color: C.muted,
  },
  metaColon: {
    width: 10,
    fontSize: 8,
    color: C.muted,
  },
  metaValue: {
    flex: 1,
    fontSize: 8,
    color: C.ink,
    fontFamily: 'Helvetica-Bold',
  },

  // tabel item
  table: {
    borderWidth: 0.5,
    borderColor: C.line,
    marginBottom: 6,
  },
  theadRow: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
  },
  trow: {
    flexDirection: 'row',
    borderBottomWidth: 0.25,
    borderBottomColor: C.line,
  },
  trowLast: {
    flexDirection: 'row',
  },
  thNo:     { width: 24,  paddingVertical: 3, paddingHorizontal: 4, fontFamily: 'Helvetica-Bold', fontSize: 7, textAlign: 'center' },
  thPeriod: { flex: 1,    paddingVertical: 3, paddingHorizontal: 4, fontFamily: 'Helvetica-Bold', fontSize: 7 },
  thKet:    { flex: 2,    paddingVertical: 3, paddingHorizontal: 4, fontFamily: 'Helvetica-Bold', fontSize: 7 },
  thAmount: { width: 90,  paddingVertical: 3, paddingHorizontal: 4, fontFamily: 'Helvetica-Bold', fontSize: 7, textAlign: 'right' },
  tdNo:     { width: 24,  paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 7.5, textAlign: 'center' },
  tdPeriod: { flex: 1,    paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 7.5 },
  tdKet:    { flex: 2,    paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 7.5, color: C.muted },
  tdAmount: { width: 90,  paddingVertical: 2.5, paddingHorizontal: 4, fontSize: 7.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },

  // total row
  totalRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.head,
    backgroundColor: C.bg,
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  totalLabel: {
    flex: 1,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textAlign: 'right',
    paddingRight: 8,
  },
  totalAmount: {
    width: 90,
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textAlign: 'right',
    paddingHorizontal: 4,
    color: C.accent,
  },

  // terbilang
  terbilangBox: {
    backgroundColor: C.bg,
    borderWidth: 0.5,
    borderColor: C.line,
    padding: 5,
    marginBottom: 10,
  },
  terbilangLabel: {
    fontSize: 7,
    color: C.muted,
    marginBottom: 2,
  },
  terbilangValue: {
    fontFamily: 'Helvetica-Oblique',
    fontSize: 8,
    color: C.ink,
  },

  // tanda tangan
  sigRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sigBox: {
    width: 140,
    alignItems: 'center',
  },
  sigLabel: {
    fontSize: 7.5,
    color: C.muted,
    marginBottom: 2,
    textAlign: 'center',
  },
  sigSpace: {
    height: 38,
  },
  sigName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 8,
    textAlign: 'center',
    borderTopWidth: 0.75,
    borderTopColor: C.line,
    paddingTop: 3,
    width: 130,
  },
  sigNip: {
    fontSize: 6.5,
    color: C.muted,
    textAlign: 'center',
  },

  // catatan footer
  catatanText: {
    fontSize: 7,
    color: C.muted,
    fontFamily: 'Helvetica-Oblique',
    marginBottom: 8,
  },

  // label asli / tembusan
  copyLabel: {
    fontSize: 7,
    color: C.faint,
    textAlign: 'right',
    fontFamily: 'Helvetica-Oblique',
    marginBottom: 4,
  },

  // separator putus-putus (antar lembar)
  separator: {
    marginVertical: 10,
  },
})

// ─── Sub-components ──────────────────────────────────────────────────────────

interface ReceiptBlockProps {
  data: KwitansiDto
  school: SchoolInfo
  copy: 'ASLI' | 'TEMBUSAN'
}

function ReceiptBlock({ data, school, copy }: ReceiptBlockProps) {
  const totalWithAdm = data.totalAmount + data.biayaAdm
  return (
    <View style={s.block}>
      {/* ── copy label ── */}
      <Text style={s.copyLabel}>{copy}</Text>

      {/* ── header ── */}
      <View style={s.headerRow}>
        <View style={s.logoBox}>
          <Text style={s.logoText}>SMAN</Text>
          <Text style={[s.logoText, { fontSize: 14 }]}>1</Text>
        </View>
        <View style={s.schoolCol}>
          <Text style={s.schoolName}>{school.namaSekolah}</Text>
          {school.alamat ? <Text style={s.schoolAddress}>{school.alamat}</Text> : null}
          {school.npsn ? <Text style={s.schoolAddress}>NPSN: {school.npsn}</Text> : null}
        </View>
        <View style={s.titleBox}>
          <Text style={s.titleLabel}>KWITANSI</Text>
          <Text style={s.nomorText}>No: {data.nomorKwitansi}</Text>
          <Text style={s.nomorText}>Tgl: {fmtDate(data.tanggal)}</Text>
        </View>
      </View>

      {/* ── meta ── */}
      <View style={s.metaSection}>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>Telah diterima dari</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{data.namaOrangTua ?? '—'}</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>Untuk siswa</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{data.siswa.nama} ({data.siswa.nis})</Text>
        </View>
        <View style={s.metaRow}>
          <Text style={s.metaLabel}>Angkatan</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{data.siswa.angkatan}</Text>
        </View>
      </View>

      {/* ── tabel item ── */}
      <View style={s.table}>
        {/* thead */}
        <View style={s.theadRow}>
          <Text style={s.thNo}>No</Text>
          <Text style={s.thPeriod}>Periode</Text>
          <Text style={s.thKet}>Keterangan</Text>
          <Text style={s.thAmount}>Jumlah</Text>
        </View>
        {/* rows */}
        {data.items.map((item, i) => {
          const isLast = i === data.items.length - 1
          return (
            <View key={item.id} style={isLast ? s.trowLast : s.trow}>
              <Text style={s.tdNo}>{i + 1}</Text>
              <Text style={s.tdPeriod}>
                {MONTH_NAMES[item.periodMonth]} {item.periodYear}
              </Text>
              <Text style={s.tdKet}>
                {item.keterangan ?? `SPP Komite ${MONTH_NAMES[item.periodMonth]} ${item.periodYear}`}
              </Text>
              <Text style={s.tdAmount}>{fmtRupiah(item.amount)}</Text>
            </View>
          )
        })}
        {/* biaya adm row if any */}
        {data.biayaAdm > 0 && (
          <View style={s.trowLast}>
            <Text style={s.tdNo}>{data.items.length + 1}</Text>
            <Text style={s.tdPeriod}>—</Text>
            <Text style={s.tdKet}>Biaya Administrasi</Text>
            <Text style={s.tdAmount}>{fmtRupiah(data.biayaAdm)}</Text>
          </View>
        )}
        {/* total */}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>TOTAL</Text>
          <Text style={s.totalAmount}>{fmtRupiah(totalWithAdm)}</Text>
        </View>
      </View>

      {/* ── terbilang ── */}
      <View style={s.terbilangBox}>
        <Text style={s.terbilangLabel}>Terbilang:</Text>
        <Text style={s.terbilangValue}>{terbilangRupiah(totalWithAdm)}</Text>
      </View>

      {/* ── catatan ── */}
      {data.catatan ? (
        <Text style={s.catatanText}>Catatan: {data.catatan}</Text>
      ) : null}

      {/* ── tanda tangan ── */}
      <View style={s.sigRow}>
        <View style={s.sigBox}>
          <Text style={s.sigLabel}>Penerima / Wali Murid</Text>
          <View style={s.sigSpace} />
          <Text style={s.sigName}>{data.namaOrangTua ?? '(                             )'}</Text>
        </View>
        <View style={s.sigBox}>
          <Text style={s.sigLabel}>Bendahara</Text>
          <View style={s.sigSpace} />
          <Text style={s.sigName}>{data.createdBy.nama}</Text>
          <Text style={s.sigNip}>Bendahara Komite</Text>
        </View>
      </View>
    </View>
  )
}

// ─── Separator garis putus ────────────────────────────────────────────────

function DashedSeparator() {
  return (
    <View style={s.separator}>
      <Svg height={10} width={F4_W - 64}>
        <Line
          x1={0} y1={5}
          x2={F4_W - 64} y2={5}
          strokeWidth={0.75}
          stroke={C.faint}
          strokeDasharray="4 3"
        />
      </Svg>
      <Text style={{ fontSize: 6.5, color: C.faint, textAlign: 'center', marginTop: -2 }}>
        ✂  potong di sini  ✂
      </Text>
    </View>
  )
}

// ─── Main Document ───────────────────────────────────────────────────────────

export interface SchoolInfo {
  namaSekolah: string
  alamat?: string
  npsn?: string
}

interface KwitansiDocumentProps {
  data: KwitansiDto
  school: SchoolInfo
}

export function KwitansiDocument({ data, school }: KwitansiDocumentProps) {
  return (
    <Document
      title={`Kwitansi ${data.nomorKwitansi}`}
      author={school.namaSekolah}
      creator="Sistem Pembayaran SPP"
    >
      <Page size={[F4_W, F4_H]} style={s.page}>
        <ReceiptBlock data={data} school={school} copy="ASLI" />
        <DashedSeparator />
        <ReceiptBlock data={data} school={school} copy="TEMBUSAN" />
      </Page>
    </Document>
  )
}
