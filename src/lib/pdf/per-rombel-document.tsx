/**
 * Laporan Per Rombel — PDF F4 portrait.
 *
 * 2 mode:
 *   - Single TA: PerRombelDocument({ rombels: PerRombelResult[] }) — 1 page per rombel.
 *   - Multi TA history: PerRombelHistoryDocument({ history: PerRombelHistoryResult }) —
 *     N page per TA yang sudah dilalui kohort (X=1, XI=2, XII=3).
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer'

import type {
  PerRombelResult,
  PerRombelHistoryResult,
  PerRombelHistoryPage,
  PerRombelSiswaRow,
} from '@/services/per-rombel-report.service'

// F4 portrait (215 × 330 mm) — sama dengan kwitansi
const F4_W = 609
const F4_H = 935

const C = {
  ink: '#0f172a',
  muted: '#64748b',
  faint: '#94a3b8',
  line: '#cbd5e1',
  bg: '#f8fafc',
  head: '#0f172a',
  accent: '#1e40af',
  good: '#15803d',
  warn: '#b45309',
  bad: '#b91c1c',
}

function fmtRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
}

const s = StyleSheet.create({
  page: {
    width: F4_W,
    height: F4_H,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 20,
    fontFamily: 'Helvetica',
    fontSize: 8,
    color: C.ink,
    backgroundColor: '#ffffff',
  },
  // Header
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1.5,
    borderBottomColor: C.head,
    paddingBottom: 6,
    marginBottom: 8,
  },
  schoolCol: { flex: 1 },
  schoolName: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.head, letterSpacing: 0.5 },
  schoolAddress: { fontSize: 7.5, color: C.muted, marginTop: 1 },
  titleBox: { alignItems: 'flex-end' },
  titleLabel: { fontFamily: 'Helvetica-Bold', fontSize: 12, color: C.accent, letterSpacing: 0.5 },
  titleSub: { fontSize: 7.5, color: C.muted, marginTop: 2 },
  // Meta
  metaRow: { flexDirection: 'row', marginBottom: 8 },
  metaCol: { flex: 1, flexDirection: 'row' },
  metaLabel: { fontSize: 8, color: C.muted, width: 80 },
  metaColon: { fontSize: 8, color: C.muted, width: 8 },
  metaValue: { fontFamily: 'Helvetica-Bold', fontSize: 8, color: C.ink, flex: 1 },
  // Summary cards
  summaryRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 6,
  },
  summaryCard: {
    flex: 1,
    borderWidth: 0.5,
    borderColor: C.line,
    backgroundColor: C.bg,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 3,
  },
  summaryLabel: { fontSize: 6.5, color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  summaryValue: { fontFamily: 'Helvetica-Bold', fontSize: 9, color: C.ink, marginTop: 1 },
  // Table
  table: {
    borderWidth: 0.5,
    borderColor: C.line,
    marginBottom: 8,
  },
  tHead: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
  },
  tRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.25,
    borderBottomColor: C.line,
  },
  tRowAlt: {
    flexDirection: 'row',
    borderBottomWidth: 0.25,
    borderBottomColor: C.line,
    backgroundColor: '#fafbfc',
  },
  thNo: { width: 20, paddingVertical: 2.5, paddingHorizontal: 3, fontFamily: 'Helvetica-Bold', fontSize: 6.5, textAlign: 'center' },
  thNis: { width: 50, paddingVertical: 2.5, paddingHorizontal: 3, fontFamily: 'Helvetica-Bold', fontSize: 6.5 },
  thName: { flex: 1, paddingVertical: 2.5, paddingHorizontal: 3, fontFamily: 'Helvetica-Bold', fontSize: 6.5 },
  thStatus: { width: 38, paddingVertical: 2.5, paddingHorizontal: 3, fontFamily: 'Helvetica-Bold', fontSize: 6.5, textAlign: 'center' },
  thMoney: { width: 70, paddingVertical: 2.5, paddingHorizontal: 3, fontFamily: 'Helvetica-Bold', fontSize: 6.5, textAlign: 'right' },
  thPct: { width: 34, paddingVertical: 2.5, paddingHorizontal: 3, fontFamily: 'Helvetica-Bold', fontSize: 6.5, textAlign: 'right' },
  tdNo: { width: 20, paddingVertical: 1.5, paddingHorizontal: 3, fontSize: 6.5, textAlign: 'center', color: C.muted },
  tdNis: { width: 50, paddingVertical: 1.5, paddingHorizontal: 3, fontSize: 6.5, fontFamily: 'Helvetica' },
  tdName: { flex: 1, paddingVertical: 1.5, paddingHorizontal: 3, fontSize: 7 },
  tdStatus: { width: 38, paddingVertical: 1.5, paddingHorizontal: 3, fontSize: 6, textAlign: 'center' },
  tdMoney: { width: 70, paddingVertical: 1.5, paddingHorizontal: 3, fontSize: 6.5, textAlign: 'right', fontFamily: 'Helvetica' },
  tdMoneyBad: { width: 70, paddingVertical: 1.5, paddingHorizontal: 3, fontSize: 6.5, textAlign: 'right', color: C.bad, fontFamily: 'Helvetica-Bold' },
  tdPct: { width: 34, paddingVertical: 1.5, paddingHorizontal: 3, fontSize: 6.5, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  // Total row
  totalRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: C.head,
    backgroundColor: C.bg,
  },
  totalLabel: {
    flex: 1,
    paddingVertical: 3,
    paddingHorizontal: 4,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textAlign: 'right',
  },
  totalMoney: {
    width: 70,
    paddingVertical: 3,
    paddingHorizontal: 3,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textAlign: 'right',
  },
  totalPct: {
    width: 34,
    paddingVertical: 3,
    paddingHorizontal: 3,
    fontFamily: 'Helvetica-Bold',
    fontSize: 7.5,
    textAlign: 'right',
  },
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 'auto',
    paddingTop: 4,
  },
  footerNote: { fontSize: 6.5, color: C.faint, fontFamily: 'Helvetica-Oblique' },
  sigBox: { width: 130, alignItems: 'center' },
  sigLabel: { fontSize: 6.5, color: C.muted, textAlign: 'center', marginBottom: 1 },
  sigDate: { fontSize: 6.5, color: C.muted, textAlign: 'center' },
  sigSpace: { height: 24 },
  sigName: { fontFamily: 'Helvetica-Bold', fontSize: 7.5, textAlign: 'center', borderTopWidth: 0.75, borderTopColor: C.line, paddingTop: 2, width: 120 },
})

export interface SchoolInfo {
  namaSekolah: string
  alamat?: string
  npsn?: string
}

interface RombelPageProps {
  data: PerRombelResult
  school: SchoolInfo
  printedAt: Date
}

function RombelPage({ data, school, printedAt }: RombelPageProps) {
  const totalBayar = data.siswa.reduce((acc, r) => acc + r.totalBayar, 0)
  const totalTunggakan = data.siswa.reduce((acc, r) => acc + r.totalTunggakan, 0)
  const avgLunas =
    data.siswa.length > 0
      ? Math.round(data.siswa.reduce((acc, r) => acc + r.persentaseLunas, 0) / data.siswa.length)
      : 0

  return (
    <Page size={[F4_W, F4_H]} style={s.page}>
      {/* Header */}
      <View style={s.headerRow}>
        <View style={s.schoolCol}>
          <Text style={s.schoolName}>{school.namaSekolah}</Text>
          {school.alamat ? <Text style={s.schoolAddress}>{school.alamat}</Text> : null}
          {school.npsn ? <Text style={s.schoolAddress}>NPSN: {school.npsn}</Text> : null}
        </View>
        <View style={s.titleBox}>
          <Text style={s.titleLabel}>LAPORAN PER ROMBEL</Text>
          <Text style={s.titleSub}>Tahun Ajaran {data.tahunAjaranKode}</Text>
        </View>
      </View>

      {/* Meta */}
      <View style={s.metaRow}>
        <View style={s.metaCol}>
          <Text style={s.metaLabel}>Kelas</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{data.rombelKode}</Text>
        </View>
        <View style={s.metaCol}>
          <Text style={s.metaLabel}>Tingkat</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{data.grade}</Text>
        </View>
        <View style={s.metaCol}>
          <Text style={s.metaLabel}>Bulan tagihan</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{data.totalBulan} bln</Text>
        </View>
      </View>

      {/* Summary cards */}
      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Siswa</Text>
          <Text style={s.summaryValue}>{data.siswa.length} orang</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Bayar</Text>
          <Text style={[s.summaryValue, { color: C.good }]}>{fmtRupiah(totalBayar)}</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Tunggakan</Text>
          <Text style={[s.summaryValue, { color: totalTunggakan > 0 ? C.bad : C.good }]}>
            {fmtRupiah(totalTunggakan)}
          </Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Rata-rata Lunas</Text>
          <Text style={[s.summaryValue, { color: avgLunas >= 80 ? C.good : avgLunas >= 50 ? C.warn : C.bad }]}>
            {avgLunas}%
          </Text>
        </View>
      </View>

      {/* Table */}
      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={s.thNo}>No</Text>
          <Text style={s.thNis}>NIS</Text>
          <Text style={s.thName}>Nama Siswa</Text>
          <Text style={s.thStatus}>Status</Text>
          <Text style={s.thMoney}>Total Bayar</Text>
          <Text style={s.thMoney}>Tunggakan</Text>
          <Text style={s.thPct}>% Lunas</Text>
        </View>
        {data.siswa.length === 0 ? (
          <View style={s.tRow}>
            <Text style={[s.tdName, { textAlign: 'center', color: C.muted, paddingVertical: 8 }]}>
              Belum ada siswa di rombel ini.
            </Text>
          </View>
        ) : (
          data.siswa.map((row, i) => (
            <View key={row.siswaId} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
              <Text style={s.tdNo}>{i + 1}</Text>
              <Text style={s.tdNis}>{row.nis}</Text>
              <Text style={s.tdName}>{row.nama}</Text>
              <Text style={s.tdStatus}>{row.statusSiswa}</Text>
              <Text style={s.tdMoney}>{fmtRupiah(row.totalBayar)}</Text>
              <Text style={row.totalTunggakan > 0 ? s.tdMoneyBad : s.tdMoney}>
                {fmtRupiah(row.totalTunggakan)}
              </Text>
              <Text style={[s.tdPct, { color: row.persentaseLunas >= 80 ? C.good : row.persentaseLunas >= 50 ? C.warn : C.bad }]}>
                {row.persentaseLunas}%
              </Text>
            </View>
          ))
        )}
        {data.siswa.length > 0 && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL</Text>
            <Text style={s.totalMoney}>{fmtRupiah(totalBayar)}</Text>
            <Text style={s.totalMoney}>{fmtRupiah(totalTunggakan)}</Text>
            <Text style={s.totalPct}>{avgLunas}%</Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={s.footer}>
        <Text style={s.footerNote}>Dicetak: {fmtDate(printedAt)} · {data.rombelKode}</Text>
        <View style={s.sigBox}>
          <Text style={s.sigLabel}>Bendahara Komite</Text>
          <View style={s.sigSpace} />
          <Text style={s.sigName}>(                           )</Text>
        </View>
      </View>
    </Page>
  )
}

