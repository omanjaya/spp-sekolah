import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { Grade } from '@prisma/client'

import type {
  MatrixData,
  MatrixPeriod,
  MatrixRombelGroup,
  MatrixSiswaRow,
} from '@/services/matrix-data.service'
import { formatRombelLabel } from '@/services/matrix-data.service'

import { pdfStyles } from './styles'
import { isWaiver, renderCellText } from './helpers'

export interface SchoolInfo {
  namaSekolah: string
  alamat?: string
  npsn?: string
}

interface MatrixDocumentProps {
  data: MatrixData
  school: SchoolInfo
  /**
   * Optional: restrict pages to these grades. Defaults to all 3 (X, XI, XII).
   */
  grades?: Grade[]
}

/**
 * The flagship PDF.
 *
 * For each rombel group (filtered by angkatan upstream) we emit up to 3 pages,
 * one per grade (X / XI / XII), each showing the 12 months of that grade's
 * academic year.
 */
export function MatrixDocument({ data, school, grades }: MatrixDocumentProps) {
  const activeGrades: Grade[] = grades ?? ['X', 'XI', 'XII']
  return (
    <Document
      title={`Daftar Pembayaran Komite ${data.angkatan}`}
      author={school.namaSekolah}
      creator="Sistem Pembayaran SPP"
      producer="Sistem Pembayaran SPP"
    >
      {data.rombels.flatMap((rombel) =>
        activeGrades.map((grade) => (
          <MatrixPage
            key={`${rombel.rombelId}:${grade}`}
            data={data}
            rombel={rombel}
            grade={grade}
            school={school}
          />
        )),
      )}
    </Document>
  )
}

interface MatrixPageProps {
  data: MatrixData
  rombel: MatrixRombelGroup
  grade: Grade
  school: SchoolInfo
}

function MatrixPage({ data, rombel, grade, school }: MatrixPageProps) {
  const periods = data.periods.filter((p) => p.grade === grade)
  const printDate = formatPrintDate(data.generatedAt)
  const rombelLabel = formatRombelLabel(grade, rombel.nomor)

  return (
    <Page size="A4" orientation="landscape" style={pdfStyles.page} wrap>
      {/* Title bar */}
      <View style={pdfStyles.headerBlock}>
        <View style={pdfStyles.titleBar}>
          <Text style={pdfStyles.title}>
            DAFTAR SISWA YANG MEMBAYAR UANG KOMITE
          </Text>
        </View>
        <View style={pdfStyles.titleAccent} />

        <View style={pdfStyles.metaRow}>
          <View style={pdfStyles.metaLeft}>
            <Text style={pdfStyles.metaHead}>{school.namaSekolah.toUpperCase()}</Text>
            {school.alamat ? (
              <Text style={pdfStyles.metaSub}>{school.alamat}</Text>
            ) : null}
          </View>
          <View style={pdfStyles.metaRight}>
            <Text style={pdfStyles.metaValue}>
              Kelas {rombelLabel} · Angkatan {data.angkatan}
            </Text>
            <Text style={pdfStyles.metaSub}>
              TA {rombel.tahunAjaranKode}
              {rombel.waliKelas ? ` · Wali: ${rombel.waliKelas}` : ''}
            </Text>
          </View>
        </View>
      </View>

      <MatrixTable periods={periods} rows={rombel.siswa} />

      {/* Footer */}
      <View style={pdfStyles.footer} fixed>
        <Text>
          {school.namaSekolah}
          {school.npsn ? ` · NPSN ${school.npsn}` : ''}
        </Text>
        <Text>
          Lunas = tgl bayar · Belum = − · Keringanan = JUARA/OSN (kuning)
        </Text>
        <Text
          render={({ pageNumber, totalPages }) =>
            `${printDate}  ·  Hal. ${pageNumber}/${totalPages}`
          }
        />
      </View>
    </Page>
  )
}

interface MatrixTableProps {
  periods: MatrixPeriod[]
  rows: MatrixSiswaRow[]
}

function MatrixTable({ periods, rows }: MatrixTableProps) {
  return (
    <View style={pdfStyles.table}>
      <View style={pdfStyles.headRow} fixed>
        <Text style={[pdfStyles.headCell, pdfStyles.cellNo]}>No</Text>
        <Text style={[pdfStyles.headCell, pdfStyles.cellNis]}>NIS</Text>
        <Text style={[pdfStyles.headCell, pdfStyles.cellNama, pdfStyles.cellLeft]}>Nama</Text>
        {periods.map((p) => (
          <Text key={`h-${p.year}-${p.month}`} style={[pdfStyles.headCell, pdfStyles.cellMonth]}>
            {p.label}
            {'\n'}
            {p.year}
          </Text>
        ))}
        <Text style={[pdfStyles.headCell, pdfStyles.cellSum]}>Σ 12</Text>
      </View>

      {rows.map((row, i) => {
        const counts = summarizeRow(row, periods)
        return (
          <View
            key={row.id}
            style={i % 2 === 1 ? pdfStyles.rowAlt : pdfStyles.row}
            wrap={false}
          >
            <Text style={[pdfStyles.cell, pdfStyles.cellNo, pdfStyles.cellCenter]}>
              {i + 1}
            </Text>
            <Text style={[pdfStyles.cell, pdfStyles.cellNis, pdfStyles.cellCenter]}>
              {row.nis}
            </Text>
            <Text
              style={[pdfStyles.cell, pdfStyles.cellNama, pdfStyles.cellLeft]}
              wrap={false}
            >
              {row.nama.length > 30 ? `${row.nama.slice(0, 28)}…` : row.nama}
            </Text>
            {periods.map((p) => {
              const key = `${p.year}-${String(p.month).padStart(2, '0')}`
              const cellData = row.cells[key]
              const text = renderCellText(cellData)
              const waiver = isWaiver(cellData)
              const belum = !cellData || cellData.status === 'BELUM'
              const styleExtra = waiver
                ? pdfStyles.cellWaiver
                : belum
                  ? pdfStyles.cellBelum
                  : pdfStyles.cellLunas
              return (
                <Text
                  key={`${row.id}-${key}`}
                  style={[pdfStyles.cell, pdfStyles.cellMonth, pdfStyles.cellCenter, styleExtra]}
                >
                  {text}
                </Text>
              )
            })}
            <Text
              style={[
                pdfStyles.cell,
                pdfStyles.cellSum,
                pdfStyles.cellCenter,
                counts.belum > 0 ? pdfStyles.summaryChipWarn : pdfStyles.summaryChip,
              ]}
            >
              {counts.lunas}/12
            </Text>
          </View>
        )
      })}
    </View>
  )
}

interface RowSummary {
  lunas: number
  waiver: number
  belum: number
}

function summarizeRow(row: MatrixSiswaRow, periods: MatrixPeriod[]): RowSummary {
  let lunas = 0
  let waiver = 0
  let belum = 0
  for (const p of periods) {
    const key = `${p.year}-${String(p.month).padStart(2, '0')}`
    const c = row.cells[key]
    if (!c || c.status === 'BELUM') belum += 1
    else if (isWaiver(c)) {
      waiver += 1
      lunas += 1
    } else lunas += 1
  }
  return { lunas, waiver, belum }
}

function formatPrintDate(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  const HH = String(d.getHours()).padStart(2, '0')
  const MM = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy} ${HH}:${MM}`
}
