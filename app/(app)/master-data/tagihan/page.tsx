'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  Search,
} from 'lucide-react'

import { PageHeader } from '@/components/layouts/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useTahunAjaranList } from '@/hooks/use-tahun-ajaran'
import {
  useTagihanMaster,
  useExportTagihanMaster,
  type TagihanRow,
} from '@/hooks/use-tagihan-master'

const COLUMNS: { key: keyof Omit<TagihanRow, '_key'>; label: string; width: string; editable: boolean; align?: 'right' | 'center' }[] = [
  { key: 'id', label: 'NIS', width: '90px', editable: false },
  { key: 'nama', label: 'Nama', width: '200px', editable: true },
  { key: 'jum_tagihan', label: 'Jum Tagihan', width: '120px', editable: true, align: 'right' },
  { key: 'instansi', label: 'Instansi', width: '160px', editable: true },
  { key: 'Alamat', label: 'Alamat', width: '160px', editable: true },
  { key: 'Kelas', label: 'Kelas', width: '60px', editable: false },
  { key: 'Jurusan', label: 'Jurusan', width: '80px', editable: true },
  { key: 'Tahun', label: 'Tahun', width: '70px', editable: false, align: 'center' },
  { key: 'Bulan', label: 'Bulan', width: '60px', editable: false, align: 'center' },
  { key: 'DanaMasyarakat', label: 'Dana Masyarakat', width: '130px', editable: true, align: 'right' },
  { key: 'Keterangan', label: 'Keterangan', width: '120px', editable: true },
]

const GRADES = ['', 'X', 'XI', 'XII'] as const

