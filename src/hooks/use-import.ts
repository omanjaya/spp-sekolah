'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiFetch, apiUpload } from '@/lib/http';
import type { ImportConfirmInput } from '@/lib/validators/import.schema';
import type { PembayaranPasteInput } from '@/lib/validators/pembayaran.schema';
import type { PreviewResult } from '@/services/import.service';

export interface ImportConfirmResult {
  batchId: string;
  importBatchId: string;
  success: number;
  skipped: number;
  replaced: number;
  rolledForward: number;
  createdSiswa: number;
  errors: Array<{ rowIndex: number; message: string }>;
}

export interface ImportBatchRow {
  id: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  uploadedAt: string;
  uploadedBy: string;
  totalRows: number;
  successCount: number;
  duplicateCount: number;
  errorCount: number;
  status: string;
}

export function usePreviewExcel() {
  return useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return apiUpload<PreviewResult>('/api/v1/pembayaran/import/preview', fd);
    },
  });
}

export function usePreviewPaste() {
  return useMutation({
    mutationFn: (input: PembayaranPasteInput) =>
      apiFetch<PreviewResult>('/api/v1/pembayaran/paste', { method: 'POST', body: input }),
  });
}

export function useConfirmImport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ImportConfirmInput) =>
      apiFetch<ImportConfirmResult>('/api/v1/pembayaran/import/confirm', {
        method: 'POST',
        body: input,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pembayaran'] });
      void qc.invalidateQueries({ queryKey: ['import-batches'] });
    },
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ['import-batches'],
    queryFn: () => apiFetch<ImportBatchRow[]>('/api/v1/pembayaran/import-batches'),
  });
}
