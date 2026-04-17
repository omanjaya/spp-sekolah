'use client'

import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { HttpError, apiFetchRaw } from '@/lib/http'

/**
 * Trigger a file download in the browser from a Blob.
 * Uses a temporary <a download> element so we get the correct filename.
 */
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
    // Defer revocation a tick so the download has latched onto the URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function filenameFromResponse(res: Response, fallback: string): string {
  const cd = res.headers.get('content-disposition')
  if (!cd) return fallback
  // Try `filename*=UTF-8''...` (RFC 5987) first, then `filename="..."`.
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

async function downloadFile(url: string, fallbackName: string, init?: RequestInit): Promise<void> {
  const res = await fetch(url, init)
  if (!res.ok) {
    // Surface server error envelope when possible.
    let message = `Unduh gagal (${res.status})`
    try {
      const json = (await res.json()) as { error?: { message?: string } }
      if (json?.error?.message) message = json.error.message
    } catch {
      /* ignore non-JSON */
    }
    throw new HttpError('DOWNLOAD_FAILED', message, res.status)
  }
  const blob = await res.blob()
  const name = filenameFromResponse(res, fallbackName)
  triggerBlobDownload(blob, name)
}

export function useExportPdf() {
  return useMutation({
    mutationFn: async (rombelId: string) => {
      await downloadFile(
        `/api/v1/export/pdf/${encodeURIComponent(rombelId)}`,
        `rekap-${rombelId}.pdf`,
      )
    },
    onSuccess: () => toast.success('PDF berhasil diunduh.'),
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengunduh PDF.'
      toast.error(msg)
    },
  })
}

export function useExportExcel() {
  return useMutation({
    mutationFn: async (rombelId: string) => {
      await downloadFile(
        `/api/v1/export/excel/${encodeURIComponent(rombelId)}`,
        `rekap-${rombelId}.xlsx`,
      )
    },
    onSuccess: () => toast.success('Excel berhasil diunduh.'),
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengunduh Excel.'
      toast.error(msg)
    },
  })
}

export interface BatchExportInput {
  filter: {
    angkatan?: number
    rombelIds?: string[]
    tahunAjaranId?: string
  }
  format: 'pdf' | 'excel' | 'both'
}

export function useExportBatch() {
  return useMutation({
    mutationFn: async (input: BatchExportInput) => {
      const res = await apiFetchRaw('/api/v1/export/batch', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      if (!res.ok) {
        let message = `Unduh gagal (${res.status})`
        try {
          const json = (await res.json()) as { error?: { message?: string } }
          if (json?.error?.message) message = json.error.message
        } catch {
          /* ignore */
        }
        throw new HttpError('BATCH_FAILED', message, res.status)
      }
      const blob = await res.blob()
      const name = filenameFromResponse(res, 'export.zip')
      triggerBlobDownload(blob, name)
    },
    onSuccess: () => toast.success('ZIP berhasil diunduh.'),
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengunduh ZIP.'
      toast.error(msg)
    },
  })
}
