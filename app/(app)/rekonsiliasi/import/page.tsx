'use client';

import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileWarning,
  Loader2,
  ShieldAlert,
  ShieldQuestion,
  Upload,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExcelUploader } from '@/components/uploaders/excel-uploader';
import {
  ImportPreviewTable,
  type SelectionState,
} from '@/components/tables/import-preview-table';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { useConfirmImport, usePreviewExcel } from '@/hooks/use-import';
import { HttpError } from '@/lib/http';
import type { ImportAction, ImportSelection } from '@/lib/validators/import.schema';
import type { PreviewResult } from '@/services/import.service';

const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

function defaultSelections(preview: PreviewResult): SelectionState {
  const out: SelectionState = {};
  for (const r of preview.rows) {
    // Auto-select Baru + Duplikat Periode (default action = roll-forward)
    // to ensure double-pays automatically flow to next unpaid month.
    const autoSelect = r.status === 'BARU' || r.status === 'DUPLIKAT_PERIODE';
    out[r.rowIndex] = {
      selected: autoSelect,
      action: r.defaultAction,
    };
  }
  return out;
}

export default function ImportPembayaranPage() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [selections, setSelections] = useState<SelectionState>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const previewMut = usePreviewExcel();
  const confirmMut = useConfirmImport();

  async function runPreview() {
    if (!file) {
      toast.error('Pilih file Excel dulu.');
      return;
    }
    try {
      const res = await previewMut.mutateAsync(file);
      setPreview(res);
      setSelections(defaultSelections(res));
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      toast.error(err instanceof HttpError ? err.message : 'Gagal memproses file.');
    }
  }

  function reset() {
    setPreview(null);
    setSelections({});
    setFile(null);
  }

  const summary = useMemo(() => {
    if (!preview)
      return {
        totalSelected: 0,
        totalAmount: 0,
        byAction: { import: 0, replace: 0, roll_forward: 0, create_siswa: 0, skip: 0 },
        unselectedByStatus: {
          BARU: 0,
          DUPLIKAT_NO_BUKTI: 0,
          DUPLIKAT_PERIODE: 0,
          NIS_TIDAK_DIKENAL: 0,
          INVALID: 0,
        },
      };
    let totalSelected = 0;
    let totalAmount = 0;
    const byAction: Record<ImportAction, number> = {
      import: 0,
      replace: 0,
      roll_forward: 0,
      create_siswa: 0,
      skip: 0,
    };
    const unselectedByStatus: Record<string, number> = {
      BARU: 0,
      DUPLIKAT_NO_BUKTI: 0,
      DUPLIKAT_PERIODE: 0,
      NIS_TIDAK_DIKENAL: 0,
      INVALID: 0,
    };
    for (const r of preview.rows) {
      const sel = selections[r.rowIndex];
      if (sel?.selected) {
        totalSelected += 1;
        byAction[sel.action] += 1;
        if (sel.action !== 'skip') totalAmount += r.amount;
      } else {
        unselectedByStatus[r.status] = (unselectedByStatus[r.status] ?? 0) + 1;
      }
    }
    return { totalSelected, totalAmount, byAction, unselectedByStatus };
  }, [preview, selections]);

  async function onConfirm() {
    if (!preview) return;
    const selectionsPayload: ImportSelection[] = Object.entries(selections)
      .filter(([, s]) => s.selected)
      .map(([rowIndex, s]) => ({ rowIndex: Number(rowIndex), action: s.action }));

    if (selectionsPayload.length === 0) {
      toast.error('Tidak ada baris yang dipilih.');
      return;
    }

    try {
      const res = await confirmMut.mutateAsync({
        batchId: preview.batchId,
        selections: selectionsPayload,
      });
      toast.success(
        `Import selesai: ${res.success} baru, ${res.rolledForward ?? 0} dipindah ke bulan berikutnya, ${res.replaced} diganti, ${res.skipped} dilewati${
          res.errors.length > 0 ? `, ${res.errors.length} error` : ''
        }.`,
      );
      setConfirmOpen(false);
      reset();
    } catch (err) {
      setConfirmOpen(false);
      toast.error(err instanceof HttpError ? err.message : 'Gagal menyimpan import.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import Pembayaran"
        description="Upload file Excel rekonsiliasi dari asik.bpdbali. Sistem akan deteksi duplikat sebelum commit."
      />

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Unggah File
          </CardTitle>
          <CardDescription>
            Sheet yang dibaca: <span className="font-medium">Report Transaksi</span>. Ukuran maksimum 10 MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ExcelUploader file={file} onChange={setFile} disabled={previewMut.isPending} />
          <div className="flex items-center justify-end gap-2">
            {preview ? (
              <Button variant="outline" onClick={reset} disabled={confirmMut.isPending}>
                Reset
              </Button>
            ) : null}
            <Button onClick={runPreview} disabled={!file || previewMut.isPending}>
              {previewMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Analisis File
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview ? (
        <div ref={previewRef}>
          {preview.alreadyImported ? (
            <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <ShieldAlert className="mt-0.5 h-5 w-5" aria-hidden="true" />
              <div>
                <p className="font-medium">File ini sudah pernah diimport.</p>
                <p className="text-amber-800">
                  Batch sebelumnya: <span className="font-mono">{preview.alreadyImported.batchId}</span> pada{' '}
                  {new Date(preview.alreadyImported.at).toLocaleString('id-ID')}. Anda masih bisa lanjut bila
                  ada perbaikan — duplikat akan otomatis di-skip.
                </p>
              </div>
            </div>
          ) : null}

          {preview.parseErrors.length > 0 ? (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-red-50 p-4 text-sm text-red-900">
              <AlertTriangle className="mt-0.5 h-5 w-5" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-medium">Masalah saat membaca file:</p>
                <ul className="list-disc pl-4 text-xs">
                  {preview.parseErrors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSpreadsheet className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Preview
              </CardTitle>
              <CardDescription>
                {nf.format(preview.totalRows)} baris dari sheet{' '}
                <span className="font-medium">{preview.sheetName ?? '—'}</span>. Hash:{' '}
                <span className="font-mono text-xs">{preview.fileHash.slice(0, 12)}…</span>
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

          <div className="grid gap-4 lg:grid-cols-5">
            {/* Detection card — all 5 statuses */}
            <Card className="border-slate-200 lg:col-span-3">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileSpreadsheet className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Deteksi per Status
                </CardTitle>
                <CardDescription>
                  Total {nf.format(preview.totalRows)} baris diklasifikasi ke 5 kategori berdasarkan data yang sudah ada.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-slate-100 text-sm">
                  <StatusRow
                    icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                    label="Baru"
                    description="NIS dikenal, periode belum pernah dibayar, bukti unik"
                    count={preview.counts.BARU}
                    color="emerald"
                  />
                  <StatusRow
                    icon={<FileWarning className="h-4 w-4 text-slate-500" aria-hidden="true" />}
                    label="Duplikat No. Bukti"
                    description="No. bukti sudah pernah tercatat — otomatis dilewati"
                    count={preview.counts.DUPLIKAT_NO_BUKTI}
                    color="slate"
                    autoSkip
                  />
                  <StatusRow
                    icon={<AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />}
                    label="Duplikat Periode"
                    description="Siswa sudah ada pembayaran untuk periode yang sama (beda bukti) — pilih Lewati atau Ganti"
                    count={preview.counts.DUPLIKAT_PERIODE}
                    color="amber"
                  />
                  <StatusRow
                    icon={<ShieldQuestion className="h-4 w-4 text-amber-600" aria-hidden="true" />}
                    label="NIS Tidak Dikenal"
                    description="NIS belum ada di master siswa — pilih Buat siswa atau Lewati"
                    count={preview.counts.NIS_TIDAK_DIKENAL}
                    color="amber"
                  />
                  <StatusRow
                    icon={<XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />}
                    label="Invalid"
                    description="Data rusak / field wajib kosong — tidak bisa diimport"
                    count={preview.counts.INVALID}
                    color="red"
                    autoSkip
                  />
                </ul>
              </CardContent>
            </Card>

            {/* Action summary + Commit card */}
            <Card className="border-slate-200 lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CheckCircle2 className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Aksi yang Dipilih
                </CardTitle>
                <CardDescription>
                  Transactional — semua-atau-rollback.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <ActionRow
                  icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />}
                  label="Import baru"
                  count={summary.byAction.import}
                />
                <ActionRow
                  icon={<AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />}
                  label="Pindah ke bulan berikutnya"
                  count={summary.byAction.roll_forward}
                />
                <ActionRow
                  icon={<AlertTriangle className="h-4 w-4 text-orange-600" aria-hidden="true" />}
                  label="Ganti pembayaran lama"
                  count={summary.byAction.replace}
                />
                <ActionRow
                  icon={<UserPlus className="h-4 w-4 text-sky-600" aria-hidden="true" />}
                  label="Buat siswa baru + import"
                  count={summary.byAction.create_siswa}
                />

                <div className="space-y-2 border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Total dipilih</span>
                    <span className="font-mono font-semibold">
                      {nf.format(summary.totalSelected)} baris
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Nominal akan masuk</span>
                    <span className="font-mono text-base font-semibold text-emerald-700">
                      Rp {nf.format(summary.totalAmount)}
                    </span>
                  </div>
                </div>

                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={summary.totalSelected === 0 || confirmMut.isPending}
                  className="w-full"
                >
                  {confirmMut.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : null}
                  Import Sekarang
                </Button>
              </CardContent>
            </Card>
          </div>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Konfirmasi import pembayaran"
            description={
              <span>
                {nf.format(summary.totalSelected)} baris akan diproses. Total nominal{' '}
                <span className="font-semibold">Rp {nf.format(summary.totalAmount)}</span>. Lanjutkan?
              </span>
            }
            confirmLabel="Ya, import"
            onConfirm={onConfirm}
            isLoading={confirmMut.isPending}
          />
        </div>
      ) : null}
    </div>
  );
}

interface StatusRowProps {
  icon: React.ReactNode;
  label: string;
  description: string;
  count: number;
  color: 'emerald' | 'amber' | 'red' | 'slate';
  autoSkip?: boolean;
}

function StatusRow({ icon, label, description, count, color, autoSkip }: StatusRowProps) {
  const dim = count === 0;
  const countClass = {
    emerald: 'text-emerald-700',
    amber: 'text-amber-700',
    red: 'text-red-700',
    slate: 'text-slate-700',
  }[color];
  return (
    <li className={`flex items-start gap-3 py-2.5 ${dim ? 'opacity-60' : ''}`}>
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{label}</span>
          {autoSkip ? (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600">
              Auto-skip
            </span>
          ) : null}
        </div>
        <p className="text-xs leading-snug text-slate-500">{description}</p>
      </div>
      <div className="text-right">
        <div className={`font-mono text-lg font-semibold tabular-nums ${countClass}`}>
          {nf.format(count)}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-slate-400">baris</div>
      </div>
    </li>
  );
}

interface ActionRowProps {
  icon: React.ReactNode;
  label: string;
  count: number;
}

function ActionRow({ icon, label, count }: ActionRowProps) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-slate-700">{label}</span>
      </div>
      <span className="font-mono font-semibold tabular-nums text-slate-900">{nf.format(count)}</span>
    </div>
  );
}
