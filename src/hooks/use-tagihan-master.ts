'use client'

import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { apiFetch, apiFetchRaw, HttpError } from '@/lib/http'

export interface TagihanRow {
  _key: string
  id: string
  nama: string
  jum_tagihan: string
  instansi: string
  Alamat: string
  Kelas: string
  Jurusan: string
  Tahun: number
  Bulan: number
  DanaMasyarakat: number
  Keterangan: string
}

interface TagihanResponse {
  rows: TagihanRow[]
  taKode: string
}

export const tagihanMasterKeys = {
  all: ['tagihan-master'] as const,
  list: (filter: { tahunAjaranId?: string; grade?: string }) =>
    ['tagihan-master', 'list', filter] as const,
}

export function useTagihanMaster(filter: {
  tahunAjaranId?: string
  grade?: string
}) {
  return useQuery<TagihanResponse>({
    queryKey: tagihanMasterKeys.list(filter),
    queryFn: () =>
      apiFetch<TagihanResponse>('/api/v1/master-data/tagihan', {
        searchParams: {
          ...(filter.tahunAjaranId ? { tahunAjaranId: filter.tahunAjaranId } : {}),
          ...(filter.grade ? { grade: filter.grade } : {}),
        },
      }),
  })
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useExportTagihanMaster() {
  return useMutation({
    mutationFn: async (rows: TagihanRow[]) => {
      const exportRows = rows.map(({ _key, ...rest }) => rest)
      const res = await apiFetchRaw('/api/v1/master-data/tagihan', {
        method: 'POST',
        body: { rows: exportRows },
      })
      if (!res.ok) {
        let msg = `Export gagal (${res.status})`
        try {
          const json = (await res.json()) as { error?: { message?: string } }
          if (json?.error?.message) msg = json.error.message
        } catch { /* ignore */ }
        throw new HttpError('EXPORT_FAILED', msg, res.status)
      }
      const blob = await res.blob()
      const cd = res.headers.get('content-disposition') ?? ''
      const match = cd.match(/filename="(.+)"/)
      const name = match?.[1] ?? 'tagihan_belum_bayar.xlsx'
      triggerBlobDownload(blob, name)
    },
    onSuccess: () => toast.success('Excel berhasil diunduh.'),
    onError: (err) => {
      toast.error(err instanceof HttpError ? err.message : 'Gagal export tagihan.')
    },
  })
}
