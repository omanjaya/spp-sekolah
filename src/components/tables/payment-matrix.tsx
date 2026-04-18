'use client'

import { memo, useMemo } from 'react'
import { cn } from '@/lib/utils'
import type {
  MatrixCell,
  MatrixData,
  MatrixRombelGroup,
} from '@/services/matrix-data.service'
import { formatRombelLabel } from '@/services/matrix-data.service'

export interface PaymentMatrixProps {
  data: MatrixData
  /** Use compact spacing for denser layout. */
  compact?: boolean
  /**
   * When true, renders subheading per rombel group. On by default.
   */
  showRombelHeaders?: boolean
  className?: string
}

/**
 * HTML mirror of the PDF matrix. Horizontal scrolls when viewport is narrow.
 * Used by the export preview and (eventually) the siswa detail page.
 */
export function PaymentMatrix({
  data,
  compact,
  showRombelHeaders = true,
  className,
}: PaymentMatrixProps) {
  const periodKeys = useMemo(
    () => data.periods.map((p) => periodKey(p.year, p.month)),
    [data.periods],
  )
  return (
    <div className={cn('w-full overflow-auto rounded-md border border-slate-200', className)}>
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">
          Matriks pembayaran komite angkatan {data.angkatan}
        </caption>
        <thead className="sticky top-0 z-10 bg-slate-100 text-slate-700">
          <tr>
            <th
              scope="col"
              className={cn(
                'sticky left-0 z-20 border border-slate-200 bg-slate-100 text-center',
                compact ? 'px-1 py-1' : 'px-2 py-1.5',
              )}
            >
              No
            </th>
            <th
              scope="col"
              className={cn(
                'sticky left-10 z-20 border border-slate-200 bg-slate-100 text-center',
                compact ? 'px-1 py-1' : 'px-2 py-1.5',
              )}
            >
              NIS
            </th>
            <th
              scope="col"
              className={cn(
                'border border-slate-200 text-left',
                compact ? 'min-w-[140px] px-2 py-1' : 'min-w-[180px] px-3 py-1.5',
              )}
            >
              Nama
            </th>
            {data.periods.map((p) => (
              <th
                key={`${p.year}-${p.month}`}
                scope="col"
                className={cn(
                  'border border-slate-200 text-center font-medium',
                  compact ? 'min-w-[56px] px-1 py-1' : 'min-w-[68px] px-2 py-1.5',
                )}
              >
                <div className="whitespace-nowrap">{p.label}</div>
                <div className="text-[10px] font-normal text-slate-500">{p.year}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rombels.map((rombel) => (
            <RombelBlock
              key={rombel.rombelId}
              rombel={rombel}
              periodsCount={data.periods.length}
              compact={compact}
              showRombelHeaders={showRombelHeaders}
              periodKeys={periodKeys}
            />
          ))}
          {data.rombels.length === 0 && (
            <tr>
              <td
                colSpan={3 + data.periods.length}
                className="border border-slate-200 px-4 py-8 text-center text-slate-500"
              >
                Tidak ada data untuk ditampilkan.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

interface RombelBlockProps {
  rombel: MatrixRombelGroup
  periodsCount: number
  compact?: boolean
  showRombelHeaders: boolean
  periodKeys: string[]
}

const RombelBlock = memo(function RombelBlock({
  rombel,
  periodsCount,
  compact,
  showRombelHeaders,
  periodKeys,
}: RombelBlockProps) {
  return (
    <>
      {showRombelHeaders && (
        <tr>
          <td
            colSpan={3 + periodsCount}
            className="border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
          >
            Kelas {formatRombelLabel(rombel.grade, rombel.nomor)}
            <span className="ml-2 text-xs font-normal text-slate-500">
              TA {rombel.tahunAjaranKode}
              {rombel.waliKelas ? ` — Wali: ${rombel.waliKelas}` : ''}
            </span>
          </td>
        </tr>
      )}
      {rombel.siswa.map((s, i) => (
        <tr key={s.id} className={i % 2 === 1 ? 'bg-slate-50/60' : undefined}>
          <td
            className={cn(
              'sticky left-0 border border-slate-200 bg-inherit text-center',
              compact ? 'px-1 py-1' : 'px-2 py-1.5',
            )}
          >
            {i + 1}
          </td>
          <td
            className={cn(
              'sticky left-10 border border-slate-200 bg-inherit text-center font-mono text-[11px]',
              compact ? 'px-1 py-1' : 'px-2 py-1.5',
            )}
          >
            {s.nis}
          </td>
          <td
            className={cn(
              'border border-slate-200 text-slate-800',
              compact ? 'px-2 py-1' : 'px-3 py-1.5',
            )}
          >
            {s.nama}
          </td>
          {periodKeys.map((k) => (
            <CellView
              key={`${s.id}-${k}`}
              cell={s.cells[k]}
              compact={compact}
            />
          ))}
        </tr>
      ))}
    </>
  )
})

const CellView = memo(function CellView({ cell, compact }: { cell: MatrixCell | undefined; compact?: boolean }) {
  const padding = compact ? 'px-1 py-1' : 'px-2 py-1.5'
  if (!cell || cell.status === 'BELUM') {
    return (
      <td className={cn('border border-slate-200 text-center text-slate-300', padding)}>
        -
      </td>
    )
  }
  if (cell.status === 'LUNAS') {
    return (
      <td
        className={cn(
          'border border-slate-200 text-center text-slate-800',
          padding,
        )}
      >
        {cell.date ? formatDmy(cell.date) : 'Lunas'}
      </td>
    )
  }
  // Waiver/keringanan
  return (
    <td className={cn('border border-slate-200 text-center', padding)}>
      <span className="inline-flex items-center rounded-sm bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
        {shortLabel(cell.status)}
      </span>
    </td>
  )
})

function formatDmy(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(2)
  return `${dd}/${mm}/${yy}`
}

function shortLabel(status: MatrixCell['status']): string {
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
    case 'LAINNYA':
      return 'BEBAS'
    default:
      return '-'
  }
}
