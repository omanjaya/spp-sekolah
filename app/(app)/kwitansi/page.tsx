'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  FileText,
  Plus,
  Printer,
  Search,
  Trash2,
  Pencil,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { EmptyState } from '@/components/feedback/empty-state';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { cn } from '@/lib/utils';

import { useDebounce } from '@/hooks/use-debounce';
import { useSiswaSearch, siswaKelas } from '@/hooks/use-siswa-search';
import {
  useKwitansiList,
  useCreateKwitansi,
  useUpdateKwitansi,
  useDeleteKwitansi,
  useSiswaMonths,
  openKwitansiPdf,
} from '@/hooks/use-kwitansi';
import type { KwitansiDto } from '@/services/kwitansi.service';
import type {
  KwitansiCreateInput,
  KwitansiUpdateInput,
  JenisKeringanan,
  KwitansiKategori,
} from '@/lib/validators/kwitansi.schema';

// ─── Formatters ──────────────────────────────────────────────────────────────

const rupiahFmt = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const MONTH_NAMES_FULL = [
  '', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];
const MONTH_NAMES_SHORT = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
];

const KERINGANAN_OPTIONS: Array<{ value: JenisKeringanan; label: string }> = [
  { value: 'JUARA',                label: 'Juara Lomba' },
  { value: 'OSN',                  label: 'OSN' },
  { value: 'JUARA_UMUM',           label: 'Juara Umum' },
  { value: 'BEASISWA',             label: 'Beasiswa' },
  { value: 'KELUARGA_TIDAK_MAMPU', label: 'Keluarga Tidak Mampu' },
  { value: 'PINDAHAN',             label: 'Pindahan' },
  { value: 'IJAZAH',               label: 'Ijazah' },
  { value: 'LAINNYA',              label: 'Lainnya' },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Create/Edit Dialog ──────────────────────────────────────────────────────

interface SelectedItem {
  year: number;
  month: number;
  amount: number;
  keterangan: string;
  kategori: KwitansiKategori;
  jenisKeringanan: JenisKeringanan | null;
  pembayaranId?: string;
}

const CURRENT_YEAR  = new Date().getFullYear();
const CURRENT_MONTH = new Date().getMonth() + 1;
const DEFAULT_AMOUNT = 350000;

type DialogMode =
  | { kind: 'create' }
  | { kind: 'edit'; kwitansi: KwitansiDto };

function KwitansiFormDialog({
  open,
  onOpenChange,
  mode,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mode: DialogMode;
}) {
  const isEdit = mode.kind === 'edit';

  const [siswaQuery, setSiswaQuery] = useState('');
  const [selectedSiswaId, setSelectedSiswaId] = useState<string | null>(null);
  const [selectedSiswa, setSelectedSiswa] = useState<{
    id: string; nis: string; nama: string; angkatan: number; kelas: string | null;
  } | null>(null);

  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);

  const [namaOrangTua, setNamaOrangTua] = useState('');
  const [payerIsSiswa, setPayerIsSiswa] = useState(false);
  const [catatan, setCatatan] = useState('');
  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));

  // Prefill saat edit / reset saat close
  useEffect(() => {
    if (!open) return;
    if (mode.kind === 'edit') {
      const k = mode.kwitansi;
      setSelectedSiswaId(k.siswaId);
      setSelectedSiswa({
        id: k.siswa.id,
        nis: k.siswa.nis,
        nama: k.siswa.nama,
        angkatan: k.siswa.angkatan,
        kelas: k.siswa.kelas,
      });
      setSelectedItems(
        k.items.map((it) => ({
          year: it.periodYear,
          month: it.periodMonth,
          amount: it.amount,
          keterangan: it.keterangan ?? '',
          kategori: it.kategori,
          jenisKeringanan: it.jenisKeringanan,
          pembayaranId: it.pembayaranId ?? undefined,
        })),
      );
      setNamaOrangTua(k.namaOrangTua ?? '');
      setPayerIsSiswa(!!k.namaOrangTua && k.namaOrangTua === k.siswa.nama);
      setCatatan(k.catatan ?? '');
      setTanggal(k.tanggal.slice(0, 10));
    } else {
      setSiswaQuery('');
      setSelectedSiswaId(null);
      setSelectedSiswa(null);
      setSelectedItems([]);
      setNamaOrangTua('');
      setPayerIsSiswa(false);
      setCatatan('');
      setTanggal(new Date().toISOString().slice(0, 10));
    }
  }, [open, mode]);

  // Jika checkbox "siswa sendiri" aktif, sinkronkan nama dengan siswa terpilih.
  useEffect(() => {
    if (!payerIsSiswa) return;
    setNamaOrangTua(selectedSiswa?.nama ?? '');
  }, [payerIsSiswa, selectedSiswa]);

  const { data: siswaResults, isFetching: siswaLoading } = useSiswaSearch(siswaQuery, {
    enabled: open && !isEdit && siswaQuery.length >= 1,
  });

  const { data: siswaMonths } = useSiswaMonths(selectedSiswaId);

  const { mutateAsync: create, isPending: creating } = useCreateKwitansi();
  const { mutateAsync: update, isPending: updating } = useUpdateKwitansi();
  const isPending = creating || updating;

  // Set existing kwitansi periods — exclude the one we're editing so they stay editable.
  const blockedPeriods = useMemo(() => {
    const s = new Set<string>();
    if (!siswaMonths) return s;
    const editingId = mode.kind === 'edit' ? mode.kwitansi.id : null;
    for (const row of siswaMonths) {
      if (!row.hasKwitansiReguler) continue;
      if (editingId && row.kwitansiIds.length === 1 && row.kwitansiIds[0] === editingId) continue;
      s.add(`${row.year}-${row.month}`);
    }
    return s;
  }, [siswaMonths, mode]);

  const paidPeriods = useMemo(() => {
    const s = new Set<string>();
    if (!siswaMonths) return s;
    for (const row of siswaMonths) if (row.hasPembayaran) s.add(`${row.year}-${row.month}`);
    return s;
  }, [siswaMonths]);

  const selectedPeriodKeys = useMemo(
    () => new Set(selectedItems.map((i) => `${i.year}-${i.month}`)),
    [selectedItems],
  );

  const [gridYear, setGridYear] = useState(CURRENT_YEAR);

  function toggleMonth(year: number, month: number) {
    const key = `${year}-${month}`;
    if (selectedPeriodKeys.has(key)) {
      setSelectedItems((prev) => prev.filter((i) => !(i.year === year && i.month === month)));
      return;
    }
    if (blockedPeriods.has(key)) {
      toast.error(`${MONTH_NAMES_FULL[month]} ${year} sudah ada di kwitansi lain (reguler).`);
      return;
    }
    setSelectedItems((prev) => [
      ...prev,
      {
        year,
        month,
        amount: DEFAULT_AMOUNT,
        keterangan: '',
        kategori: 'REGULER',
        jenisKeringanan: null,
      },
    ]);
  }

  function updateItem(idx: number, patch: Partial<SelectedItem>) {
    setSelectedItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    );
  }

  function removeItem(idx: number) {
    setSelectedItems((prev) => prev.filter((_, i) => i !== idx));
  }

  const total = useMemo(
    () => selectedItems.reduce((s, m) => s + (Number(m.amount) || 0), 0),
    [selectedItems],
  );

  const hasInvalidKeringanan = selectedItems.some(
    (i) => i.kategori === 'KERINGANAN' && !i.jenisKeringanan,
  );

  async function handleSubmit() {
    if (!selectedSiswaId) { toast.error('Pilih siswa terlebih dahulu.'); return; }
    if (selectedItems.length === 0) { toast.error('Pilih minimal 1 bulan.'); return; }
    if (hasInvalidKeringanan) {
      toast.error('Setiap item berkategori Keringanan wajib memilih jenis keringanan.');
      return;
    }

    const items = selectedItems.map((m) => ({
      periodYear:      m.year,
      periodMonth:     m.month,
      amount:          Number(m.amount) || 0,
      keterangan:      m.keterangan || undefined,
      kategori:        m.kategori,
      jenisKeringanan: m.kategori === 'KERINGANAN' ? m.jenisKeringanan ?? undefined : undefined,
      pembayaranId:    m.pembayaranId,
    }));

    try {
      if (isEdit) {
        const input: KwitansiUpdateInput = {
          tanggal:      new Date(tanggal),
          namaOrangTua: namaOrangTua || null,
          catatan:      catatan || null,
          biayaAdm:     0,
          items,
        };
        const k = await update({ id: mode.kwitansi.id, input });
        toast.success(`Kwitansi ${k.nomorKwitansi} diperbarui.`);
      } else {
        const input: KwitansiCreateInput = {
          siswaId:      selectedSiswaId,
          tanggal:      new Date(tanggal),
          namaOrangTua: namaOrangTua || undefined,
          catatan:      catatan || undefined,
          biayaAdm:     0,
          items,
        };
        const k = await create(input);
        toast.success(`Kwitansi ${k.nomorKwitansi} berhasil dibuat.`);
        openKwitansiPdf(k.id);
      }
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan kwitansi.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          // Override shadcn defaults: replace `grid gap-4 p-6` with flex layout
          'flex max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0',
          'sm:w-full',
        )}
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-slate-200 px-5 py-4 pr-12 text-left">
          <DialogTitle className="text-base">
            {isEdit ? `Edit Kwitansi ${mode.kwitansi.nomorKwitansi}` : 'Buat Kwitansi Baru'}
          </DialogTitle>
          <DialogDescription className="text-xs">
            {isEdit
              ? 'Nomor kwitansi tidak bisa diubah. Perubahan item akan menggantikan item lama.'
              : 'Pilih siswa, lalu centang bulan yang dibayar. PDF otomatis terbuka setelah simpan.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {/* ── siswa picker ── */}
          <div className="space-y-1.5">
            <Label>Siswa</Label>
            {selectedSiswa ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">{selectedSiswa.nama}</p>
                  <p className="text-xs text-slate-500">
                    NIS: {selectedSiswa.nis} · Kelas {selectedSiswa.kelas ?? '—'} · Angkatan {selectedSiswa.angkatan}
                  </p>
                </div>
                {!isEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedSiswa(null); setSelectedSiswaId(null); setSiswaQuery(''); setSelectedItems([]); }}
                  >
                    Ganti
                  </Button>
                )}
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
                        {siswaResults.map((s) => {
                          const kelas = siswaKelas(s);
                          return (
                            <li key={s.id}>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                onClick={() => {
                                  setSelectedSiswa({
                                    id: s.id,
                                    nis: s.nis,
                                    nama: s.nama,
                                    angkatan: s.angkatan,
                                    kelas,
                                  });
                                  setSelectedSiswaId(s.id);
                                  setSiswaQuery('');
                                }}
                              >
                                <span className="font-medium">{s.nama}</span>
                                <span className="ml-2 text-xs text-slate-400">
                                  {s.nis}
                                  {kelas ? ` · ${kelas}` : ''} · {s.angkatan}
                                </span>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── month grid ── */}
          {selectedSiswaId && (
            <div className="space-y-2 rounded-md border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Pilih Bulan
                </p>
                <div className="flex items-center gap-2 text-xs">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setGridYear((y) => y - 1)}
                    aria-label="Tahun sebelumnya"
                  >
                    ‹
                  </Button>
                  <span className="min-w-[4ch] text-center font-mono font-semibold">{gridYear}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 w-8 p-0"
                    onClick={() => setGridYear((y) => y + 1)}
                    aria-label="Tahun berikutnya"
                  >
                    ›
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                  const key = `${gridYear}-${m}`;
                  const isSelected = selectedPeriodKeys.has(key);
                  const isBlocked  = blockedPeriods.has(key);
                  const isPaid     = paidPeriods.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={isBlocked && !isSelected}
                      onClick={() => toggleMonth(gridYear, m)}
                      className={cn(
                        'relative flex flex-col items-center gap-0.5 rounded-md border px-2 py-2 text-sm transition-colors',
                        isSelected && 'border-blue-500 bg-blue-50 text-blue-900 shadow-sm',
                        !isSelected && isBlocked && 'cursor-not-allowed border-amber-200 bg-amber-50 text-amber-700',
                        !isSelected && !isBlocked && isPaid && 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300',
                        !isSelected && !isBlocked && !isPaid && 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <span className="font-semibold">{MONTH_NAMES_SHORT[m]}</span>
                      <span className="flex items-center gap-1 text-[10px]">
                        {isBlocked && !isSelected && <AlertTriangle className="h-3 w-3" aria-hidden="true" />}
                        {isPaid && !isBlocked && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                        <span>
                          {isSelected ? 'Dipilih' : isBlocked ? 'Sudah kwitansi' : isPaid ? 'Sudah bayar' : 'Belum'}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] text-slate-500">
                Kuning = sudah ada kwitansi reguler lain (disable). Hijau = pembayaran tercatat.
                Kategori Keringanan boleh di bulan yang sama dengan reguler.
              </p>
            </div>
          )}

          {/* ── selected items list with per-item edit ── */}
          {selectedItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                  Item Terpilih ({selectedItems.length})
                </p>
              </div>
              <div className="space-y-3">
                {selectedItems
                  .slice()
                  .sort((a, b) => (a.year !== b.year ? a.year - b.year : a.month - b.month))
                  .map((it) => {
                    const idx = selectedItems.findIndex(
                      (x) => x.year === it.year && x.month === it.month,
                    );
                    return (
                      <div
                        key={`${it.year}-${it.month}`}
                        className="rounded-md border border-slate-200 bg-white"
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50/60 px-3 py-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {MONTH_NAMES_FULL[it.month]} {it.year}
                          </span>
                          <div className="flex items-center gap-2">
                            {it.kategori === 'KERINGANAN' && (
                              <Badge variant="secondary" className="text-[10px]">
                                Keringanan
                              </Badge>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-slate-400 hover:text-red-600"
                              onClick={() => removeItem(idx)}
                              aria-label="Hapus item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-3 px-3 py-3">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1">
                              <Label className="text-[11px] text-slate-500">Nominal (Rp)</Label>
                              <Input
                                inputMode="numeric"
                                value={String(it.amount)}
                                onChange={(e) =>
                                  updateItem(idx, { amount: Number(e.target.value) || 0 })
                                }
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[11px] text-slate-500">Keterangan</Label>
                              <Input
                                placeholder={`Sumbangan Komite ${MONTH_NAMES_FULL[it.month]} ${it.year}`}
                                value={it.keterangan}
                                onChange={(e) => updateItem(idx, { keterangan: e.target.value })}
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
                              <Checkbox
                                checked={it.kategori === 'KERINGANAN'}
                                onCheckedChange={(checked) =>
                                  updateItem(idx, {
                                    kategori: checked ? 'KERINGANAN' : 'REGULER',
                                    jenisKeringanan: checked ? it.jenisKeringanan : null,
                                  })
                                }
                              />
                              <span>Item ini pakai keringanan</span>
                            </label>
                            {it.kategori === 'KERINGANAN' && (
                              <Select
                                value={it.jenisKeringanan ?? ''}
                                onValueChange={(v) =>
                                  updateItem(idx, { jenisKeringanan: v as JenisKeringanan })
                                }
                              >
                                <SelectTrigger className="h-9 text-xs">
                                  <SelectValue placeholder="Pilih jenis keringanan…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {KERINGANAN_OPTIONS.map((o) => (
                                    <SelectItem key={o.value} value={o.value} className="text-xs">
                                      {o.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* ── tanggal + nama ortu ── */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                disabled={payerIsSiswa}
              />
              <label className="flex cursor-pointer items-center gap-2 pt-0.5 text-xs text-slate-600">
                <Checkbox
                  checked={payerIsSiswa}
                  onCheckedChange={(checked) => {
                    const v = !!checked;
                    setPayerIsSiswa(v);
                    if (!v) setNamaOrangTua('');
                  }}
                  disabled={!selectedSiswa}
                />
                <span>Siswa sendiri yang membayar</span>
              </label>
            </div>
          </div>

          {/* ── total ── */}
          <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-4 py-3">
            <span className="text-sm font-medium text-slate-600">Total</span>
            <span className="text-lg font-bold text-slate-900">{rupiahFmt.format(total)}</span>
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

        <DialogFooter className="shrink-0 gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
            Batal
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending
              ? 'Menyimpan…'
              : isEdit
              ? 'Simpan Perubahan'
              : 'Simpan & Cetak'}
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
  const [dialogMode, setDialogMode] = useState<DialogMode | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<KwitansiDto | null>(null);

  const debouncedSearch = useDebounce(search, 300);
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
        description="Buat dan cetak kwitansi pembayaran Sumbangan Komite ukuran F4."
        actions={
          <Button onClick={() => setDialogMode({ kind: 'create' })}>
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Buat Kwitansi
          </Button>
        }
      />

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
                <Button size="sm" onClick={() => setDialogMode({ kind: 'create' })}>
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Buat Kwitansi
                </Button>
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto rounded-md border border-slate-200 bg-white">
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
                        <TableCell className="whitespace-nowrap text-xs text-slate-600">
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
                        <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
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
                              className="h-9 w-9"
                              title="Cetak PDF"
                              onClick={() => openKwitansiPdf(k.id)}
                            >
                              <Printer className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9"
                              title="Edit"
                              onClick={() => setDialogMode({ kind: 'edit', kwitansi: k })}
                            >
                              <Pencil className="h-4 w-4" aria-hidden="true" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-9 w-9 text-slate-400 hover:text-red-600"
                              title="Hapus"
                              onClick={() => setDeleteTarget(k)}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {data.meta.totalPages > 1 && (
                <div className="mt-4 flex flex-col gap-2 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
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

      {dialogMode && (
        <KwitansiFormDialog
          open={!!dialogMode}
          onOpenChange={(v) => { if (!v) setDialogMode(null); }}
          mode={dialogMode}
        />
      )}
      <DeleteConfirmDialog
        kwitansi={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
