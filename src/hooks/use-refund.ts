'use client';

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from '@tanstack/react-query';

import { apiFetch } from '@/lib/http';
import type { ApiMeta } from '@/types/api';
import type { RefundCreateInput, RefundFilterInput } from '@/lib/validators/refund.schema';

export interface RefundDto {
  id: string;
  siswaId: string;
  pembayaranId: string | null;
  amount: number;
  alasan: string;
  tanggal: string;
  noBukti: string | null;
  createdById: string;
  createdAt: string;
  siswa?: {
    id: string;
    nis: string;
    nama: string;
    angkatan: number;
  };
  pembayaran?: {
    id: string;
    periodYear: number;
    periodMonth: number;
    amount: number;
  } | null;
}

interface ListResponse {
  data: RefundDto[];
  meta?: ApiMeta;
}

function buildParams(filter: Partial<RefundFilterInput>): Record<string, string> {
  const params: Record<string, string> = {};
  if (filter.page !== undefined) params.page = String(filter.page);
  if (filter.limit !== undefined) params.limit = String(filter.limit);
  if (filter.siswaId) params.siswaId = filter.siswaId;
  if (filter.dateFrom) params.dateFrom = filter.dateFrom instanceof Date ? filter.dateFrom.toISOString() : String(filter.dateFrom);
  if (filter.dateTo) params.dateTo = filter.dateTo instanceof Date ? filter.dateTo.toISOString() : String(filter.dateTo);
  return params;
}

async function fetchRefundList(filter: Partial<RefundFilterInput>): Promise<ListResponse> {
  const params = buildParams(filter);
  const usp = new URLSearchParams(params);
  const res = await fetch(`/api/v1/refund?${usp.toString()}`, { credentials: 'include' });
  const json = (await res.json()) as
    | { success: true; data: RefundDto[]; meta?: ApiMeta }
    | { success: false; error: { message: string } };
  if (!res.ok || json.success === false) {
    const msg = json.success === false ? json.error.message : `Permintaan gagal (${res.status})`;
    throw new Error(msg);
  }
  return { data: json.data, meta: json.meta };
}

export function useRefundList(filter: Partial<RefundFilterInput> = {}) {
  return useQuery({
    queryKey: ['refund', 'list', filter],
    queryFn: () => fetchRefundList(filter),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useRefundCreate(
  options?: UseMutationOptions<RefundDto, Error, RefundCreateInput>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RefundCreateInput) =>
      apiFetch<RefundDto>('/api/v1/refund', { method: 'POST', body: input }),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['refund'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export function useRefundDelete(
  options?: UseMutationOptions<{ id: string }, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/v1/refund/${id}`, { method: 'DELETE' }),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['refund'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}
