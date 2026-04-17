'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/http';
import type { SummaryDTO, TunggakanRow, PemasukanResult, ImportBatchRow } from '@/services/report.service';

/**
 * Client-side hooks for `/api/v1/reports/*` endpoints.
 * All responses come from the standard `ApiSuccess<T>` envelope; `apiFetch`
 * already unwraps `data` for us.
 */

export function useSummary(tahunAjaranId?: string) {
  return useQuery({
    queryKey: ['reports', 'summary', tahunAjaranId ?? 'active'],
    queryFn: () =>
      apiFetch<SummaryDTO>('/api/v1/reports/summary', {
        searchParams: tahunAjaranId ? { tahunAjaranId } : undefined,
      }),
  });
}

export interface UseTunggakanParams {
  angkatan?: number;
  rombelId?: string;
  minBulan?: number;
  limit?: number;
}

export function useTunggakan(params: UseTunggakanParams = {}) {
  return useQuery({
    queryKey: ['reports', 'tunggakan', params],
    queryFn: () =>
      apiFetch<TunggakanRow[]>('/api/v1/reports/tunggakan', {
        searchParams: {
          angkatan: params.angkatan,
          rombelId: params.rombelId,
          minBulan: params.minBulan,
          limit: params.limit,
        },
      }),
  });
}

export interface UsePemasukanParams {
  year?: number;
  month?: number;
}

export function usePemasukan(params: UsePemasukanParams = {}) {
  return useQuery({
    queryKey: ['reports', 'pemasukan', params],
    queryFn: () =>
      apiFetch<PemasukanResult>('/api/v1/reports/pemasukan', {
        searchParams: {
          year: params.year,
          month: params.month,
        },
      }),
  });
}

export interface UseImportBatchesParams {
  status?: string;
  uploadedBy?: string;
  page?: number;
  limit?: number;
}

export function useImportBatches(params: UseImportBatchesParams = {}) {
  return useQuery({
    queryKey: ['reports', 'import-batches', params],
    queryFn: () =>
      apiFetch<ImportBatchRow[]>('/api/v1/reports/import-batches', {
        searchParams: {
          status: params.status,
          uploadedBy: params.uploadedBy,
          page: params.page,
          limit: params.limit,
        },
      }),
  });
}
