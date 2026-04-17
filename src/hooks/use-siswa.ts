'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http';
import type { ApiMeta } from '@/types/api';
import type { BulkResult, SiswaDTO } from '@/types/domain';
import type {
  SiswaBulkImportInput,
  SiswaCreateInput,
  SiswaFilterInput,
  SiswaUpdateInput,
} from '@/lib/validators/siswa.schema';

type ListResponse = { items: SiswaDTO[]; total: number; page: number; limit: number };

export const siswaKeys = {
  all: ['siswa'] as const,
  list: (filter: Partial<SiswaFilterInput>) => ['siswa', 'list', filter] as const,
  detail: (id: string) => ['siswa', 'detail', id] as const,
};

function toSearchParams(filter: Partial<SiswaFilterInput>): Record<string, string | number | undefined> {
  return {
    search: filter.search,
    angkatan: filter.angkatan,
    status: filter.status,
    page: filter.page,
    limit: filter.limit,
    sortBy: filter.sortBy,
    sortOrder: filter.sortOrder,
  };
}

async function fetchList(filter: Partial<SiswaFilterInput>): Promise<ListResponse> {
  const url = '/api/v1/siswa';
  const params = toSearchParams(filter);
  // apiFetch returns only `data`, we need meta too — use fetch directly.
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const res = await fetch(`${url}?${usp.toString()}`);
  const json = (await res.json()) as {
    success: boolean;
    data?: SiswaDTO[];
    meta?: ApiMeta;
    error?: { message?: string };
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? 'Gagal memuat data siswa.');
  }
  return {
    items: json.data ?? [],
    total: json.meta?.total ?? 0,
    page: json.meta?.page ?? 1,
    limit: json.meta?.limit ?? 20,
  };
}

export function useSiswaList(filter: Partial<SiswaFilterInput> = {}) {
  return useQuery({
    queryKey: siswaKeys.list(filter),
    queryFn: () => fetchList(filter),
  });
}

export function useSiswaDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: siswaKeys.detail(id ?? ''),
    queryFn: () => apiFetch<SiswaDTO>(`/api/v1/siswa/${id}`),
    enabled: !!id,
  });
}

export function useCreateSiswa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiswaCreateInput) =>
      apiFetch<SiswaDTO>('/api/v1/siswa', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: siswaKeys.all });
    },
  });
}

export function useUpdateSiswa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: SiswaUpdateInput }) =>
      apiFetch<SiswaDTO>(`/api/v1/siswa/${id}`, { method: 'PATCH', body: input }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: siswaKeys.all });
      qc.invalidateQueries({ queryKey: siswaKeys.detail(variables.id) });
    },
  });
}

export function useDeleteSiswa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/api/v1/siswa/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: siswaKeys.all });
    },
  });
}

export function useBulkImportSiswa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SiswaBulkImportInput) =>
      apiFetch<BulkResult>('/api/v1/siswa/bulk-import', { method: 'POST', body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: siswaKeys.all });
    },
  });
}
