'use client';

import { Clipboard, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  ImportPreviewTable,
  type SelectionState,
} from '@/components/tables/import-preview-table';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { useConfirmImport, usePreviewPaste } from '@/hooks/use-import';
import { HttpError } from '@/lib/http';
import type { ImportSelection } from '@/lib/validators/import.schema';
import type { PreviewResult } from '@/services/import.service';

const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

function defaultSelections(preview: PreviewResult): SelectionState {
  const out: SelectionState = {};
  for (const r of preview.rows) {
    out[r.rowIndex] = { selected: r.status === 'BARU', action: r.defaultAction };
  }
  return out;
}

export default function PastePembayaranPage() {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selections, setSelections] = useState<SelectionState>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  const previewMut = usePreviewPaste();
  const confirmMut = useConfirmImport();

  async function runPreview() {
    if (!text.trim()) {
      toast.error('Paste teks TSV dulu.');
      return;
    }
    try {
      const res = await previewMut.mutateAsync({ text });
      setPreview(res);
      setSelections(defaultSelections(res));
    } catch (err) {
      toast.error(err instanceof HttpError ? err.message : 'Gagal memproses teks.');
    }
  }

  function reset() {
    setPreview(null);
    setSelections({});
    setText('');
  }

  const summary = useMemo(() => {
    if (!preview) return { count: 0, total: 0 };
    let count = 0;
    let total = 0;
    for (const r of preview.rows) {
      const s = selections[r.rowIndex];
      if (!s?.selected) continue;
      count += 1;
      if (s.action !== 'skip') total += r.amount;
    }
    return { count, total };
  }, [preview, selections]);

  async function onConfirm() {
    if (!preview) return;
    const payload: ImportSelection[] = Object.entries(selections)
      .filter(([, s]) => s.selected)
      .map(([rowIndex, s]) => ({ rowIndex: Number(rowIndex), action: s.action }));
    if (payload.length === 0) {
      toast.error('Tidak ada baris yang dipilih.');
      return;
    }
    try {
      const res = await confirmMut.mutateAsync({ batchId: preview.batchId, selections: payload });
      toast.success(`Selesai: ${res.success} baru, ${res.replaced} diganti, ${res.skipped} dilewati.`);
      setConfirmOpen(false);
      reset();
    } catch (err) {
      setConfirmOpen(false);
      toast.error(err instanceof HttpError ? err.message : 'Gagal import.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Paste dari Spreadsheet"
        description="Tempel teks TSV hasil copy dari Google Sheets / Excel. Kolom: NIS, Nama, Periode (YYYY-MM), Amount, Tanggal, NoBukti."
      />

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clipboard className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Teks Paste
          </CardTitle>
          <CardDescription>
            Header opsional. Pemisah tab/semicolon didukung. Maksimum 500.000 karakter.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label htmlFor="paste-tsv" className="sr-only">
            Teks TSV untuk diimpor
          </label>
          <Textarea
            id="paste-tsv"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={10}
            className="font-mono text-xs"
            placeholder={'NIS\tNama\tPeriode\tAmount\tTanggal\tNoBukti\n12345\tBudi\t2025-07\t350000\t01/07/2025\tXYZ001'}
          />
          <div className="flex justify-end gap-2">
            {preview ? (
              <Button variant="outline" onClick={reset} disabled={confirmMut.isPending}>
                Reset
              </Button>
            ) : null}
            <Button onClick={runPreview} disabled={previewMut.isPending || !text.trim()} aria-label="Analisis teks TSV yang ditempel">
              {previewMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Analisis
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview ? (
        <>
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Pratinjau</CardTitle>
              <CardDescription>
                {nf.format(preview.totalRows)} baris terdeteksi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImportPreviewTable
                rows={preview.rows}
                counts={preview.counts}
                selections={selections}
                onSelectionsChange={setSelections}
              />
            </CardContent>
          </Card>

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Ringkasan</CardTitle>
            </CardHeader>
            <CardContent className="flex items-end justify-between">
              <div>
                <p className="text-xs text-slate-500">Dipilih</p>
                <p className="font-mono text-lg font-semibold">{nf.format(summary.count)}</p>
                <p className="mt-2 text-xs text-slate-500">Total</p>
                <p className="font-mono text-lg font-semibold text-emerald-700">
                  Rp {nf.format(summary.total)}
                </p>
              </div>
              <Button
                onClick={() => setConfirmOpen(true)}
                disabled={summary.count === 0 || confirmMut.isPending}
              >
                Import
              </Button>
            </CardContent>
          </Card>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Konfirmasi import paste"
            description={`${nf.format(summary.count)} baris, Rp ${nf.format(summary.total)}. Lanjutkan?`}
            confirmLabel="Ya, import"
            onConfirm={onConfirm}
            isLoading={confirmMut.isPending}
          />
        </>
      ) : null}
    </div>
  );
}