export default function MasterDataTagihanPage() {
  const [tahunAjaranId, setTahunAjaranId] = useState('')
  const [grade, setGrade] = useState('')
  const [search, setSearch] = useState('')
  const [editedRows, setEditedRows] = useState<Map<string, Partial<TagihanRow>>>(new Map())
  const [page, setPage] = useState(1)
  const pageSize = 100

  const { data: taList } = useTahunAjaranList()
  const { data, isLoading } = useTagihanMaster({
    tahunAjaranId: tahunAjaranId || undefined,
    grade: grade || undefined,
  })
  const exportMutation = useExportTagihanMaster()

  const rows = data?.rows ?? []
  const taKode = data?.taKode ?? ''

  // Merge edits into rows
  const mergedRows = useMemo(() => {
    if (editedRows.size === 0) return rows
    return rows.map((row) => {
      const edits = editedRows.get(row._key)
      return edits ? { ...row, ...edits } : row
    })
  }, [rows, editedRows])

  // Filter by search
  const filteredRows = useMemo(() => {
    if (!search.trim()) return mergedRows
    const q = search.toLowerCase()
    return mergedRows.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.nama.toLowerCase().includes(q) ||
        r.Kelas.toLowerCase().includes(q),
    )
  }, [mergedRows, search])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedRows = useMemo(
    () => filteredRows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [filteredRows, safePage, pageSize],
  )

  const handleCellChange = useCallback(
    (rowKey: string, colKey: string, value: string) => {
      setEditedRows((prev) => {
        const next = new Map(prev)
        const existing = next.get(rowKey) ?? {}
        // Coerce numeric fields
        if (colKey === 'DanaMasyarakat') {
          const num = Number(value.replace(/[^\d.-]/g, ''))
          existing[colKey] = isNaN(num) ? 0 : num
          // Also update jum_tagihan to stay in sync
          existing.jum_tagihan = `${existing[colKey]}.00`
        } else {
          (existing as Record<string, unknown>)[colKey] = value
        }
        next.set(rowKey, existing)
        return next
      })
    },
    [],
  )

  const handleExport = () => {
    exportMutation.mutate(filteredRows)
  }

  const hasEdits = editedRows.size > 0

  return (
    <div className="space-y-5">
      <PageHeader
        title="Master Data Tagihan BPD"
        description={`Data tagihan belum bayar untuk upload ke asik.bpdbali${taKode ? ` — ${taKode}` : ''}. Klik cell untuk edit.`}
        actions={
          <Button
            onClick={handleExport}
            disabled={exportMutation.isPending || filteredRows.length === 0}
            className="gap-2"
          >
            {exportMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Export Excel ({filteredRows.length} baris)
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-52 space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Tahun Ajaran</label>
          <Select
            value={tahunAjaranId || 'active'}
            onValueChange={(v) => {
              setTahunAjaranId(v === 'active' ? '' : v)
              setEditedRows(new Map())
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="TA Aktif" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">TA Aktif</SelectItem>
              {taList?.map((ta) => (
                <SelectItem key={ta.id} value={ta.id}>
                  {ta.kode}
                  {ta.isActive ? ' (Aktif)' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-32 space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Kelas</label>
          <Select
            value={grade || 'all'}
            onValueChange={(v) => {
              setGrade(v === 'all' ? '' : v)
              setEditedRows(new Map())
              setPage(1)
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Semua" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Kelas</SelectItem>
              <SelectItem value="X">Kelas X</SelectItem>
              <SelectItem value="XI">Kelas XI</SelectItem>
              <SelectItem value="XII">Kelas XII</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-64 space-y-1.5">
          <label className="text-xs font-medium text-slate-600">Cari</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Cari NIS atau nama..."
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="pl-9"
            />
          </div>
        </div>

        {hasEdits && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditedRows(new Map())}
            className="text-slate-500"
          >
            Reset editan
          </Button>
        )}
      </div>

      {/* Info bar */}
      <div className="flex items-center gap-3 text-xs text-slate-500">
        <FileSpreadsheet className="h-3.5 w-3.5" />
        <span>
          {filteredRows.length} baris tagihan belum bayar
          {hasEdits ? ` · ${editedRows.size} baris diedit` : ''}
        </span>
      </div>

      {/* Spreadsheet table */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 py-16 text-slate-400">
          <Filter className="mb-2 h-8 w-8" />
          <p className="text-sm font-medium">Tidak ada tagihan belum bayar</p>
          <p className="text-xs">Semua siswa sudah lunas atau tidak ada data untuk filter ini.</p>
        </div>
      ) : (
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="sticky left-0 z-10 border-b border-r border-slate-200 bg-slate-100 px-2 py-2 text-left font-semibold text-slate-700"
                    style={{ width: '40px' }}>
                  #
                </th>
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className="border-b border-r border-slate-200 px-2 py-2 font-semibold text-slate-700 whitespace-nowrap"
                    style={{ width: col.width, textAlign: col.align ?? 'left' }}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedRows.map((row, idx) => (
                <SpreadsheetRow
                  key={row._key}
                  row={row}
                  rowIndex={(safePage - 1) * pageSize + idx}
                  edits={editedRows.get(row._key)}
                  onCellChange={handleCellChange}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination controls */}
      {filteredRows.length > pageSize && (
        <div className="flex items-center justify-between border-t border-slate-200 pt-3">
          <span className="text-xs text-slate-500">
            Halaman {safePage} dari {totalPages} · {filteredRows.length} baris total
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              Sebelumnya
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              Berikutnya
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

interface SpreadsheetRowProps {
  row: TagihanRow
  rowIndex: number
  edits?: Partial<TagihanRow>
  onCellChange: (rowKey: string, colKey: string, value: string) => void
}

function SpreadsheetRow({ row, rowIndex, edits, onCellChange }: SpreadsheetRowProps) {
  const isEdited = !!edits

  return (
    <tr className={`${rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'} ${isEdited ? 'bg-amber-50/40' : ''} hover:bg-blue-50/40`}>
      <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-inherit px-2 py-0 text-center text-slate-400 tabular-nums">
        {rowIndex + 1}
      </td>
      {COLUMNS.map((col) => {
        const value = String((row as unknown as Record<string, unknown>)[col.key] ?? '')
        const wasEdited = edits && col.key in edits
        return (
          <EditableCell
            key={col.key}
            rowKey={row._key}
            colKey={col.key}
            value={value}
            editable={col.editable}
            align={col.align}
            wasEdited={!!wasEdited}
            onChange={onCellChange}
          />
        )
      })}
    </tr>
  )
}

interface EditableCellProps {
  rowKey: string
  colKey: string
  value: string
  editable: boolean
  align?: 'right' | 'center'
  wasEdited: boolean
  onChange: (rowKey: string, colKey: string, value: string) => void
}

function EditableCell({ rowKey, colKey, value, editable, align, wasEdited, onChange }: EditableCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => {
    if (!editable) return
    setDraft(value)
    setEditing(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const commit = () => {
    setEditing(false)
    if (draft !== value) {
      onChange(rowKey, colKey, draft)
    }
  }

  const textAlign = align ?? 'left'

  if (editing) {
    return (
      <td className="border-b border-r border-slate-200 p-0">
        <input
          ref={inputRef}
          className="w-full bg-blue-50 px-2 py-1.5 text-xs outline-none ring-2 ring-inset ring-blue-400"
          style={{ textAlign }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setEditing(false)
            if (e.key === 'Tab') {
              // Let natural tab behavior happen, commit first
              commit()
            }
          }}
          autoFocus
        />
      </td>
    )
  }

  return (
    <td
      className={`border-b border-r border-slate-200 px-2 py-1.5 whitespace-nowrap ${
        editable ? 'cursor-cell' : ''
      } ${wasEdited ? 'bg-amber-100/60 font-medium text-amber-900' : 'text-slate-700'}`}
      style={{ textAlign }}
      onDoubleClick={startEdit}
      onClick={(e) => {
        // Single click also starts edit for faster workflow
        if (editable) startEdit()
      }}
    >
      {value}
    </td>
  )
}
