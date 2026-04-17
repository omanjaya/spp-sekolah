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
import type {
  KeringananBulkAssignInput,
  KeringananCreateInput,
  KeringananFilterInput,
  KeringananUpdateInput,
} from '@/lib/validators/keringanan.schema';

export interface KeringananDto {
  id: string;
  siswaId: string;
  periodYear: number;
  periodMonth: number;
  jenis: string;
  persentase: number;
  alasan: string | null;
  buktiUrl: string | null;
  createdAt: string;
  createdBy: string | null;
  siswa?: {
    id: string;
    nis: string;
    nama: string;
    angkatan: number;
  };
}

interface ListResponse {
  data: KeringananDto[];
  meta?: ApiMeta;
}

function buildParams(filter: Partial<KeringananFilterInput>) {
  const params: Record<string, string | number | undefined> = {};
  if (filter.page !== undefined) params.page = filter.page;
  if (filter.limit !== undefined) params.limit = filter.limit;
  if (filter.siswaId) params.siswaId = filter.siswaId;
  if (filter.jenis) params.jenis = filter.jenis;
  if (filter.year !== undefined) params.year = filter.year;
  if (filter.month !== undefined) params.month = filter.month;
  if (filter.angkatan !== undefined) params.angkatan = filter.angkatan;
  return params;
}

async function fetchKeringananList(
  filter: Partial<KeringananFilterInput>,
): Promise<ListResponse> {
  const params = buildParams(filter);
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) usp.set(k, String(v));
  }
  const res = await fetch(`/api/v1/keringanan?${usp.toString()}`, {
    credentials: 'include',
  });
  const json = (await res.json()) as
    | { success: true; data: KeringananDto[]; meta?: ApiMeta }
    | { success: false; error: { message: string } };
  if (!res.ok || json.success === false) {
    const msg = json.success === false ? json.error.message : `Permintaan gagal (${res.status})`;
    throw new Error(msg);
  }
  return { data: json.data, meta: json.meta };
}

export function useKeringananList(filter: Partial<KeringananFilterInput> = {}) {
  return useQuery({
    queryKey: ['keringanan', 'list', filter],
    queryFn: () => fetchKeringananList(filter),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useKeringananCreate(
  options?: UseMutationOptions<KeringananDto, Error, KeringananCreateInput>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: KeringananCreateInput) =>
      apiFetch<KeringananDto>('/api/v1/keringanan', { method: 'POST', body: input }),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['keringanan'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export function useKeringananBulkAssign(
  options?: UseMutationOptions<
    { attempted: number; created: number; skipped: number },
    Error,
    KeringananBulkAssignInput
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: KeringananBulkAssignInput) =>
      apiFetch<{ attempted: number; created: number; skipped: number }>(
        '/api/v1/keringanan/bulk',
        { method: 'POST', body: input },
      ),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['keringanan'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export function useKeringananUpdate(
  options?: UseMutationOptions<
    KeringananDto,
    Error,
    { id: string; data: KeringananUpdateInput }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      apiFetch<KeringananDto>(`/api/v1/keringanan/${id}`, { method: 'PATCH', body: data }),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['keringanan'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export function useKeringananDelete(
  options?: UseMutationOptions<{ id: string }, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/v1/keringanan/${id}`, { method: 'DELETE' }),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['keringanan'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}