interface PerRombelDocumentProps {
  rombels: PerRombelResult[]
  school: SchoolInfo
  printedAt?: Date
}

export function PerRombelDocument({ rombels, school, printedAt }: PerRombelDocumentProps) {
  const stamp = printedAt ?? new Date()
  const title = rombels.length === 1
    ? `Laporan ${rombels[0]!.rombelKode}`
    : `Laporan Per Rombel (${rombels.length} kelas)`
  return (
    <Document title={title} author={school.namaSekolah} creator="Sistem Pembayaran Sumbangan Komite">
      {rombels.map((r) => (
        <RombelPage key={r.rombelId} data={r} school={school} printedAt={stamp} />
      ))}
    </Document>
  )
}

// ─── History (multi-TA) ───────────────────────────────────────────────────────

interface HistoryPageProps {
  page: PerRombelHistoryPage
  school: SchoolInfo
  printedAt: Date
  currentRombelKode: string
  grade: string
  pageNum: number
  totalPages: number
}

function HistoryRombelPage({
  page,
  school,
  printedAt,
  currentRombelKode,
  grade,
  pageNum,
  totalPages,
}: HistoryPageProps) {
  const totalBayar = page.siswa.reduce((acc: number, r: PerRombelSiswaRow) => acc + r.totalBayar, 0)
  const totalTunggakan = page.siswa.reduce((acc: number, r: PerRombelSiswaRow) => acc + r.totalTunggakan, 0)
  const avgLunas =
    page.siswa.length > 0
      ? Math.round(page.siswa.reduce((acc: number, r: PerRombelSiswaRow) => acc + r.persentaseLunas, 0) / page.siswa.length)
      : 0
  const rombelLabel = page.rombelKodes.length === 1
    ? page.rombelKodes[0]
    : page.rombelKodes.join(', ')

  return (
    <Page size={[F4_W, F4_H]} style={s.page}>
      <View style={s.headerRow}>
        <View style={s.schoolCol}>
          <Text style={s.schoolName}>{school.namaSekolah}</Text>
          {school.alamat ? <Text style={s.schoolAddress}>{school.alamat}</Text> : null}
          {school.npsn ? <Text style={s.schoolAddress}>NPSN: {school.npsn}</Text> : null}
        </View>
        <View style={s.titleBox}>
          <Text style={s.titleLabel}>LAPORAN PER ROMBEL</Text>
          <Text style={s.titleSub}>Kohort {currentRombelKode} · {grade}</Text>
          <Text style={s.titleSub}>Hal. {pageNum} / {totalPages}</Text>
        </View>
      </View>

      <View style={s.metaRow}>
        <View style={s.metaCol}>
          <Text style={s.metaLabel}>Tahun Ajaran</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{page.tahunAjaranKode}</Text>
        </View>
        <View style={s.metaCol}>
          <Text style={s.metaLabel}>Rombel saat itu</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{rombelLabel}</Text>
        </View>
        <View style={s.metaCol}>
          <Text style={s.metaLabel}>Bulan tagihan</Text>
          <Text style={s.metaColon}>:</Text>
          <Text style={s.metaValue}>{page.totalBulan} bln</Text>
        </View>
      </View>

      <View style={s.summaryRow}>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Siswa</Text>
          <Text style={s.summaryValue}>{page.siswa.length} orang</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Bayar</Text>
          <Text style={[s.summaryValue, { color: C.good }]}>{fmtRupiah(totalBayar)}</Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Total Tunggakan</Text>
          <Text style={[s.summaryValue, { color: totalTunggakan > 0 ? C.bad : C.good }]}>
            {fmtRupiah(totalTunggakan)}
          </Text>
        </View>
        <View style={s.summaryCard}>
          <Text style={s.summaryLabel}>Rata-rata Lunas</Text>
          <Text style={[s.summaryValue, { color: avgLunas >= 80 ? C.good : avgLunas >= 50 ? C.warn : C.bad }]}>
            {avgLunas}%
          </Text>
        </View>
      </View>

      <View style={s.table}>
        <View style={s.tHead}>
          <Text style={s.thNo}>No</Text>
          <Text style={s.thNis}>NIS</Text>
          <Text style={s.thName}>Nama Siswa</Text>
          <Text style={s.thStatus}>Status</Text>
          <Text style={s.thMoney}>Total Bayar</Text>
          <Text style={s.thMoney}>Tunggakan</Text>
          <Text style={s.thPct}>% Lunas</Text>
        </View>
        {page.siswa.length === 0 ? (
          <View style={s.tRow}>
            <Text style={[s.tdName, { textAlign: 'center', color: C.muted, paddingVertical: 8 }]}>
              Tidak ada data siswa.
            </Text>
          </View>
        ) : (
          page.siswa.map((row: PerRombelSiswaRow, i: number) => (
            <View key={row.siswaId} style={i % 2 === 0 ? s.tRow : s.tRowAlt}>
              <Text style={s.tdNo}>{i + 1}</Text>
              <Text style={s.tdNis}>{row.nis}</Text>
              <Text style={s.tdName}>{row.nama}</Text>
              <Text style={s.tdStatus}>{row.statusSiswa}</Text>
              <Text style={s.tdMoney}>{fmtRupiah(row.totalBayar)}</Text>
              <Text style={row.totalTunggakan > 0 ? s.tdMoneyBad : s.tdMoney}>
                {fmtRupiah(row.totalTunggakan)}
              </Text>
              <Text style={[s.tdPct, { color: row.persentaseLunas >= 80 ? C.good : row.persentaseLunas >= 50 ? C.warn : C.bad }]}>
                {row.persentaseLunas}%
              </Text>
            </View>
          ))
        )}
        {page.siswa.length > 0 && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>TOTAL</Text>
            <Text style={s.totalMoney}>{fmtRupiah(totalBayar)}</Text>
            <Text style={s.totalMoney}>{fmtRupiah(totalTunggakan)}</Text>
            <Text style={s.totalPct}>{avgLunas}%</Text>
          </View>
        )}
      </View>

      <View style={s.footer}>
        <Text style={s.footerNote}>
          Dicetak: {fmtDate(printedAt)} · Kohort {currentRombelKode} · TA {page.tahunAjaranKode}
        </Text>
        <View style={s.sigBox}>
          <Text style={s.sigLabel}>Bendahara Komite</Text>
          <View style={s.sigSpace} />
          <Text style={s.sigName}>(                           )</Text>
        </View>
      </View>
    </Page>
  )
}

interface PerRombelHistoryDocumentProps {
  history: PerRombelHistoryResult
  school: SchoolInfo
  printedAt?: Date
}

export function PerRombelHistoryDocument({ history, school, printedAt }: PerRombelHistoryDocumentProps) {
  const stamp = printedAt ?? new Date()
  const total = history.pages.length
  return (
    <Document
      title={`Riwayat ${history.rombelKode}`}
      author={school.namaSekolah}
      creator="Sistem Pembayaran Sumbangan Komite"
    >
      {history.pages.map((p, idx) => (
        <HistoryRombelPage
          key={p.tahunAjaranId}
          page={p}
          school={school}
          printedAt={stamp}
          currentRombelKode={history.rombelKode}
          grade={history.grade}
          pageNum={idx + 1}
          totalPages={total}
        />
      ))}
    </Document>
  )
}
