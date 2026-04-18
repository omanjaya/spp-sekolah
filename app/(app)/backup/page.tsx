'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  HardDrive,
  Loader2,
  ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { apiFetch } from '@/lib/http';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BackupCounts {
  rowCounts:  Record<string, number>;
  totalRows:  number;
}

// ─── Table info ──────────────────────────────────────────────────────────────

const TABLE_LABELS: Record<string, { label: string; icon: string }> = {
  users:                 { label: 'Pengguna',              icon: '👤' },
  settings:              { label: 'Pengaturan Sistem',     icon: '⚙️' },
  tahunAjaran:           { label: 'Tahun Ajaran',          icon: '📅' },
  rombel:                { label: 'Rombel / Kelas',        icon: '🏫' },
  siswa:                 { label: 'Data Siswa',            icon: '👩‍🎓' },
  enrollment:            { label: 'Enrollment',            icon: '📋' },
  pembayaran:            { label: 'Pembayaran SPP',        icon: '💰' },
  keringanan:            { label: 'Keringanan',            icon: '🎖️' },
  pelunasan:             { label: 'Pelunasan',             icon: '✅' },
  kwitansi:              { label: 'Kwitansi',              icon: '🧾' },
  kwitansiItems:         { label: 'Item Kwitansi',         icon: '🧾' },
  importBatches:         { label: 'Riwayat Import',        icon: '📥' },
  tagihanBpdImportBatch: { label: 'Import Tagihan BPD',   icon: '🏦' },
  tagihanBpdMaster:      { label: 'Tagihan BPD Master',   icon: '🏦' },
  auditLog:              { label: 'Audit Log',             icon: '📜' },
};

const numberFmt = new Intl.NumberFormat('id-ID');

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function BackupPage() {
  const [isDownloading, setIsDownloading] = useState(false);

  const { data: countsData, isLoading, isError } = useQuery({
    queryKey: ['backup', 'counts'],
    queryFn: () => apiFetch<BackupCounts>('/api/v1/backup?countsOnly=true'),
    staleTime: 60_000,
  });

  // Estimasi ukuran: ~350 bytes/row uncompressed, ~1:6 gzip ratio for JSON
  const estimatedUncompressed = (countsData?.totalRows ?? 0) * 350;
  const estimatedCompressed   = Math.round(estimatedUncompressed / 6);

  async function handleDownload() {
    setIsDownloading(true);
    toast.info('Membuat backup… harap tunggu.');
    try {
      const res = await fetch('/api/v1/backup', { credentials: 'include' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);

      const blob  = await res.blob();
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement('a');
      const date  = new Date().toISOString().slice(0, 10);
      a.href      = url;
      a.download  = `spp_backup_${date}.json.gz`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Backup selesai! File: spp_backup_${date}.json.gz`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat backup.');
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Backup Data"
        description="Ekspor semua data sistem ke file JSON terkompresi (.json.gz)."
      />

      {/* ── Info Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Total Baris</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24 mt-1" />
              ) : (
                <p className="text-xl font-bold tabular-nums">
                  {numberFmt.format(countsData?.totalRows ?? 0)}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
              <FileJson className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Perkiraan Ukuran</p>
              {isLoading ? (
                <Skeleton className="h-6 w-24 mt-1" />
              ) : (
                <p className="text-xl font-bold tabular-nums">
                  {formatBytes(estimatedCompressed)}
                  <span className="ml-1 text-xs font-normal text-slate-400">
                    (gzip)
                  </span>
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <HardDrive className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Format File</p>
              <p className="text-xl font-bold">JSON + GZip</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Download Card ── */}
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Download Backup</CardTitle>
          </div>
          <CardDescription>
            Semua tabel diekspor ke satu file JSON terkompresi. Proses berlangsung di server
            dan di-stream langsung — tidak ada batas ukuran.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isError && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              Gagal memuat informasi backup. Periksa koneksi dan coba lagi.
            </div>
          )}

          <Button
            size="lg"
            onClick={() => void handleDownload()}
            disabled={isDownloading || isLoading}
            className="gap-2"
          >
            {isDownloading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Membuat backup…
              </>
            ) : (
              <>
                <Download className="h-4 w-4" aria-hidden="true" />
                Download Backup Sekarang
              </>
            )}
          </Button>

          <p className="text-xs text-slate-500">
            File: <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono">
              spp_backup_{new Date().toISOString().slice(0, 10)}.json.gz
            </code>
          </p>
        </CardContent>
      </Card>

      {/* ── Tabel per model ── */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Isi Backup</CardTitle>
          <CardDescription>Semua tabel berikut disertakan dalam file backup.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-slate-200">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Tabel
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Jumlah Baris
                    </th>
                    <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 hidden sm:table-cell">
                      Est. Ukuran
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Object.entries(countsData?.rowCounts ?? {}).map(([key, count]) => {
                    const info = TABLE_LABELS[key] ?? { label: key, icon: '📁' };
                    const estBytes = count * 350;
                    return (
                      <tr key={key} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5">
                          <span className="mr-2">{info.icon}</span>
                          <span className="font-medium text-slate-800">{info.label}</span>
                          <span className="ml-2 font-mono text-xs text-slate-400">{key}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-700">
                          {numberFmt.format(count)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-500 hidden sm:table-cell text-xs">
                          {formatBytes(estBytes)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="px-4 py-2.5 text-slate-800">Total</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-900">
                      {numberFmt.format(countsData?.totalRows ?? 0)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-slate-600 hidden sm:table-cell text-xs">
                      {formatBytes(estimatedUncompressed)} → {formatBytes(estimatedCompressed)} gzip
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Catatan keamanan ── */}
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="space-y-3 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            Catatan Keamanan & Penggunaan
          </div>
          <ul className="space-y-1.5 text-xs text-amber-700">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span><strong>Password tidak disertakan</strong> — hash password user sengaja dihilangkan. Setelah restore, semua user perlu reset password.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span><strong>File terenkripsi gzip</strong> — buka dengan WinRAR, 7-Zip, atau <code className="bg-amber-100 px-1 rounded">gunzip</code> di terminal.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span><strong>Simpan di tempat aman</strong> — file berisi data siswa, jangan upload ke storage publik.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span><strong>Backup rutin</strong> — lakukan backup minimal sekali seminggu, terutama setelah import data besar.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
