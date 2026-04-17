'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiFetch } from '@/lib/http';
import { useDebounce } from '@/hooks/use-debounce';

export interface SiswaSearchItem {
  id: string;
  nis: string;
  nama: string;
  angkatan: number;
  statusSiswa?: string;
}

/**
 * Search siswa via `/api/v1/siswa?search=...` (provided by Track 1).
 *
 * - Debounces the query string (250ms).
 * - Uses `keepPreviousData` to keep the last list visible during typing.
 * - Skips the network request if the debounced query is shorter than `minChars`
 *   AND `alwaysFetch` is false (UI can choose to show an empty hint instead).
 */
export function useSiswaSearch(
  query: string,
  opts: { enabled?: boolean; limit?: number; minChars?: number; alwaysFetch?: boolean } = {},
) {
  const { enabled = true, limit = 20, minChars = 1, alwaysFetch = false } = opts;
  const debounced = useDebounce(query.trim(), 250);
  const shouldFetch = enabled && (alwaysFetch || debounced.length >= minChars);

  return useQuery({
    queryKey: ['siswa', 'search', debounced, limit],
    queryFn: async () => {
      const data = await apiFetch<SiswaSearchItem[]>('/api/v1/siswa', {
        searchParams: { search: debounced, limit },
      });
      return data;
    },
    enabled: shouldFetch,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
