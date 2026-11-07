'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/http';
import type { KwitansiDto, SiswaMonthStatusDto } from '@/services/kwitansi.service';
import type {
  KwitansiCreateInput,
  KwitansiFilterInput,
  KwitansiUpdateInput,
} from '@/lib/validators/kwitansi.schema';

export type KwitansiListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const KEY = {
  list: (filter: Partial<KwitansiFilterInput>) => ['kwitansi', 'list', filter] as const,
  detail: (id: string) => ['kwitansi', 'detail', id] as const,
};

export function useKwitansiList(filter: Partial<KwitansiFilterInput> = {}) {
  return useQuery({
    queryKey: KEY.list(filter),
    queryFn: async () => {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(filter)) {
        if (v === undefined || v === null || v === '') continue;
        if (v instanceof Date) {
          qs.set(k, v.toISOString());
        } else {
          qs.set(k, String(v));
        }
      }
      const url = `/api/v1/kwitansi${qs.size ? `?${qs.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const json = (await res.json()) as
        | { success: true; data: KwitansiDto[]; meta: KwitansiListMeta }
        | { success: false; error: { message: string } };
      if (!res.ok || !('success' in json) || !json.success) {
        const msg =
          'error' in json
            ? (json.error as { message?: string }).message ?? 'Gagal memuat.'
            : 'Gagal memuat.';
        throw new Error(msg);
      }
      return { items: json.data, meta: json.meta };
    },
  });
}

export function useKwitansiDetail(id: string | null) {
  return useQuery({
    queryKey: KEY.detail(id ?? ''),
    queryFn: () => apiFetch<KwitansiDto>(`/api/v1/kwitansi/${id}`),
    enabled: !!id,
  });
}

export function useCreateKwitansi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: KwitansiCreateInput) =>
      apiFetch<KwitansiDto>('/api/v1/kwitansi', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kwitansi', 'list'] });
      void qc.invalidateQueries({ queryKey: ['kwitansi', 'siswa-months'] });
    },
  });
}

export function useUpdateKwitansi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: KwitansiUpdateInput }) =>
      apiFetch<KwitansiDto>(`/api/v1/kwitansi/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (k) => {
      void qc.invalidateQueries({ queryKey: ['kwitansi', 'list'] });
      void qc.invalidateQueries({ queryKey: ['kwitansi', 'detail', k.id] });
      void qc.invalidateQueries({ queryKey: ['kwitansi', 'siswa-months'] });
    },
  });
}

export function useDeleteKwitansi() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ message: string }>(`/api/v1/kwitansi/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['kwitansi', 'list'] });
      void qc.invalidateQueries({ queryKey: ['kwitansi', 'siswa-months'] });
    },
  });
}

/** Ambil status bulan (bayar/kwitansi) untuk siswa tertentu. */
export function useSiswaMonths(siswaId: string | null) {
  return useQuery({
    queryKey: ['kwitansi', 'siswa-months', siswaId] as const,
    queryFn: () =>
      apiFetch<{ data: SiswaMonthStatusDto[] }>(`/api/v1/kwitansi/siswa/${siswaId}/months`).then(
        (r) => r.data,
      ),
    enabled: !!siswaId,
  });
}

/** Buka PDF kwitansi di tab baru. */
export function openKwitansiPdf(id: string) {
  window.open(`/api/v1/kwitansi/${id}/pdf`, '_blank', 'noopener');
}
