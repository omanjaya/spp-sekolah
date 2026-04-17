'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiUpload } from '@/lib/http';

// ---------- Types ----------------------------------------------------------

export type NaikKelasStatus =
  | 'MATCH'
  | 'NAMA_BEDA'
  | 'NIS_TIDAK_DIKENAL'
  | 'SUDAH_ASSIGN';

export type NaikKelasAction =
  | 'assign'
  | 'skip'
  | 'pakai_db'
  | 'pakai_excel'
  | 'buat_baru';

export interface AnalyzedRow {
  rowIndex: number;
  nis: string;
  namaExcel: string;
  namaDb?: string;
  siswaId?: string;
  rombelKodeAsal?: string;
  rombelKodeTujuan: string;
  status: NaikKelasStatus;
  rombelBaru: boolean;
  defaultAction: NaikKelasAction;
}

export interface TidakTerassignItem {
  nis: string;
  nama: string;
}

export interface NaikKelasPreviewCounts {
  MATCH: number;
  NAMA_BEDA: number;
  NIS_TIDAK_DIKENAL: number;
  SUDAH_ASSIGN: number;
}

export interface NaikKelasPreviewResult {
  batchId: string;
  fileName: string;
  totalRows: number;
  rows: AnalyzedRow[];
  counts: NaikKelasPreviewCounts;
  tidakTerassign: TidakTerassignItem[];
}

export interface NaikKelasSelection {
  rowIndex: number;
  action: NaikKelasAction;
}

export interface NaikKelasConfirmInput {
  batchId: string;
  tahunAjaranId: string;
  selections: NaikKelasSelection[];
}

export interface NaikKelasConfirmResult {
  assigned: number;
  skipped: number;
  namaUpdated: number;
  siswaCreated: number;
  errors: Array<{ rowIndex: number; message: string }>;
}

// ---------- Hooks ----------------------------------------------------------

export function usePreviewNaikKelas() {
  return useMutation({
    mutationFn: ({ file, tahunAjaranId }: { file: File; tahunAjaranId: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('tahunAjaranId', tahunAjaranId);
      return apiUpload<NaikKelasPreviewResult>('/api/v1/naik-kelas/preview', fd);
    },
  });
}

export function useConfirmNaikKelas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NaikKelasConfirmInput) =>
      apiFetch<NaikKelasConfirmResult>('/api/v1/naik-kelas/confirm', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['siswa'] });
      void qc.invalidateQueries({ queryKey: ['rombel'] });
    },
  });
}
