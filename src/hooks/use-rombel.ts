'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http';
import type { ApiMeta } from '@/types/api';
import type { RombelDTO } from '@/types/domain';
import type {
  RombelCreateInput,
  RombelFilterInput,
  RombelUpdateInput,
} from '@/lib/validators/rombel.schema';

export const rombelKeys = {
  all: ['rombel'] as const,
  list: (filter: Partial<RombelFilterInput>) => ['rombel', 'list', filter] as const,
  detail: (id: string) => ['rombel', 'detail', id] as const,
};

type ListResponse = { items: RombelDTO[]; total: number; page: number; limit: number };

async function fetchList(filter: Partial<RombelFilterInput>): Promise<ListResponse> {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const res = await fetch(`/api/v1/rombel?${usp.toString()}`);
  const json = (await res.json()) as {
    success: boolean;
    data?: RombelDTO[];
    meta?: ApiMeta;
    error?: { message?: string };
  };
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? 'Gagal memuat data rombel.');
  }
  return {
    items: json.data ?? [],
    total: json.meta?.total ?? 0,
    page: json.meta?.page ?? 1,
    limit: json.meta?.limit ?? 20,
  };
}

export function useRombelList(filter: Partial<RombelFilterInput> = {}) {
  return useQuery({
    queryKey: rombelKeys.list(filter),
    queryFn: () => fetchList(filter),
  });
}

export function useRombelDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: rombelKeys.detail(id ?? ''),
    queryFn: () => apiFetch<RombelDTO>(`/api/v1/rombel/${id}`),
    enabled: !!id,
  });
}

export function useCreateRombel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RombelCreateInput) =>
      apiFetch<RombelDTO>('/api/v1/rombel', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rombelKeys.all }),
  });
}

export function useUpdateRombel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: RombelUpdateInput }) =>
      apiFetch<RombelDTO>(`/api/v1/rombel/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rombelKeys.all }),
  });
}

export function useDeleteRombel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<{ id: string }>(`/api/v1/rombel/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: rombelKeys.all }),
  });
}
