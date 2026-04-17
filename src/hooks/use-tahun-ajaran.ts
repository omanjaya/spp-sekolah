'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http';
import type { TahunAjaranDTO } from '@/types/domain';
import type {
  TahunAjaranCreateInput,
  TahunAjaranUpdateInput,
} from '@/lib/validators/tahun-ajaran.schema';

export const tahunAjaranKeys = {
  all: ['tahun-ajaran'] as const,
  list: () => ['tahun-ajaran', 'list'] as const,
  detail: (id: string) => ['tahun-ajaran', 'detail', id] as const,
};

export function useTahunAjaranList() {
  return useQuery({
    queryKey: tahunAjaranKeys.list(),
    queryFn: () => apiFetch<TahunAjaranDTO[]>('/api/v1/tahun-ajaran'),
  });
}

export function useTahunAjaranDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: tahunAjaranKeys.detail(id ?? ''),
    queryFn: () => apiFetch<TahunAjaranDTO>(`/api/v1/tahun-ajaran/${id}`),
    enabled: !!id,
  });
}

export function useCreateTahunAjaran() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: TahunAjaranCreateInput) =>
      apiFetch<TahunAjaranDTO>('/api/v1/tahun-ajaran', { method: 'POST', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tahunAjaranKeys.all }),
  });
}

export function useUpdateTahunAjaran() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: TahunAjaranUpdateInput }) =>
      apiFetch<TahunAjaranDTO>(`/api/v1/tahun-ajaran/${id}`, { method: 'PATCH', body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tahunAjaranKeys.all }),
  });
}

export function useDeleteTahunAjaran() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/v1/tahun-ajaran/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tahunAjaranKeys.all }),
  });
}

export function useActivateTahunAjaran() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<TahunAjaranDTO>(`/api/v1/tahun-ajaran/${id}/activate`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: tahunAjaranKeys.all }),
  });
}
