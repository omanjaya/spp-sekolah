'use client';

import { Suspense, useState, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Download, Filter, FileSpreadsheet, Loader2, Search, Paperclip, FileCheck, X, ExternalLink, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';

import { PageHeader } from '@/components/layouts/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePembayaranList } from '@/hooks/use-pembayaran';
import { useTahunAjaranList } from '@/hooks/use-tahun-ajaran';
import type { PembayaranDto } from '@/services/pembayaran.service';
import { useDebounce } from '@/hooks/use-debounce';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const MONTHS_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des',
];

function StatusBadge({ status }: { status: string }) {
  if (status === 'DIBATALKAN') {
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-600">
        Dibatalkan
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="border-green-200 bg-green-50 text-green-600">
      Terbayar
    </Badge>
  );
}

// ─── Upload Bukti Dialog ────────────────────────────────────────────────────

interface UploadBuktiDialogProps {
  pembayaran: PembayaranDto | null;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function UploadBuktiDialog({ pembayaran, open, onClose, onSuccess }: UploadBuktiDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!pembayaran) return null;

  const hasBukti = !!pembayaran.buktiUrl;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  async function handleUpload() {
    if (!selectedFile || !pembayaran) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', selectedFile);
      const res = await fetch(`/api/v1/pembayaran/${pembayaran.id}/upload-bukti`, {
        method: 'POST',
        body: fd,
        credentials: 'include',
      });
      const json = await res.json() as { success: boolean; error?: { message: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? `Gagal upload (${res.status})`);
      }
      toast.success('Bukti berhasil diunggah.');
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal mengunggah bukti.');
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete() {
    if (!pembayaran) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/pembayaran/${pembayaran.id}/upload-bukti`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const json = await res.json() as { success: boolean; error?: { message: string } };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.message ?? `Gagal hapus (${res.status})`);
      }
      toast.success('Bukti berhasil dihapus.');
      onSuccess();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal menghapus bukti.');
    } finally {
      setDeleting(false);
    }
  }

  const isLoading = uploading || deleting;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !isLoading) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Bukti Bayar</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          {/* Siswa info */}
          <div className="rounded-md bg-slate-50 px-3 py-2 text-sm">
            <div className="font-medium text-slate-800">{pembayaran.siswa?.nama ?? '—'}</div>
            <div className="font-mono text-xs text-slate-500">
              {pembayaran.siswa?.nis ?? '—'} &middot; {MONTHS_ID[pembayaran.periodMonth - 1]} {pembayaran.periodYear}
            </div>
          </div>

          {/* Existing bukti */}
          {hasBukti && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-green-700">
                  <FileCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="font-medium">Bukti sudah ada</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    asChild
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-green-700 hover:bg-green-100"
                  >
                    <a
                      href={`/api/v1/pembayaran/${pembayaran.id}/bukti`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      Lihat
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs text-red-600 hover:bg-red-50"
                    onClick={handleDelete}
                    disabled={isLoading}
                  >
                    {deleting ? (
                      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                    ) : (
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                    )}
                    Hapus
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Upload new file */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">
              {hasBukti ? 'Ganti Bukti' : 'Upload Bukti'}
            </Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              onChange={handleFileChange}
              disabled={isLoading}
              className="cursor-pointer text-sm"
            />
            <p className="text-xs text-slate-500">
              Format: JPEG, PNG, WebP, atau PDF. Maks. 5 MB.
            </p>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} disabled={isLoading}>
              Batal
            </Button>
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={!selectedFile || isLoading}
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
                  Mengunggah...
                </>
              ) : (
                <>
                  <Paperclip className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Upload
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Pembayaran Table ───────────────────────────────────────────────────────

function PembayaranTable({
  items,
  isLoading,
  onUploadBukti,
}: {
  items: PembayaranDto[];
  isLoading: boolean;
  onUploadBukti: (p: PembayaranDto) => void;
}) {
  if (isLoading) {
    return <p className="py-10 text-center text-sm text-slate-400">Memuat...</p>;
  }
  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">Tidak ada data.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
            <th className="pb-2 pr-4">NIS / Nama</th>
            <th className="pb-2 pr-4">Periode</th>
            <th className="pb-2 pr-4 text-right">Jumlah</th>
            <th className="pb-2 pr-4">Tanggal</th>
            <th className="pb-2 pr-4">No Bukti</th>
            <th className="pb-2 pr-4">Source</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2">Bukti</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {items.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="py-2.5 pr-4">
                <div className="font-medium text-slate-900">{p.siswa?.nama ?? '—'}</div>
                <div className="font-mono text-xs text-slate-400">{p.siswa?.nis ?? '—'}</div>
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs">
                {MONTHS_ID[p.periodMonth - 1]} {p.periodYear}
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-xs">
                {rupiahFormatter.format(p.amount)}
              </td>
              <td className="py-2.5 pr-4 text-xs text-slate-600">
                {new Date(p.tanggalTransaksi).toLocaleDateString('id-ID')}
              </td>
              <td className="py-2.5 pr-4 font-mono text-xs text-slate-500">
                {p.noBukti ?? '—'}
              </td>
              <td className="py-2.5 pr-4 text-xs text-slate-500">{p.source}</td>
              <td className="py-2.5 pr-4">
                <StatusBadge status={p.statusBayar} />
              </td>
              <td className="py-2.5">
                <button
                  type="button"
                  onClick={() => onUploadBukti(p)}
                  title={p.buktiUrl ? 'Lihat / Ganti Bukti' : 'Upload Bukti'}
                  className="inline-flex items-center justify-center rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                >
                  {p.buktiUrl ? (
                    <FileCheck className="h-4 w-4 text-green-600" aria-hidden="true" />
                  ) : (
                    <Paperclip className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">
                    {p.buktiUrl ? 'Lihat bukti' : 'Upload bukti'}
                  </span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Page Content ───────────────────────────────────────────────────────────

function PembayaranContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Upload bukti dialog state
  const [buktiTarget, setBuktiTarget] = useState<PembayaranDto | null>(null);
  const [buktiDialogOpen, setBuktiDialogOpen] = useState(false);

  const statusParam = searchParams.get('status') ?? '';
  const yearParam = searchParams.get('year') ?? '';
  const monthParam = searchParams.get('month') ?? '';
  const tahunAjaranId = searchParams.get('tahunAjaranId') ?? '';

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setPage(1);
  }

  const { data: tahunAjaranList = [] } = useTahunAjaranList();

  const filter = {
    q: debouncedSearch.trim() || undefined,
    status: (statusParam as 'TERBAYAR' | 'DIBATALKAN') || undefined,
    year: yearParam ? Number(yearParam) : undefined,
    month: monthParam ? Number(monthParam) : undefined,
    tahunAjaranId: tahunAjaranId || undefined,
    page,
    limit: 50,
    sortBy: 'tanggalTransaksi',
    sortOrder: 'desc' as const,
  };

  const { data, isLoading, isFetching } = usePembayaranList(filter);
  const items = data?.items ?? [];
  const meta = data?.meta;

  const years = Array.from({ length: 8 }, (_, i) => 2020 + i);

  async function handleExportExcel() {
    if (exporting) return;
    setExporting(true);
    try {
      const qs = new URLSearchParams();
      if (debouncedSearch.trim()) qs.set('q', debouncedSearch.trim());
      if (statusParam) qs.set('statusBayar', statusParam);
      if (yearParam) qs.set('periodYear', yearParam);
      if (monthParam) qs.set('periodMonth', monthParam);
      if (tahunAjaranId) qs.set('tahunAjaranId', tahunAjaranId);

      const res = await fetch(`/api/v1/pembayaran/export-excel?${qs.toString()}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        throw new Error(`Gagal export (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Pembayaran_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('File Excel berhasil diunduh.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal export Excel.');
    } finally {
      setExporting(false);
    }
  }

  function handleOpenBukti(p: PembayaranDto) {
    setBuktiTarget(p);
    setBuktiDialogOpen(true);
  }

  function handleCloseBukti() {
    setBuktiDialogOpen(false);
    setBuktiTarget(null);
  }

  function handleBuktiSuccess() {
    // Invalidate the pembayaran list so buktiUrl reflects the new state
    void queryClient.invalidateQueries({ queryKey: ['pembayaran'] });
  }

  const hasFilters = !!debouncedSearch || !!statusParam || !!yearParam || !!monthParam || !!tahunAjaranId;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Data Pembayaran"
        description={`${meta?.total?.toLocaleString('id-ID') ?? '—'} transaksi`}
        actions={
          <Button
            size="sm"
            onClick={handleExportExcel}
            disabled={exporting || items.length === 0}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
            )}
            Export Excel
          </Button>
        }
      />

      {/* Filters */}
      <Card className="border-slate-200">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Filter</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            {/* Search */}
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <Input
                className="pl-9"
                placeholder="Cari NIS, nama, no bukti..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Tahun Ajaran */}
            <div className="space-y-1 min-w-[160px]">
              <Label className="text-xs">Tahun Ajaran</Label>
              <Select value={tahunAjaranId} onValueChange={(v) => setFilter('tahunAjaranId', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua</SelectItem>
                  {tahunAjaranList.map((ta) => (
                    <SelectItem key={ta.id} value={ta.id}>
                      {ta.kode}
                      {ta.isActive && ' (aktif)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tahun */}
            <div className="space-y-1 min-w-[100px]">
              <Label className="text-xs">Tahun</Label>
              <Select value={yearParam} onValueChange={(v) => setFilter('year', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua</SelectItem>
                  {years.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Bulan */}
            <div className="space-y-1 min-w-[110px]">
              <Label className="text-xs">Bulan</Label>
              <Select value={monthParam} onValueChange={(v) => setFilter('month', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua</SelectItem>
                  {MONTHS_ID.map((m, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-1 min-w-[130px]">
              <Label className="text-xs">Status</Label>
              <Select value={statusParam} onValueChange={(v) => setFilter('status', v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Semua" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Semua</SelectItem>
                  <SelectItem value="TERBAYAR">Terbayar</SelectItem>
                  <SelectItem value="DIBATALKAN">Dibatalkan</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSearch('');
                  router.replace(pathname, { scroll: false });
                  setPage(1);
                }}
              >
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base font-semibold">
            Data ({items.length}
            {meta && meta.total > items.length ? ` dari ${meta.total.toLocaleString('id-ID')}` : ''})
          </CardTitle>
          {isFetching && !isLoading && (
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" />
          )}
        </CardHeader>
        <CardContent>
          <PembayaranTable
            items={items}
            isLoading={isLoading}
            onUploadBukti={handleOpenBukti}
          />

          {/* Pagination */}
          {meta && meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-slate-500">
                Hal. {meta.page} / {meta.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={meta.page <= 1}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  disabled={meta.page >= meta.totalPages}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload Bukti Dialog */}
      <UploadBuktiDialog
        pembayaran={buktiTarget}
        open={buktiDialogOpen}
        onClose={handleCloseBukti}
        onSuccess={handleBuktiSuccess}
      />
    </div>
  );
}

export default function PembayaranPage() {
  return (
    <Suspense>
      <PembayaranContent />
    </Suspense>
  );
}
