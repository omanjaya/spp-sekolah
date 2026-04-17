'use client'

import { useRef, useState } from 'react'
import {
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
} from 'lucide-react'

import { PageHeader } from '@/components/layouts/page-header'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useTagihanBpdReview,
  useImportTagihanBpd,
  useExportTagihanBpd,
  useDownloadManualTemplate,
  useImportManual,
  type ReviewRow,
} from '@/hooks/use-tagihan-bpd'

type FilterStatus = 'semua' | 'tetap' | 'dihapus_rekonsiliasi' | 'dihapus_manual'

const BULAN_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

function formatBulan(bulan: number): string {
  return BULAN_ID[bulan - 1] ?? String(bulan)
}

function formatNominal(n: number): string {
  return new Intl.NumberFormat('id-ID').format(n)
}

// ─── File Drop Zone ───────────────────────────────────────────────────────────

interface FileDropZoneProps {
  accept?: string
  onFile: (file: File) => void
  disabled?: boolean
}

function FileDropZone({ accept = '.xlsx,.xls', onFile, disabled }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  return (
    <div
      className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors ${
        dragging ? 'border-blue-400 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'
      } ${disabled ? 'pointer-events-none opacity-50' : ''}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      }}
    >
      <FileSpreadsheet className="mb-2 h-8 w-8 text-slate-400" />
      <p className="text-sm font-medium text-slate-600">Klik atau seret file Excel ke sini</p>
      <p className="mt-1 text-xs text-slate-400">.xlsx atau .xls</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) {
            onFile(file)
            e.target.value = ''
          }
        }}
        disabled={disabled}
      />
    </div>
  )
}

// ─── Tab 1: Import BPD ────────────────────────────────────────────────────────

function ImportBpdTab() {
  const { data: reviewData } = useTagihanBpdReview()
  const importMutation = useImportTagihanBpd()

  const lastImportAt = reviewData?.lastImportAt
  const totalMaster = reviewData
    ? reviewData.counts.tetap + reviewData.counts.dihapus_rekonsiliasi + reviewData.counts.dihapus_manual
    : null

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Upload file tagihan dari asik.bpdbali. Data ini menjadi referensi master untuk generate
        file upload bersih ke BPD setelah dikurangi pembayaran yang sudah masuk.
      </div>

      {lastImportAt && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="inline-block h-2 w-2 rounded-full bg-green-400" />
          <span>
            Import terakhir:{' '}
            {new Date(lastImportAt).toLocaleString('id-ID', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {totalMaster !== null && ` · ${totalMaster} baris master`}
          </span>
        </div>
      )}

      <FileDropZone
        onFile={(file) => importMutation.mutate(file)}
        disabled={importMutation.isPending}
      />

      {importMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memproses file, harap tunggu...
        </div>
      )}

      {importMutation.isSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">Import berhasil</p>
          <div className="mt-2 grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{importMutation.data.totalRows}</p>
              <p className="text-xs text-green-600">Total baris</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{importMutation.data.upserted}</p>
              <p className="text-xs text-green-600">Dimuat</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-600">{importMutation.data.skipped}</p>
              <p className="text-xs text-slate-500">Dilewati</p>
            </div>
          </div>
          {importMutation.data.parseErrors && importMutation.data.parseErrors.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-amber-700">
                {importMutation.data.parseErrors.length} peringatan parse
              </summary>
              <ul className="mt-1 space-y-0.5">
                {importMutation.data.parseErrors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-600">{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {importMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {importMutation.error instanceof Error
            ? importMutation.error.message
            : 'Gagal mengimport file.'}
        </div>
      )}
    </div>
  )
}

// ─── Tab 2: Pembayaran Manual ─────────────────────────────────────────────────

