/**
 * PDF render helpers — pure functions consumed by matrix-document.tsx.
 */

import type { MatrixCell } from '@/services/matrix-data.service'

/** Format date as dd/mm/yyyy. */
export function formatDdMmYyyy(d: Date): string {
  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = String(d.getFullYear())
  return `${dd}/${mm}/${yyyy}`
}

/** Compact abbreviation of the keringanan jenis for a narrow cell. */
export function shortWaiverLabel(status: MatrixCell['status']): string {
  switch (status) {
    case 'JUARA':
      return 'JUARA'
    case 'OSN':
      return 'OSN'
    case 'JUARA_UMUM':
      return 'J.UMUM'
    case 'BEASISWA':
      return 'BEA'
    case 'KELUARGA_TIDAK_MAMPU':
      return 'KTM'
    case 'PINDAHAN':
      return 'PINDAH'
    case 'LAINNYA':
      return 'BEBAS'
    default:
      return ''
  }
}

/** Render a cell value to string for the PDF. */
export function renderCellText(cell: MatrixCell | undefined): string {
  if (!cell) return '-'
  if (cell.status === 'BELUM') return '-'
  if (cell.status === 'LUNAS') {
    return cell.date ? formatDdMmYyyy(cell.date) : 'LUNAS'
  }
  return shortWaiverLabel(cell.status)
}

export function isWaiver(cell: MatrixCell | undefined): boolean {
  if (!cell) return false
  return (
    cell.status === 'JUARA' ||
    cell.status === 'OSN' ||
    cell.status === 'JUARA_UMUM' ||
    cell.status === 'BEASISWA' ||
    cell.status === 'KELUARGA_TIDAK_MAMPU' ||
    cell.status === 'PINDAHAN' ||
    cell.status === 'LAINNYA'
  )
}
