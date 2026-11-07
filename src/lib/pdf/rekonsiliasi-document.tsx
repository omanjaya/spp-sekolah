import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer'
import type { PembayaranDto } from '@/services/pembayaran.service'

const styles = StyleSheet.create({
  page: {
    paddingTop: 24,
    paddingBottom: 32,
    paddingHorizontal: 20,
    fontSize: 8,
    fontFamily: 'Helvetica',
    color: '#0f172a',
  },
  header: {
    marginBottom: 8,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#0f172a',
    paddingBottom: 6,
  },
  schoolName: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  subTitle: { fontSize: 8, color: '#475569', marginTop: 1 },

  meta: {
    marginTop: 8,
    marginBottom: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    fontSize: 7.5,
    color: '#334155',
  },
  metaItem: { marginRight: 14, marginBottom: 2 },
  metaLabel: { fontFamily: 'Helvetica-Bold' },

  table: { borderTopWidth: 0.5, borderLeftWidth: 0.5, borderColor: '#cbd5e1' },
  row: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderColor: '#e2e8f0',
  },
  rowHead: {
    flexDirection: 'row',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 0.5,
    borderTopWidth: 0.5,
    borderColor: '#94a3b8',
  },
  cell: {
    paddingVertical: 3,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderColor: '#e2e8f0',
    fontSize: 7.2,
  },
  cellHead: {
    paddingVertical: 4,
    paddingHorizontal: 3,
    borderRightWidth: 0.5,
    borderColor: '#94a3b8',
    fontFamily: 'Helvetica-Bold',
    fontSize: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  numRight: { textAlign: 'right' },
  muted: { color: '#64748b' },
  bold: { fontFamily: 'Helvetica-Bold' },

  footer: {
    marginTop: 8,
    paddingTop: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderColor: '#0f172a',
    fontSize: 7.5,
  },
  pageNumber: {
    position: 'absolute',
    bottom: 14,
    right: 20,
    fontSize: 7,
    color: '#64748b',
  },
})

// Landscape A4: ~842pt × 595pt. Usable width ~802pt. Sum column widths ≤ 802.
// No(22) NIS(48) Nama(180) Rombel(50) Periode(60) Tagihan(56) TglTx(80) NoBukti(72) Cabang(38) Teller(56) Status(34)
//  = 696 ← fits within 802
const COLS: Array<{ key: string; label: string; width: number; align?: 'right' }> = [
  { key: 'no', label: 'No', width: 22 },
  { key: 'nis', label: 'NIS', width: 48 },
  { key: 'nama', label: 'Nama', width: 180 },
  { key: 'rombel', label: 'Rombel', width: 50 },
  { key: 'periode', label: 'Periode', width: 60 },
  { key: 'amount', label: 'Tagihan', width: 56, align: 'right' },
  { key: 'tgl', label: 'Tgl Transaksi', width: 80 },
  { key: 'noBukti', label: 'No Bukti', width: 72 },
  { key: 'cabang', label: 'Cabang', width: 38 },
  { key: 'teller', label: 'Teller', width: 56 },
  { key: 'status', label: 'Status', width: 34 },
]

const MONTHS_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

const rupiah = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
})

function fmtPeriode(y: number, m: number): string {
  return `${MONTHS_ID[m - 1] ?? m} ${y}`
}

function fmtDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = d.getFullYear()
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yy} ${h}:${mi}`
}

export interface RekonsiliasiPdfProps {
  schoolName: string
  schoolAddress?: string | null
  generatedAt: Date
  filters: Array<{ label: string; value: string }>
  rows: PembayaranDto[]
  totalAmount: number
}

function Cell({
  children,
  width,
  align,
  head,
}: {
  children: React.ReactNode
  width: number
  align?: 'right'
  head?: boolean
}) {
  return (
    <View style={{ width, ...(head ? styles.cellHead : styles.cell) }}>
      <Text style={align === 'right' ? styles.numRight : undefined}>{children}</Text>
    </View>
  )
}

export function RekonsiliasiPdfDocument({
  schoolName,
  schoolAddress,
  generatedAt,
  filters,
  rows,
  totalAmount,
}: RekonsiliasiPdfProps) {
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.schoolName}>{schoolName.toUpperCase()}</Text>
          {schoolAddress ? <Text style={styles.subTitle}>{schoolAddress}</Text> : null}
          <Text style={styles.title}>DAFTAR REKONSILIASI PEMBAYARAN Sumbangan Komite / KOMITE</Text>
        </View>

        {filters.length > 0 ? (
          <View style={styles.meta}>
            {filters.map((f) => (
              <Text key={f.label} style={styles.metaItem}>
                <Text style={styles.metaLabel}>{f.label}: </Text>
                {f.value}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.table}>
          <View style={styles.rowHead} fixed>
            {COLS.map((c) => (
              <Cell key={c.key} width={c.width} align={c.align} head>
                {c.label}
              </Cell>
            ))}
          </View>

          {rows.map((r, i) => (
            <View key={r.id} style={styles.row} wrap={false}>
              <Cell width={22}>{i + 1}</Cell>
              <Cell width={48}>{r.siswa?.nis ?? '-'}</Cell>
              <Cell width={180}>{r.siswa?.nama ?? '-'}</Cell>
              <Cell width={50}>{r.rombel?.kode ?? '-'}</Cell>
              <Cell width={60}>{fmtPeriode(r.periodYear, r.periodMonth)}</Cell>
              <Cell width={56} align="right">
                {rupiah.format(Number(r.amount))}
              </Cell>
              <Cell width={80}>{fmtDate(r.tanggalTransaksi)}</Cell>
              <Cell width={72}>{r.noBukti ?? '-'}</Cell>
              <Cell width={38}>{r.kodeCabang ?? '-'}</Cell>
              <Cell width={56}>{r.tellerUser ?? '-'}</Cell>
              <Cell width={34}>
                {r.statusBayar === 'TERBAYAR' ? 'Bayar' : 'Batal'}
              </Cell>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <Text>
            <Text style={styles.bold}>{rows.length.toLocaleString('id-ID')}</Text> transaksi
          </Text>
          <Text>
            Total: <Text style={styles.bold}>Rp {rupiah.format(totalAmount)}</Text>
          </Text>
          <Text style={styles.muted}>
            Dicetak: {fmtDate(generatedAt.toISOString())}
          </Text>
        </View>

        <Text
          style={styles.pageNumber}
          render={({ pageNumber, totalPages }) => `Hal ${pageNumber} / ${totalPages}`}
          fixed
        />
      </Page>
    </Document>
  )
}
