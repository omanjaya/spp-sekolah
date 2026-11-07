'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiFetch, apiUpload, HttpError, apiFetchRaw } from '@/lib/http'
import type { TagihanReviewResult, ReviewRow } from '@/services/tagihan-bpd.service'

export type { TagihanReviewResult, ReviewRow }

export interface ImportTagihanResult {
  importBatchId: string
  totalRows: number
  upserted: number
  skipped: number
  parseErrors?: string[]
}

export interface ImportManualResult {
  success: number
  skipped: number
  errors: string[]
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function filenameFromResponse(res: Response, fallback: string): string {
  const cd = res.headers.get('content-disposition')
  if (!cd) return fallback
  const star = /filename\*\s*=\s*(?:UTF-8''|)([^;]+)/i.exec(cd)
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim().replace(/^"|"$/g, ''))
    } catch {
      /* fall through */
    }
  }
  const plain = /filename\s*=\s*"?([^";]+)"?/i.exec(cd)
  if (plain?.[1]) return plain[1].trim()
  return fallback
}

export function useTagihanBpdReview() {
  return useQuery({
    queryKey: ['tagihan-bpd-review'],
    queryFn: () => apiFetch<TagihanReviewResult>('/api/v1/master-data/tagihan-bpd/review'),
  })
}

export function useImportTagihanBpd() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return apiUpload<ImportTagihanResult>('/api/v1/master-data/tagihan-bpd/import', fd)
    },
    onSuccess: (data) => {
      toast.success(
        `Import berhasil. ${data.upserted} baris dimuat, ${data.skipped} dilewati.`,
      )
      void qc.invalidateQueries({ queryKey: ['tagihan-bpd-review'] })
    },
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengimport file tagihan BPD.'
      toast.error(msg)
    },
  })
}

export function useExportTagihanBpd() {
  return useMutation({
    mutationFn: async (rows: ReviewRow[]) => {
      const res = await apiFetchRaw('/api/v1/master-data/tagihan-bpd/export', {
        method: 'POST',
        body: { rows },
      })
      if (!res.ok) {
        let message = `Unduh gagal (${res.status})`
        try {
          const json = (await res.json()) as { error?: { message?: string } }
          if (json?.error?.message) message = json.error.message
        } catch {
          /* ignore */
        }
        throw new HttpError('EXPORT_FAILED', message, res.status)
      }
      const blob = await res.blob()
      const date = new Date().toISOString().slice(0, 10)
      const name = filenameFromResponse(res, `Tagihan_SMAN_1_DENPASAR_upload_${date}.xlsx`)
      triggerBlobDownload(blob, name)
    },
    onSuccess: () => toast.success('File upload BPD berhasil diunduh.'),
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengekspor file tagihan.'
      toast.error(msg)
    },
  })
}

export function useDownloadManualTemplate() {
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/v1/master-data/tagihan-manual/template')
      if (!res.ok) {
        throw new HttpError('DOWNLOAD_FAILED', `Unduh gagal (${res.status})`, res.status)
      }
      const blob = await res.blob()
      const name = filenameFromResponse(res, 'Template_PembayaranManual.xlsx')
      triggerBlobDownload(blob, name)
    },
    onSuccess: () => toast.success('Template berhasil diunduh.'),
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengunduh template.'
      toast.error(msg)
    },
  })
}

export function useImportManual() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData()
      fd.append('file', file)
      return apiUpload<ImportManualResult>('/api/v1/master-data/tagihan-manual/import', fd)
    },
    onSuccess: (data) => {
      toast.success(
        `Import berhasil. ${data.success} periode keringanan ditambahkan.`,
      )
      void qc.invalidateQueries({ queryKey: ['tagihan-bpd-review'] })
    },
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengimport pembayaran manual.'
      toast.error(msg)
    },
  })
}

// ─── Manual add (ad-hoc per NIS) ──────────────────────────────────────────────

export interface AddManualTagihanInput {
  nis: string
  tahun: number
  bulan: number
  nominal: number
  keterangan?: string
}

export interface AddManualTagihanResult {
  created: boolean
  reason?: string
  nama?: string
}

export function useAddManualTagihan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: AddManualTagihanInput) =>
      apiFetch<AddManualTagihanResult>('/api/v1/master-data/tagihan-bpd/manual', {
        method: 'POST',
        body: input,
      }),
    onSuccess: (data) => {
      if (data.created) {
        toast.success(`Tagihan ditambahkan untuk ${data.nama ?? '(siswa)'}`)
        void qc.invalidateQueries({ queryKey: ['tagihan-bpd-review'] })
      } else {
        toast.error(data.reason ?? 'Tagihan tidak ditambahkan.')
      }
    },
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal menambahkan tagihan.'
      toast.error(msg)
    },
  })
}

// ─── Bulk generate dari tunggakan ─────────────────────────────────────────────

export interface BulkGenerateInput {
  tahun: number
  bulan: number
  angkatan?: number
}

export interface BulkGenerateResult {
  totalEligible: number
  alreadyInMaster: number
  paidViaRekon: number
  paidViaManual: number
  hasKeringanan100: number
  hasPelunasan: number
  created: number
}

export function useBulkGenerateTagihan() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: BulkGenerateInput) =>
      apiFetch<BulkGenerateResult>('/api/v1/master-data/tagihan-bpd/bulk-from-tunggakan', {
        method: 'POST',
        body: input,
      }),
    onSuccess: (data) => {
      toast.success(
        `Generate selesai: ${data.created} tagihan baru. (sudah di master: ${data.alreadyInMaster}, sudah bayar rekon: ${data.paidViaRekon}, manual: ${data.paidViaManual}, keringanan 100%: ${data.hasKeringanan100}, pelunasan: ${data.hasPelunasan})`,
      )
      void qc.invalidateQueries({ queryKey: ['tagihan-bpd-review'] })
    },
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal generate tagihan.'
      toast.error(msg)
    },
  })
}
