'use client'

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Archive,
  ArrowRight,
  Download,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Loader2,
  Package,
} from 'lucide-react'
import Link from 'next/link'

import { PageHeader } from '@/components/layouts/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/feedback/empty-state'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch } from '@/lib/http'
import { toast } from 'sonner'
import type { RombelDTO, TahunAjaranDTO } from '@/types/domain'
import { useExportBatch, useExportExcel, useExportPdf } from '@/hooks/use-export'
import { cn } from '@/lib/utils'

interface AngkatanPreset {
  angkatan: number
  grade: 'X' | 'XI' | 'XII'
  tahunAjaranId: string
  tahunAjaranKode: string
  label: string
}

export default function EksporPage() {
  const { data: tahunAjaranList, isLoading: loadingTA } = useQuery({
    queryKey: ['tahun-ajaran', 'all'],
    queryFn: () => apiFetch<TahunAjaranDTO[]>('/api/v1/tahun-ajaran'),
  })

  const [showArchive, setShowArchive] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<AngkatanPreset | null>(null)
  const [selectedRombelIds, setSelectedRombelIds] = useState<Set<string>>(new Set())
  const [previewRombelId, setPreviewRombelId] = useState<string>('')

  // Compute active + archive angkatan presets.
  // Active TA = yang isActive=true. Dari situ turunkan 3 angkatan (X/XI/XII).
  const { activePresets, archivePresets } = useMemo(() => {
    const list = tahunAjaranList ?? []
    const activeTA = list.find((t) => t.isActive)
    const active: AngkatanPreset[] = []
    const archive: AngkatanPreset[] = []
    if (activeTA) {
      // Kelas XII → angkatan = tahunMulai - 2 (masuk 2 tahun lalu)
      // Kelas XI  → angkatan = tahunMulai - 1
      // Kelas X   → angkatan = tahunMulai
      const gradeMap: Array<[number, 'X' | 'XI' | 'XII']> = [
        [activeTA.tahunMulai - 2, 'XII'],
        [activeTA.tahunMulai - 1, 'XI'],
        [activeTA.tahunMulai, 'X'],
      ]
      for (const [angkatan, grade] of gradeMap) {
        active.push({
          angkatan,
          grade,
          tahunAjaranId: activeTA.id,
          tahunAjaranKode: activeTA.kode,
          label: `Kelas ${grade} · Angkatan ${angkatan}`,
        })
      }
      // Archive: semua TA lain (sebelum aktif), derive hanya angkatan XII dari tiap TA
      // (angkatan yang sudah lulus di TA tsb)
      const olderTAs = list
        .filter((t) => !t.isActive && t.tahunMulai < activeTA.tahunMulai)
        .sort((a, b) => b.tahunMulai - a.tahunMulai)
      for (const ta of olderTAs) {
        const angkatan = ta.tahunMulai - 2
        archive.push({
          angkatan,
          grade: 'XII',
          tahunAjaranId: ta.id,
          tahunAjaranKode: ta.kode,
          label: `Angkatan ${angkatan} · Lulus ${ta.tahunAkhir}`,
        })
      }
    }
    return { activePresets: active, archivePresets: archive }
  }, [tahunAjaranList])

  // Auto-select first active preset on load
  useEffect(() => {
    if (!selectedPreset && activePresets.length > 0) {
      // Default: Kelas XII (paling relevan untuk laporan komite)
      const xii = activePresets.find((p) => p.grade === 'XII')
      setSelectedPreset(xii ?? activePresets[0] ?? null)
    }
  }, [activePresets, selectedPreset])

  // Rombels untuk angkatan terpilih: filter rombels di TA terpilih yang grade-nya match
  const { data: rombelPayload, isLoading: loadingRombel } = useQuery({
    queryKey: ['rombel', 'preset', selectedPreset?.tahunAjaranId, selectedPreset?.grade],
    queryFn: () =>
      apiFetch<RombelDTO[]>('/api/v1/rombel', {
        searchParams: {
          limit: 100,
          tahunAjaranId: selectedPreset?.tahunAjaranId ?? '',
        },
      }),
    enabled: Boolean(selectedPreset?.tahunAjaranId),
  })

  const rombels = useMemo(() => {
    if (!rombelPayload || !selectedPreset) return []
    return rombelPayload.filter((r) => r.grade === selectedPreset.grade)
  }, [rombelPayload, selectedPreset])

  // Reset selections when preset changes
  useEffect(() => {
    setSelectedRombelIds(new Set())
    setPreviewRombelId('')
    setIframeLoading(true)
  }, [selectedPreset?.tahunAjaranId, selectedPreset?.grade])

  // Auto-select first rombel for preview saat data load
  useEffect(() => {
    if (rombels.length > 0 && !previewRombelId) {
      setPreviewRombelId(rombels[0]!.id)
    }
  }, [rombels, previewRombelId])

  const [iframeLoading, setIframeLoading] = useState(true)

  const pdfMutation = useExportPdf()
  const excelMutation = useExportExcel()
  const batchMutation = useExportBatch()

  const toggleRombel = (id: string): void => {
    const next = new Set(selectedRombelIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedRombelIds(next)
    if (!previewRombelId && next.size > 0) {
      setPreviewRombelId(id)
      setIframeLoading(true)
    }
  }

  const toggleAllRombels = (): void => {
    if (selectedRombelIds.size === rombels.length) {
      setSelectedRombelIds(new Set())
    } else {
      setSelectedRombelIds(new Set(rombels.map((r) => r.id)))
    }
  }

  const activeRombelId = previewRombelId || Array.from(selectedRombelIds)[0] || ''
  const canDownloadOne = Boolean(activeRombelId)
  const canDownloadBatch = selectedRombelIds.size > 0

  const handleDownloadPdf = (): void => {
    if (activeRombelId) pdfMutation.mutate(activeRombelId)
  }
  const handleDownloadExcel = (): void => {
    if (activeRombelId) excelMutation.mutate(activeRombelId)
  }
  const handleDownloadBatch = (format: 'pdf' | 'excel' | 'both'): void => {
    if (!canDownloadBatch) return
    batchMutation.mutate({
      filter: { rombelIds: Array.from(selectedRombelIds) },
      format,
    })
  }

  const presetsToShow = showArchive ? archivePresets : activePresets

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ekspor Laporan Komite"
        description="Unduh matriks pembayaran komite per rombel dalam format PDF atau Excel."
      />

      {/* Link ke BPD Upload */}
      <Card className="border-blue-100 bg-blue-50/50">
        <CardContent className="flex items-center justify-between py-4">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="h-5 w-5 text-blue-500" aria-hidden="true" />
            <div>
              <p className="text-sm font-medium text-slate-800">Upload Tagihan ke asik.bpdbali?</p>
              <p className="text-xs text-slate-500">Edit dan export tagihan belum bayar di halaman BPD Upload.</p>
            </div>
          </div>
          <Button asChild variant="outline" size="sm" className="gap-1.5 border-blue-200 text-blue-700 hover:bg-blue-100">
            <Link href="/master-data/tagihan">
              Buka BPD Upload <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      {/* Preset angkatan — tab besar */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700">
            {showArchive ? 'Angkatan Arsip (Lulus)' : 'Angkatan Aktif'}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowArchive((v) => !v)}
            disabled={archivePresets.length === 0 && !showArchive}
          >
            {showArchive ? (
              <>
                <GraduationCap className="h-4 w-4" aria-hidden="true" />
                Tampilkan aktif
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" aria-hidden="true" />
                Lihat arsip ({archivePresets.length})
              </>
            )}
          </Button>
        </div>

        {loadingTA ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : presetsToShow.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="Tidak ada angkatan"
            description={
              showArchive
                ? 'Belum ada angkatan yang sudah lulus.'
                : 'Pastikan ada Tahun Ajaran yang aktif di Pengaturan.'
            }
          />
        ) : (
          <div
            className={cn(
              'grid grid-cols-1 gap-3',
              presetsToShow.length === 3
                ? 'sm:grid-cols-3'
                : presetsToShow.length === 2
                  ? 'sm:grid-cols-2'
                  : 'sm:grid-cols-2 lg:grid-cols-3',
            )}
          >
            {presetsToShow.map((preset) => {
              const isSelected =
                selectedPreset?.tahunAjaranId === preset.tahunAjaranId &&
                selectedPreset?.grade === preset.grade
              return (
                <button
                  key={`${preset.tahunAjaranId}-${preset.grade}`}
                  type="button"
                  onClick={() => setSelectedPreset(preset)}
                  className={cn(
                    'rounded-lg border p-4 text-left transition-colors',
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-400',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p
                        className={cn(
                          'text-xs uppercase tracking-wide',
                          isSelected ? 'text-slate-300' : 'text-slate-500',
                        )}
                      >
                        Kelas {preset.grade}
                      </p>
                      <p className="mt-1 text-lg font-semibold">
                        Angkatan {preset.angkatan}
                      </p>
                    </div>
                    <GraduationCap
                      className={cn(
                        'h-5 w-5',
                        isSelected ? 'text-slate-300' : 'text-slate-400',
                      )}
                      aria-hidden="true"
                    />
                  </div>
                  <p
                    className={cn(
                      'mt-2 text-xs',
                      isSelected ? 'text-slate-300' : 'text-slate-500',
                    )}
                  >
                    TA {preset.tahunAjaranKode}
                    {showArchive ? ' · arsip' : ''}
                  </p>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Rombel + Preview + Action */}
      {selectedPreset ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[340px_1fr]">
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold">
                Pilih Rombel — Kelas {selectedPreset.grade}
              </CardTitle>
              <CardDescription>
                {rombels.length > 0
                  ? `${rombels.length} rombel tersedia di TA ${selectedPreset.tahunAjaranKode}.`
                  : 'Belum ada data rombel.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingRombel ? (
                <Skeleton className="h-48 w-full" />
              ) : rombels.length === 0 ? (
                <p className="text-xs text-slate-500">
                  Tidak ada rombel kelas {selectedPreset.grade} di tahun ajaran ini.
                </p>
              ) : (
                <>
                  <label className="flex cursor-pointer items-center gap-2 rounded-sm border border-dashed border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                    <Checkbox
                      checked={
                        selectedRombelIds.size === rombels.length && rombels.length > 0
                      }
                      onCheckedChange={toggleAllRombels}
                      aria-label="Pilih semua rombel"
                    />
                    Pilih semua ({rombels.length})
                  </label>

                  <div className="max-h-[420px] space-y-1 overflow-y-auto rounded-md border border-slate-200 p-1">
                    {rombels.map((r) => {
                      const checked = selectedRombelIds.has(r.id)
                      const isPreview = previewRombelId === r.id
                      return (
                        <div
                          key={r.id}
                          className={cn(
                            'flex items-center gap-3 rounded-sm px-2 py-1.5 text-sm',
                            isPreview && 'bg-slate-100',
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleRombel(r.id)}
                            aria-label={`Pilih ${r.kode}`}
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewRombelId(r.id)
                              setIframeLoading(true)
                            }}
                            className="flex-1 cursor-pointer text-left hover:text-slate-900"
                          >
                            <span className="font-medium text-slate-800">{r.kode}</span>
                            {r.waliKelas ? (
                              <span className="ml-2 text-xs text-slate-500">{r.waliKelas}</span>
                            ) : null}
                          </button>
                          {isPreview ? (
                            <Badge variant="outline" className="h-5 text-[10px]">
                              Preview
                            </Badge>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Action bar */}
              <div className="space-y-3 border-t border-slate-200 pt-4">
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Unduh untuk rombel preview
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      onClick={handleDownloadPdf}
                      disabled={!canDownloadOne || pdfMutation.isPending}
                      className="gap-2"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      {pdfMutation.isPending ? 'Memproses' : 'PDF'}
                    </Button>
                    <Button
                      onClick={handleDownloadExcel}
                      disabled={!canDownloadOne || excelMutation.isPending}
                      variant="secondary"
                      className="gap-2"
                    >
                      <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                      {excelMutation.isPending ? 'Memproses' : 'Excel'}
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Unduh semua ({selectedRombelIds.size} rombel dipilih)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <Button
                      onClick={() => handleDownloadBatch('pdf')}
                      disabled={!canDownloadBatch || batchMutation.isPending}
                      variant="outline"
                      className="gap-2"
                    >
                      <FileText className="h-4 w-4" aria-hidden="true" />
                      Semua PDF
                    </Button>
                    <Button
                      onClick={() => handleDownloadBatch('excel')}
                      disabled={!canDownloadBatch || batchMutation.isPending}
                      variant="outline"
                      className="gap-2"
                    >
                      <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
                      Semua Excel
                    </Button>
                    <Button
                      onClick={() => handleDownloadBatch('both')}
                      disabled={!canDownloadBatch || batchMutation.isPending}
                      variant="outline"
                      className="gap-2"
                    >
                      <Package className="h-4 w-4" aria-hidden="true" />
                      PDF + Excel
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base font-semibold">Preview</CardTitle>
              <CardDescription>
                Matriks komite 3 halaman (Kelas X / XI / XII) untuk rombel yang dipilih sebagai preview.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {activeRombelId ? (
                <div className="relative h-[75vh]">
                  {iframeLoading ? (
                    <div className="absolute inset-0 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 p-4">
                      <Skeleton className="h-6 w-2/3" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      <Skeleton className="mt-2 h-40 w-full" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-4/5" />
                    </div>
                  ) : null}
                  <iframe
                    key={activeRombelId}
                    title="Preview PDF Matrix"
                    src={`/api/v1/export/preview/pdf/${encodeURIComponent(activeRombelId)}`}
                    className={cn(
                      'h-full w-full rounded-md border border-slate-200 bg-white',
                      iframeLoading && 'invisible',
                    )}
                    onLoad={() => setIframeLoading(false)}
                  />
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="Belum ada rombel dipilih"
                  description="Klik salah satu rombel di sisi kiri untuk melihat pratinjau PDF."
                />
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}