function PembayaranManualTab() {
  const templateMutation = useDownloadManualTemplate()
  const importMutation = useImportManual()

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Daftarkan pembayaran manual (tunai, ijazah, kurang mampu) agar otomatis ter-exclude dari
        tagihan BPD. Download template, isi data, lalu upload.
      </div>

      <Button
        variant="outline"
        className="gap-2"
        onClick={() => templateMutation.mutate()}
        disabled={templateMutation.isPending}
      >
        {templateMutation.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
        Download Template Excel
      </Button>

      <FileDropZone
        onFile={(file) => importMutation.mutate(file)}
        disabled={importMutation.isPending}
      />

      {importMutation.isPending && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Memproses file...
        </div>
      )}

      {importMutation.isSuccess && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-semibold text-green-800">Import berhasil</p>
          <div className="mt-2 grid grid-cols-2 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{importMutation.data.success}</p>
              <p className="text-xs text-green-600">Periode keringanan ditambahkan</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-slate-600">{importMutation.data.skipped}</p>
              <p className="text-xs text-slate-500">Dilewati</p>
            </div>
          </div>
          {importMutation.data.errors.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-xs text-amber-700">
                {importMutation.data.errors.length} peringatan
              </summary>
              <ul className="mt-1 space-y-0.5">
                {importMutation.data.errors.map((e, i) => (
                  <li key={i} className="text-xs text-amber-600">{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {importMutation.isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {importMutation.error instanceof Error
            ? importMutation.error.message
            : 'Gagal mengimport file.'}
        </div>
      )}
    </div>
  )
}

// ─── Tab 3: Review & Export ───────────────────────────────────────────────────

function ReviewExportTab() {
  const { data, isLoading, error } = useTagihanBpdReview()
  const exportMutation = useExportTagihanBpd()
  const [filter, setFilter] = useState<FilterStatus>('semua')

  const counts = data?.counts ?? { tetap: 0, dihapus_rekonsiliasi: 0, dihapus_manual: 0 }
  const total = counts.tetap + counts.dihapus_rekonsiliasi + counts.dihapus_manual

  const filteredRows: ReviewRow[] = (data?.rows ?? []).filter((r) => {
    if (filter === 'semua') return true
    return r.status === filter
  })

  const tetapRows = (data?.rows ?? []).filter((r) => r.status === 'tetap')

  function rowBgClass(status: ReviewRow['status']): string {
    if (status === 'dihapus_rekonsiliasi') return 'bg-green-50'
    if (status === 'dihapus_manual') return 'bg-yellow-50'
    return 'bg-white'
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        Verifikasi perubahan sebelum upload ke asik.bpdbali. Baris hijau = sudah terbayar via
        BPD; kuning = keringanan/manual. Hanya baris putih (Tetap) yang akan dieksport.
      </div>

      {isLoading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Gagal memuat data review. Pastikan sudah import file BPD terlebih dahulu.
        </div>
      )}

      {data && !isLoading && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">Total master BPD</p>
              <p className="mt-1 text-2xl font-bold text-slate-800">{total}</p>
            </div>
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs text-green-700">Dihapus (rekonsiliasi BPD)</p>
              <p className="mt-1 text-2xl font-bold text-green-800">{counts.dihapus_rekonsiliasi}</p>
            </div>
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              <p className="text-xs text-yellow-700">Dihapus (manual/keringanan)</p>
              <p className="mt-1 text-2xl font-bold text-yellow-800">{counts.dihapus_manual}</p>
            </div>
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs text-blue-700">Tetap dalam tagihan</p>
              <p className="mt-1 text-2xl font-bold text-blue-800">{counts.tetap}</p>
            </div>
          </div>

          {/* Filter + Export */}
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['semua', `Semua (${total})`],
                ['tetap', `Tetap (${counts.tetap})`],
                ['dihapus_rekonsiliasi', `Dihapus BPD (${counts.dihapus_rekonsiliasi})`],
                ['dihapus_manual', `Dihapus Manual (${counts.dihapus_manual})`],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilter(val)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  filter === val
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}

            <div className="ml-auto">
              <Button
                onClick={() => exportMutation.mutate(tetapRows)}
                disabled={exportMutation.isPending || tetapRows.length === 0}
                className="gap-2"
              >
                {exportMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Download untuk Upload BPD ({tetapRows.length} baris)
              </Button>
            </div>
          </div>

          {/* Table */}
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 py-12 text-slate-400">
              <p className="text-sm">Tidak ada data untuk filter ini.</p>
            </div>
          ) : (
            <div className="overflow-auto rounded-lg border border-slate-200">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">#</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">NIS</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">Nama</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">Kelas</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-center font-semibold text-slate-700">Tahun</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-center font-semibold text-slate-700">Bulan</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-right font-semibold text-slate-700">Nominal</th>
                    <th className="border-b border-r border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">Status</th>
                    <th className="border-b border-slate-200 px-2 py-2 text-left font-semibold text-slate-700">Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, idx) => (
                    <tr
                      key={`${row.nis}-${row.tahun}-${row.bulan}`}
                      className={`${rowBgClass(row.status)} hover:brightness-95`}
                    >
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-400 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 tabular-nums text-slate-700">
                        {row.nis}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-700">
                        {row.nama}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-slate-600">
                        {row.kelas} {row.jurusan}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-center tabular-nums text-slate-600">
                        {row.tahun}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-center text-slate-600">
                        {formatBulan(row.bulan)}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5 text-right tabular-nums text-slate-700">
                        {formatNominal(row.nominal)}
                      </td>
                      <td className="border-b border-r border-slate-200 px-2 py-1.5">
                        {row.status === 'tetap' && (
                          <Badge variant="outline" className="border-blue-300 text-blue-700 text-[10px]">
                            Tetap
                          </Badge>
                        )}
                        {row.status === 'dihapus_rekonsiliasi' && (
                          <Badge variant="outline" className="border-green-300 text-green-700 text-[10px]">
                            Dihapus BPD
                          </Badge>
                        )}
                        {row.status === 'dihapus_manual' && (
                          <Badge variant="outline" className="border-yellow-400 text-yellow-700 text-[10px]">
                            Dihapus Manual
                          </Badge>
                        )}
                      </td>
                      <td className="border-b border-slate-200 px-2 py-1.5 text-slate-500">
                        {row.alasan ?? '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.lastImportAt && (
            <p className="text-xs text-slate-400">
              Data master BPD terakhir diimport:{' '}
              {new Date(data.lastImportAt).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TagihanBpdPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Tagihan BPD — Workflow"
        description="Import tagihan BPD, catat pembayaran manual, lalu export file upload yang bersih."
      />

      <Tabs defaultValue="import-bpd">
        <TabsList className="mb-4">
          <TabsTrigger value="import-bpd">Import BPD Tagihan</TabsTrigger>
          <TabsTrigger value="pembayaran-manual">Pembayaran Manual</TabsTrigger>
          <TabsTrigger value="review-export">Review &amp; Export</TabsTrigger>
        </TabsList>

        <TabsContent value="import-bpd">
          <ImportBpdTab />
        </TabsContent>

        <TabsContent value="pembayaran-manual">
          <PembayaranManualTab />
        </TabsContent>

        <TabsContent value="review-export">
          <ReviewExportTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
