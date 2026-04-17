'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch } from '@/lib/http';
import type { PembayaranDto } from '@/services/pembayaran.service';
import type {
  PembayaranCancelInput,
  PembayaranFilterInput,
  PembayaranManualCreateInput,
  PembayaranUpdateInput,
} from '@/lib/validators/pembayaran.schema';

export type PembayaranListMeta = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const KEY = {
  list: (filter: Partial<PembayaranFilterInput>) => ['pembayaran', 'list', filter] as const,
  detail: (id: string) => ['pembayaran', 'detail', id] as const,
};

export function usePembayaranList(filter: Partial<PembayaranFilterInput>) {
  return useQuery({
    queryKey: KEY.list(filter),
    queryFn: async () => {
      const searchParams: Record<string, string | number | undefined> = {};
      for (const [k, v] of Object.entries(filter)) {
        if (v === undefined || v === null || v === '') continue;
        searchParams[k] = typeof v === 'number' ? v : String(v);
      }
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(searchParams)) {
        if (v !== undefined) qs.set(k, String(v));
      }
      const url = `/api/v1/pembayaran${qs.size ? `?${qs.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      const json = (await res.json()) as
        | { success: true; data: PembayaranDto[]; meta: PembayaranListMeta }
        | { success: false; error: { message: string } };
      if (!res.ok || !('success' in json) || !json.success) {
        const msg =
          'error' in json ? (json.error as { message?: string }).message ?? 'Gagal memuat.' : 'Gagal memuat.';
        throw new Error(msg);
      }
      return { items: json.data, meta: json.meta };
    },
  });
}

export function usePembayaranDetail(id: string | null) {
  return useQuery({
    queryKey: KEY.detail(id ?? ''),
    queryFn: () => apiFetch<PembayaranDto>(`/api/v1/pembayaran/${id}`),
    enabled: !!id,
  });
}

export function useCreatePembayaranManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PembayaranManualCreateInput) =>
      apiFetch<PembayaranDto>('/api/v1/pembayaran', { method: 'POST', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pembayaran', 'list'] });
    },
  });
}

export function useUpdatePembayaran() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PembayaranUpdateInput }) =>
      apiFetch<PembayaranDto>(`/api/v1/pembayaran/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_, vars) => {
      void qc.invalidateQueries({ queryKey: ['pembayaran', 'list'] });
      void qc.invalidateQueries({ queryKey: KEY.detail(vars.id) });
    },
  });
}

export function useCancelPembayaran() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: PembayaranCancelInput }) =>
      apiFetch<PembayaranDto>(`/api/v1/pembayaran/${id}`, { method: 'DELETE', body: input }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pembayaran', 'list'] });
    },
  });
}
