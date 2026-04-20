'use client';

import { useState, useMemo } from 'react';
import {
  FileText,
  Plus,
  Printer,
  Search,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { EmptyState } from '@/components/feedback/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { useDebounce } from '@/hooks/use-debounce';
import { useSiswaSearch } from '@/hooks/use-siswa-search';
import {
  useKwitansiList,
  useCreateKwitansi,
  useDeleteKwitansi,
  openKwitansiPdf,
} from '@/hooks/use-kwitansi';
import type { KwitansiDto } from '@/services/kwitansi.service';
import type { KwitansiCreateInput } from '@/lib/validators/kwitansi.schema';

// ─── Formatters ──────────────────────────────────────────────────────────────

const rupiahFmt = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

const MONTH_NAMES_FULL = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Create Dialog ───────────────────────────────────────────────────────────

interface SelectedMonth {
  year: number;
  month: number;
  amount: number;
  keterangan: string;
  pembayaranId?: string;
}

const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;

function CreateKwitansiDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [siswaQuery, setSiswaQuery] = useState('');
  const [selectedSiswaId, setSelectedSiswaId] = useState<string | null>(null);
  const [selectedSiswa, setSelectedSiswa] = useState<{
    id: string; nis: string; nama: string; angkatan: number;
  } | null>(null);

  // bulan yang dipilih
  const [selectedMonths, setSelectedMonths] = useState<SelectedMonth[]>([]);
  const [addYear, setAddYear]   = useState(CURRENT_YEAR);
  const [addMonth, setAddMonth] = useState(CURRENT_MONTH);
  const [addAmount, setAddAmount] = useState('350000');
  const [addKet, setAddKet]   = useState('');

  const [namaOrangTua, setNamaOrangTua] = useState('');
  const [catatan, setCatatan]           = useState('');
  const [tanggal, setTanggal]           = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [biayaAdm, setBiayaAdm] = useState('0');

  const { data: siswaResults, isFetching: siswaLoading } = useSiswaSearch(siswaQuery, {
    enabled: open && siswaQuery.length >= 1,
  });

  const { mutateAsync: create, isPending } = useCreateKwitansi();

  function reset() {
    setSiswaQuery('');
    setSelectedSiswaId(null);
    setSelectedSiswa(null);
    setSelectedMonths([]);
    setAddYear(CURRENT_YEAR);
    setAddMonth(CURRENT_MONTH);
    setAddAmount('350000');
    setAddKet('');
    setNamaOrangTua('');
    setCatatan('');
    setTanggal(new Date().toISOString().slice(0, 10));
    setBiayaAdm('0');
  }

  function handleClose() {
    reset();
    onOpenChange(false);
  }

  function handleAddMonth() {
    const y = Number(addYear);
    const m = Number(addMonth);
    const a = Number(addAmount);
    if (!y || !m || isNaN(a) || a < 0) {
      toast.error('Isi tahun, bulan, dan nominal dengan benar.');
      return;
    }
    const exists = selectedMonths.some((s) => s.year === y && s.month === m);
    if (exists) {
      toast.error(`${MONTH_NAMES_FULL[m]} ${y} sudah ada.`);
      return;
    }
    setSelectedMonths((prev) => [...prev, { year: y, month: m, amount: a, keterangan: addKet }]);
    // advance month for convenience
    if (m === 12) { setAddYear(y + 1); setAddMonth(1); }
    else setAddMonth(m + 1);
    setAddKet('');
  }

  function removeMonth(year: number, month: number) {
    setSelectedMonths((prev) => prev.filter((s) => !(s.year === year && s.month === month)));
  }

  const total = useMemo(
    () => selectedMonths.reduce((s, m) => s + m.amount, 0) + (Number(biayaAdm) || 0),
    [selectedMonths, biayaAdm],
  );

  async function handleSubmit() {
    if (!selectedSiswaId) { toast.error('Pilih siswa terlebih dahulu.'); return; }
    if (selectedMonths.length === 0) { toast.error('Pilih minimal 1 bulan.'); return; }

    const payload: KwitansiCreateInput = {
      siswaId:      selectedSiswaId,
      tanggal:      new Date(tanggal),
      namaOrangTua: namaOrangTua || undefined,
      catatan:      catatan || undefined,
      biayaAdm:     Number(biayaAdm) || 0,
      items: selectedMonths.map((m) => ({
        periodYear:  m.year,
        periodMonth: m.month,
        amount:      m.amount,
        keterangan:  m.keterangan || undefined,
      })),
    };

    try {
      const kwitansi = await create(payload);
      toast.success(`Kwitansi ${kwitansi.nomorKwitansi} berhasil dibuat.`);
      handleClose();
      // otomatis buka PDF di tab baru
      openKwitansiPdf(kwitansi.id);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal membuat kwitansi.';
      toast.error(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Buat Kwitansi Baru</DialogTitle>
          <DialogDescription>
            Isi data pembayaran, pilih bulan-bulan yang dibayar, lalu simpan. PDF akan otomatis
            terbuka di tab baru.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* ── siswa picker ── */}
          <div className="space-y-1.5">
            <Label>Siswa</Label>
            {selectedSiswa ? (
              <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold">{selectedSiswa.nama}</p>
                  <p className="text-xs text-slate-500">NIS: {selectedSiswa.nis} · Angkatan {selectedSiswa.angkatan}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setSelectedSiswa(null); setSelectedSiswaId(null); setSiswaQuery(''); }}
                >
                  Ganti
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  placeholder="Cari nama atau NIS siswa…"
                  value={siswaQuery}
                  onChange={(e) => setSiswaQuery(e.target.value)}
                  autoComplete="off"
                />
                {siswaQuery.length >= 1 && (
                  <div className="absolute z-50 mt-1 w-full rounded-md border border-slate-200 bg-white shadow-md">
                    {siswaLoading ? (
                      <div className="px-3 py-2 text-xs text-slate-500">Mencari…</div>
                    ) : !siswaResults || siswaResults.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-slate-500">Siswa tidak ditemukan.</div>
                    ) : (
                      <ul className="max-h-52 overflow-y-auto py-1">
                        {siswaResults.map((s) => (
                          <li key={s.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                              onClick={() => {
                                setSelectedSiswa(s);
                                setSelectedSiswaId(s.id);
                                setSiswaQuery('');
                              }}
                            >
                              <span className="font-medium">{s.nama}</span>
                              <span className="ml-2 text-xs text-slate-400">
                                {s.nis} · {s.angkatan}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── tanggal + nama orang tua ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tanggal">Tanggal Kwitansi</Label>
              <Input
                id="tanggal"
                type="date"
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nama-ortu">Nama Orang Tua / Wali</Label>
              <Input
                id="nama-ortu"
                placeholder="Nama yang membayar"
                value={namaOrangTua}
                onChange={(e) => setNamaOrangTua(e.target.value)}
              />
            </div>
          </div>

          {/* ── tambah bulan ── */}
          <div className="rounded-md border border-slate-200 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-600 uppercase tracking-wide">
              Tambah Bulan Pembayaran
            </p>
            <div className="grid grid-cols-4 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Tahun</Label>
                <Input
                  inputMode="numeric"
                  value={addYear}
                  onChange={(e) => setAddYear(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Bulan</Label>
                <Input
                  inputMode="numeric"
                  min={1}
                  max={12}
                  value={addMonth}
                  onChange={(e) => setAddMonth(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nominal (Rp)</Label>
                <Input
                  inputMode="numeric"
                  value={addAmount}
                  onChange={(e) => setAddAmount(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <Button size="sm" variant="secondary" className="w-full" onClick={handleAddMonth}>
                  + Tambah
                </Button>
              </div>
            </div>
            <div className="mt-2">
              <Input
                className="text-xs"
                placeholder="Keterangan (opsional)"
                value={addKet}
                onChange={(e) => setAddKet(e.target.value)}
              />
            </div>
          </div>

          {/* ── daftar bulan terpilih ── */}
          {selectedMonths.length > 0 && (
            <div className="overflow-x-auto rounded-md border border-slate-200 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60">
                    <TableHead>Periode</TableHead>
                    <TableHead>Keterangan</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedMonths.map((m) => (
                    <TableRow key={`${m.year}-${m.month}`}>
                      <TableCell className="font-medium">
                        {MONTH_NAMES_FULL[m.month]} {m.year}
                      </TableCell>
                      <TableCell className="text-slate-500 text-xs">
                        {m.keterangan || `SPP Komite ${MONTH_NAMES_FULL[m.month]} ${m.year}`}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {rupiahFmt.format(m.amount)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-slate-400 hover:text-red-600"
                          onClick={() => removeMonth(m.year, m.month)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── biaya adm + total ── */}
          <div className="grid grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <Label htmlFor="biaya-adm">Biaya Administrasi (Rp)</Label>
              <Input
                id="biaya-adm"
                inputMode="numeric"
                value={biayaAdm}
                onChange={(e) => setBiayaAdm(e.target.value)}
              />
            </div>
            <div className="rounded-md bg-slate-50 border border-slate-200 px-4 py-3 text-right">
              <p className="text-xs text-slate-500">Total</p>
              <p className="text-lg font-bold text-slate-900">{rupiahFmt.format(total)}</p>
            </div>
          </div>

          {/* ── catatan ── */}
          <div className="space-y-1.5">
            <Label htmlFor="catatan">Catatan (opsional)</Label>
            <Textarea
              id="catatan"
              placeholder="Catatan tambahan…"
              rows={2}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose} disabled={isPending}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? 'Menyimpan…' : 'Simpan & Cetak'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete Confirm ──────────────────────────────────────────────────────────

function DeleteConfirmDialog({
  kwitansi,
  onClose,
}: {
  kwitansi: KwitansiDto | null;
  onClose: () => void;
}) {
  const { mutateAsync: del, isPending } = useDeleteKwitansi();

  async function handleConfirm() {
    if (!kwitansi) return;
    try {
      await del(kwitansi.id);
      toast.success(`Kwitansi ${kwitansi.nomorKwitansi} dihapus.`);
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus.');
    }
  }

  return (
    <AlertDialog open={!!kwitansi} onOpenChange={(v: boolean) => { if (!v) onClose(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus kwitansi?</AlertDialogTitle>
          <AlertDialogDescription>
            Kwitansi <strong>{kwitansi?.nomorKwitansi}</strong> akan dihapus permanen.
            Data pembayaran terkait tidak ikut dihapus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Batal</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void handleConfirm()}
            disabled={isPending}
            className="bg-red-600 hover:bg-red-700"
          >
            {isPending ? 'Menghapus…' : 'Hapus'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function KwitansiPage() {
  const [search, setSearch] = useState('');
  const [page, setPage]     = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<KwitansiDto | null>(null);

  const debouncedSearch = useDebounce(search, 300);
  // reset ke halaman 1 saat search berubah
  const currentPage = debouncedSearch !== search ? 1 : page;

  const { data, isLoading } = useKwitansiList({
    q:     debouncedSearch || undefined,
    page:  currentPage,
    limit: 20,
  });

  return (
    <div className="space-y-4">
      <PageHeader
        title="Kwitansi"
        description="Buat dan cetak kwitansi pembayaran SPP Komite ukuran F4."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Buat Kwitansi
          </Button>
        }
      />

      {/* ── filter bar ── */}
      <Card className="border-slate-200">
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              className="pl-9"
              placeholder="Cari nomor, nama siswa, NIS…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── table ── */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Riwayat Kwitansi</CardTitle>
          {data && (
            <CardDescription>
              {data.meta.total} kwitansi ditemukan
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Belum ada kwitansi"
              description='Klik "Buat Kwitansi" untuk membuat kwitansi pertama.'
              action={
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Buat Kwitansi
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto overflow-hidden rounded-md border border-slate-200 bg-white">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/60">
                      <TableHead>No Kwitansi</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Siswa</TableHead>
                      <TableHead>Nama Pembayar</TableHead>
                      <TableHead className="text-center">Bulan</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Dibuat oleh</TableHead>
                      <TableHead className="text-center">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.items.map((k) => (
                      <TableRow key={k.id}>
                        <TableCell className="font-mono text-xs font-semibold text-slate-700">
                          {k.nomorKwitansi}
                        </TableCell>
                        <TableCell className="text-xs text-slate-600 whitespace-nowrap">
                          {fmtDate(k.tanggal)}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm font-medium">{k.siswa.nama}</p>
                          <p className="text-xs text-slate-500">{k.siswa.nis}</p>
                        </TableCell>
                        <TableCell className="text-sm text-slate-600">
                          {k.namaOrangTua ?? '—'}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary" className="font-mono text-xs">
                            {k.items.length} bln
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-sm font-semibold">
                          {rupiahFmt.format(k.totalAmount + k.biayaAdm)}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {k.createdBy.nama}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              title="Cetak PDF"
                              onClick={() => openKwitansiPdf(k.id)}
                            >
                              <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-red-600"
                              title="Hapus"
                              onClick={() => setDeleteTarget(k)}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* pagination */}
              {data.meta.totalPages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-slate-500">
                  <span>
                    Halaman {data.meta.page} dari {data.meta.totalPages}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.meta.page <= 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      ← Sebelumnya
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.meta.page >= data.meta.totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Berikutnya →
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── dialogs ── */}
      <CreateKwitansiDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteConfirmDialog
        kwitansi={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
