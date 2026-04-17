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
  PelunasanCreateInput,
  PelunasanFilterInput,
  PelunasanUpdateInput,
} from '@/lib/validators/pelunasan.schema';

export interface PelunasanDto {
  id: string;
  siswaId: string;
  periodeMulai: string;
  periodeAkhir: string;
  tanggalLunas: string;
  nominalTotal: number;
  noBukti: string | null;
  metodeLabel: string | null;
  catatan: string | null;
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
  data: PelunasanDto[];
  meta?: ApiMeta;
}

function buildParams(filter: Partial<PelunasanFilterInput>) {
  const params: Record<string, string | number | undefined> = {};
  if (filter.page !== undefined) params.page = filter.page;
  if (filter.limit !== undefined) params.limit = filter.limit;
  if (filter.siswaId) params.siswaId = filter.siswaId;
  if (filter.angkatan !== undefined) params.angkatan = filter.angkatan;
  if (filter.tahun !== undefined) params.tahun = filter.tahun;
  return params;
}

async function fetchPelunasanList(
  filter: Partial<PelunasanFilterInput>,
): Promise<ListResponse> {
  const params = buildParams(filter);
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) usp.set(k, String(v));
  }
  const res = await fetch(`/api/v1/pelunasan?${usp.toString()}`, {
    credentials: 'include',
  });
  const json = (await res.json()) as
    | { success: true; data: PelunasanDto[]; meta?: ApiMeta }
    | { success: false; error: { message: string } };
  if (!res.ok || json.success === false) {
    const msg = json.success === false ? json.error.message : `Permintaan gagal (${res.status})`;
    throw new Error(msg);
  }
  return { data: json.data, meta: json.meta };
}

export function usePelunasanList(filter: Partial<PelunasanFilterInput> = {}) {
  return useQuery({
    queryKey: ['pelunasan', 'list', filter],
    queryFn: () => fetchPelunasanList(filter),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function usePelunasanCreate(
  options?: UseMutationOptions<PelunasanDto, Error, PelunasanCreateInput>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PelunasanCreateInput) =>
      apiFetch<PelunasanDto>('/api/v1/pelunasan', { method: 'POST', body: input }),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['pelunasan'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export function usePelunasanUpdate(
  options?: UseMutationOptions<
    PelunasanDto,
    Error,
    { id: string; data: PelunasanUpdateInput }
  >,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      apiFetch<PelunasanDto>(`/api/v1/pelunasan/${id}`, { method: 'PATCH', body: data }),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['pelunasan'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}

export function usePelunasanDelete(
  options?: UseMutationOptions<{ id: string }, Error, string>,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ id: string }>(`/api/v1/pelunasan/${id}`, { method: 'DELETE' }),
    onSuccess: (...args) => {
      void qc.invalidateQueries({ queryKey: ['pelunasan'] });
      options?.onSuccess?.(...args);
    },
    ...options,
  });
}
