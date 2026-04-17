'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Columns3,
  FileDown,
  FileSpreadsheet,
  Inbox,
  Loader2,
  RefreshCw,
  Search,
  StickyNote,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { apiFetch, HttpError } from '@/lib/http';
import type { PembayaranDto } from '@/services/pembayaran.service';
import { cn } from '@/lib/utils';

interface ListResponse {
  data: PembayaranDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
  totals?: { amount: number; biayaAdm: number };
}

interface TahunAjaranLite {
  id: string;
  kode: string;
  tahunMulai: number;
  isActive: boolean;
}

const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function fmtRupiah(n: number | null | undefined): string {
  return rupiah.format(Number(n ?? 0));
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yy} ${hh}:${mi}`;
}

function fmtPeriode(year: number, month: number): string {
  return `${MONTHS_ID[month - 1] ?? month} ${year}`;
}

interface Filters {
  q: string;
  angkatan: string;
  rombelId: string;
  tahunAjaranId: string;
  year: string;
  month: string;
  kodeCabang: string;
  status: string;
  duplikat: boolean;
}

const INIT_FILTERS: Filters = {
  q: '',
  angkatan: '',
  rombelId: '',
  tahunAjaranId: '',
  year: '',
  month: '',
  kodeCabang: '',
  status: '',
  duplikat: false,
};

// Columns hidden by default (konstan / jarang dilihat). User can toggle via popover.
const DEFAULT_HIDDEN: VisibilityState = {
  alamat: false,
  biayaAdm: false,
  source: false,
  catatan: false,
  createdAt: false,
};

export default function RekonsiliasiPage() {
  return (
    <Suspense fallback={null}>
      <RekonsiliasiContent />
    </Suspense>
  );
}

function SiswaDetailPanel({
  row,
  onClose,
}: {
  row: PembayaranDto | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [catatan, setCatatan] = useState('');
  const [saving, setSaving] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  // Sync catatan ke state saat row berubah
  useEffect(() => {
    setCatatan(row?.siswa?.catatan ?? '');
    setTimeout(() => textRef.current?.focus(), 100);
  }, [row?.siswa?.id]);

  async function saveCatatan() {
    if (!row?.siswa?.id) return;
    setSaving(true);
    try {
      await apiFetch(`/api/v1/siswa/${row.siswa.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ catatan: catatan || null }),
      });
      await qc.invalidateQueries({ queryKey: ['pembayaran'] });
      toast.success('Catatan disimpan');
    } catch {
      toast.error('Gagal menyimpan catatan');
    } finally {
      setSaving(false);
    }
  }

  if (!row) return null;
  const s = row.siswa;

  return (
    <Sheet open={!!row} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="w-80 p-0 flex flex-col">
        <SheetHeader className="border-b border-slate-200 px-5 py-4">
          <SheetTitle className="text-sm font-semibold text-slate-900">Detail Siswa</SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Info siswa */}
          <div className="space-y-1">
            <p className="text-xs text-slate-500">NIS</p>
            <p className="font-mono text-sm font-semibold">{s?.nis ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Nama</p>
            <p className="text-sm font-medium text-slate-900">{s?.nama ?? '—'}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Angkatan</p>
              <p className="font-mono text-sm">{s?.angkatan ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-slate-500">Kelas</p>
              <p className="font-mono text-sm">{row.rombel?.kode ?? '—'}</p>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Periode Bayar</p>
            <p className="text-sm">{MONTHS_ID[(row.periodMonth ?? 1) - 1]} {row.periodYear}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">No. Bukti</p>
            <p className="font-mono text-xs text-slate-700">{row.noBukti ?? '—'}</p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-slate-500">Cabang</p>
            <p className="text-sm">{row.kodeCabang ?? '—'}</p>
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
              <StickyNote className="h-3.5 w-3.5" />
              Catatan Siswa
            </label>
            <textarea
              ref={textRef}
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveCatatan();
              }}
              placeholder="Tulis catatan... (Ctrl+Enter untuk simpan)"
              rows={5}
              className="w-full resize-none rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            <Button
              size="sm"
              className="w-full"
              onClick={saveCatatan}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Simpan Catatan
            </Button>
          </div>

          {s?.id && (
            <Link
              href={`/siswa/${s.id}`}
              className="block text-center text-xs text-slate-500 hover:text-slate-900 underline"
            >
              Lihat detail lengkap siswa →
            </Link>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RekonsiliasiContent() {
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...INIT_FILTERS,
    duplikat: searchParams.get('duplikat') === 'true',
  }));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [selectedRow, setSelectedRow] = useState<PembayaranDto | null>(null);

  useEffect(() => {
    const wantDup = searchParams.get('duplikat') === 'true';
    setFilters((f) => (f.duplikat === wantDup ? f : { ...f, duplikat: wantDup }));
  }, [searchParams]);
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'tanggalTransaksi', desc: true },
  ]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(DEFAULT_HIDDEN);

  const activeFilters = useMemo(() => {
    const out: Record<string, string | number> = {
      page,
      limit,
      sortBy: sorting[0]?.id ?? 'tanggalTransaksi',
      sortOrder: sorting[0]?.desc ? 'desc' : 'asc',
    };
    if (search.trim()) out.q = search.trim();
    if (filters.angkatan) out.angkatan = filters.angkatan;
    if (filters.rombelId) out.rombelId = filters.rombelId;
    if (filters.tahunAjaranId) out.tahunAjaranId = filters.tahunAjaranId;
    if (filters.year) out.year = filters.year;
    if (filters.month) out.month = filters.month;
    if (filters.kodeCabang) out.kodeCabang = filters.kodeCabang;
    if (filters.status) out.status = filters.status;
    if (filters.duplikat) out.duplikat = 'true';
    return out;
  }, [filters, search, page, limit, sorting]);

  const { data, isLoading, isFetching, refetch } = useQuery<ListResponse>({
    queryKey: ['pembayaran', activeFilters],
    queryFn: async () => {
      const qs = new URLSearchParams(
        Object.entries(activeFilters).map(([k, v]) => [k, String(v)]),
      ).toString();
      const res = await fetch(`/api/v1/pembayaran?${qs}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text.slice(0, 200) || `Gagal memuat data (${res.status})`);
      }
      const body = (await res.json()) as {
        success: boolean;
        data: PembayaranDto[];
        meta: { page: number; limit: number; total: number; totalPages: number };
      };
      return { data: body.data ?? [], meta: body.meta };
    },
  });

  const rows = data?.data ?? [];
  const meta = data?.meta;
  // Sync local page state to server-returned page to avoid divergence.
  useEffect(() => {
    if (meta?.page !== undefined && meta.page !== page) {
      setPage(meta.page);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta?.page]);
  // Totals: sum of visible page (since API doesn't yet return totals in envelope);
  // we'll show page-visible totals.
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount), 0);
  const totalBiaya = rows.reduce((s, r) => s + Number(r.biayaAdm), 0);

  // Load tahun ajaran for filter dropdown
  const { data: taList } = useQuery<TahunAjaranLite[]>({
    queryKey: ['tahun-ajaran', 'all'],
    queryFn: () => apiFetch<TahunAjaranLite[]>('/api/v1/tahun-ajaran'),
    staleTime: 5 * 60_000,
  });

  // Columns
  const columns = useMemo<ColumnDef<PembayaranDto>[]>(
    () => [
      {
        id: 'no',
        header: 'No',
        size: 60,
        cell: ({ row }) => (
          <span className="text-xs text-slate-500 tabular-nums">
            {((meta?.page ?? page) - 1) * limit + row.index + 1}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: 'nis',
        header: 'NIS',
        size: 100,
        accessorFn: (r) => r.siswa?.nis ?? '',
        cell: ({ row }) => {
          const s = row.original.siswa;
          return s ? (
            <Link
              href={`/siswa/${s.id}`}
              className="font-mono text-xs text-slate-700 hover:text-slate-900 hover:underline"
            >
              {s.nis}
            </Link>
          ) : (
            <span className="text-slate-400">—</span>
          );
        },
      },
      {
        id: 'nama',
        header: 'Nama',
        size: 360,
        accessorFn: (r) => r.siswa?.nama ?? '',
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm text-slate-800">
            {row.original.siswa?.nama ?? '—'}
          </span>
        ),
      },
      {
        id: 'angkatan',
        header: 'Angkatan',
        accessorFn: (r) => r.siswa?.angkatan ?? '',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600">
            {row.original.siswa?.angkatan ?? '—'}
          </span>
        ),
      },
      {
        id: 'kelas',
        header: 'Kelas',
        accessorFn: (r) => r.rombel?.grade ?? '',
        cell: ({ row }) => row.original.rombel?.grade ?? '—',
      },
      {
        id: 'rombel',
        header: 'Rombel',
        accessorFn: (r) => r.rombel?.kode ?? '',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.rombel?.kode ?? '—'}</span>
        ),
      },
      {
        id: 'periode',
        header: 'Periode',
        accessorFn: (r) => `${r.periodYear}-${String(r.periodMonth).padStart(2, '0')}`,
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {fmtPeriode(row.original.periodYear, row.original.periodMonth)}
          </span>
        ),
      },
      {
        id: 'amount',
        header: 'Tagihan',
        accessorKey: 'amount',
        cell: ({ row }) => (
          <span className="font-mono text-right tabular-nums">
            {fmtRupiah(row.original.amount)}
          </span>
        ),
      },
      {
        id: 'biayaAdm',
        header: 'Biaya Adm',
        accessorKey: 'biayaAdm',
        cell: ({ row }) => (
          <span className="font-mono text-right tabular-nums text-slate-500">
            {fmtRupiah(row.original.biayaAdm)}
          </span>
        ),
      },
      {
        id: 'tanggalTransaksi',
        header: 'Tgl Transaksi',
        accessorKey: 'tanggalTransaksi',
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-mono text-xs">
            {fmtDate(row.original.tanggalTransaksi)}
          </span>
        ),
      },
      {
        id: 'statusBayar',
        header: 'Status',
        accessorKey: 'statusBayar',
        cell: ({ row }) => (
          <Badge
            variant={row.original.statusBayar === 'TERBAYAR' ? 'default' : 'destructive'}
            className={cn(
              row.original.statusBayar === 'TERBAYAR' && 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
            )}
          >
            {row.original.statusBayar === 'TERBAYAR' ? 'Terbayar' : 'Dibatalkan'}
          </Badge>
        ),
      },
      {
        id: 'kodeCabang',
        header: 'Cabang',
        accessorKey: 'kodeCabang',
        cell: ({ row }) => row.original.kodeCabang ?? '—',
      },
      {
        id: 'tellerUser',
        header: 'Teller',
        accessorKey: 'tellerUser',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600">
            {row.original.tellerUser ?? '—'}
          </span>
        ),
      },
      {
        id: 'noBukti',
        header: 'No. Bukti',
        accessorKey: 'noBukti',
        cell: ({ row }) => (
          <span className="font-mono text-xs">{row.original.noBukti ?? '—'}</span>
        ),
      },
      {
        id: 'source',
        header: 'Sumber',
        accessorKey: 'source',
        cell: ({ row }) => (
          <span className="text-xs text-slate-500">
            {row.original.source === 'IMPORT_EXCEL'
              ? 'Excel'
              : row.original.source === 'PASTE_SPREADSHEET'
                ? 'Paste'
                : 'Manual'}
          </span>
        ),
      },
      {
        id: 'alamat',
        header: 'Alamat',
        accessorFn: (r) => r.siswa?.alamat ?? '',
        cell: ({ row }) => (
          <span className="text-xs text-slate-500">{row.original.siswa?.alamat ?? '—'}</span>
        ),
      },
      {
        id: 'catatan',
        header: 'Catatan',
        accessorKey: 'catatan',
        cell: ({ row }) => (
          <span className="text-xs text-slate-500">{row.original.catatan ?? '—'}</span>
        ),
      },
    ],
    [meta?.page, limit],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    manualPagination: true,
  });

  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);

  async function onExport(format: 'excel' | 'pdf') {
    if (exporting) return;
    setExporting(format);
    try {
      const qs = new URLSearchParams(
        Object.entries(activeFilters)
          .filter(([k]) => k !== 'page' && k !== 'limit')
          .map(([k, v]) => [k, String(v)]),
      );
      const endpoint =
        format === 'excel' ? '/api/v1/rekonsiliasi/export-excel' : '/api/v1/rekonsiliasi/export-pdf';
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      const res = await fetch(`${endpoint}?${qs.toString()}`);
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text.slice(0, 200) || `Gagal export (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rekonsiliasi-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`${format === 'excel' ? 'Excel' : 'PDF'} berhasil diunduh.`);
    } catch (err) {
      toast.error(err instanceof HttpError ? err.message : `Gagal export ${format}.`);
    } finally {
      setExporting(null);
    }
  }

  const hasFilters =
    !!search ||
    !!filters.angkatan ||
    !!filters.rombelId ||
    !!filters.tahunAjaranId ||
    !!filters.year ||
    !!filters.month ||
    !!filters.kodeCabang ||
    !!filters.status ||
    filters.duplikat;

  function resetFilters() {
    setFilters(INIT_FILTERS);
    setSearch('');
    setPage(1);
  }

  const years = Array.from({ length: 10 }, (_, i) => 2019 + i);
  const totalRecords = meta?.total ?? 0;
  const totalPages = meta?.totalPages ?? 1;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Data Rekonsiliasi"
        description={`${totalRecords.toLocaleString('id-ID')} transaksi tercatat`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} aria-hidden="true" />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onExport('pdf')}
              disabled={exporting !== null}
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileDown className="h-4 w-4" aria-hidden="true" />
              )}
              PDF
            </Button>
            <Button
              size="sm"
              onClick={() => onExport('excel')}
              disabled={exporting !== null}
            >
              {exporting === 'excel' ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              )}
              Excel
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="NIS (angka) atau nama / no. bukti"
              className="pl-9"
              aria-label="Cari transaksi: ketik angka untuk cari NIS, atau teks untuk cari nama/nomor bukti"
            />
          </div>

          <div className="w-[140px]">
            <label className="mb-1 block text-xs text-slate-500">Angkatan</label>
            <Select
              value={filters.angkatan || 'all'}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, angkatan: v === 'all' ? '' : v }));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[180px]">
            <label className="mb-1 block text-xs text-slate-500">Tahun Ajaran</label>
            <Select
              value={filters.tahunAjaranId || 'all'}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, tahunAjaranId: v === 'all' ? '' : v }));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {taList?.map((ta) => (
                  <SelectItem key={ta.id} value={ta.id}>
                    {ta.kode}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[120px]">
            <label className="mb-1 block text-xs text-slate-500">Tahun</label>
            <Select
              value={filters.year || 'all'}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, year: v === 'all' ? '' : v }));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {Array.from({ length: 10 }, (_, i) => 2019 + i).map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[140px]">
            <label className="mb-1 block text-xs text-slate-500">Bulan</label>
            <Select
              value={filters.month || 'all'}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, month: v === 'all' ? '' : v }));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                {MONTHS_ID.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[120px]">
            <label className="mb-1 block text-xs text-slate-500">Cabang</label>
            <Input
              value={filters.kodeCabang}
              onChange={(e) => {
                setFilters((f) => ({ ...f, kodeCabang: e.target.value }));
                setPage(1);
              }}
              placeholder="EB / GAPURA"
            />
          </div>

          <div className="w-[140px]">
            <label className="mb-1 block text-xs text-slate-500">Status</label>
            <Select
              value={filters.status || 'all'}
              onValueChange={(v) => {
                setFilters((f) => ({ ...f, status: v === 'all' ? '' : v }));
                setPage(1);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Semua</SelectItem>
                <SelectItem value="TERBAYAR">Terbayar</SelectItem>
                <SelectItem value="DIBATALKAN">Dibatalkan</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600">
            <Checkbox
              checked={filters.duplikat}
              onCheckedChange={(v) => {
                setFilters((f) => ({ ...f, duplikat: v === true }));
                setPage(1);
              }}
            />
            Hanya duplikat bayar
          </label>

          {hasFilters ? (
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              <X className="h-4 w-4" aria-hidden="true" />
              Reset
            </Button>
          ) : null}

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm">
                <Columns3 className="h-4 w-4" aria-hidden="true" />
                Kolom
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56">
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-700">Tampilkan kolom</p>
                {table.getAllLeafColumns().map((col) => (
                  <label
                    key={col.id}
                    className="flex items-center gap-2 text-sm text-slate-700"
                  >
                    <Checkbox
                      checked={col.getIsVisible()}
                      onCheckedChange={(v) => col.toggleVisibility(!!v)}
                    />
                    {typeof col.columnDef.header === 'string' ? col.columnDef.header : col.id}
                  </label>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <div className="overflow-auto">
          <Table className="min-w-max border-separate border-spacing-0">
            <TableHeader>
              {table.getHeaderGroups().map((group) => {
                // Compute cumulative left offsets for sticky columns from actual visible sizes.
                let acc = 0;
                const stickyOffsets: number[] = [];
                group.headers.slice(0, 3).forEach((h) => {
                  stickyOffsets.push(acc);
                  acc += h.getSize() || 0;
                });
                return (
                  <TableRow key={group.id} className="bg-slate-50">
                    {group.headers.map((header, idx) => {
                      const size = header.getSize();
                      const isSticky = idx <= 2;
                      const leftOffset = isSticky ? stickyOffsets[idx] : undefined;
                      return (
                        <TableHead
                          key={header.id}
                          style={{
                            width: size ? `${size}px` : undefined,
                            minWidth: size ? `${size}px` : undefined,
                            maxWidth: size ? `${size}px` : undefined,
                            left: leftOffset,
                          }}
                          className={cn(
                            'h-9 whitespace-nowrap border-b border-slate-200 px-3 text-xs font-semibold uppercase tracking-wide text-slate-700 select-none',
                            isSticky && 'sticky z-20 bg-slate-50',
                            idx === 2 && 'border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]',
                            header.column.getCanSort() && 'cursor-pointer hover:bg-slate-100',
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          role={header.column.getCanSort() ? 'button' : undefined}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                );
              })}
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={`s-${i}`}>
                    {table.getVisibleLeafColumns().map((c) => (
                      <TableCell key={c.id}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={table.getVisibleLeafColumns().length}
                    className="h-40 text-center"
                  >
                    <div className="flex flex-col items-center gap-2 py-6 text-sm text-slate-500">
                      <Inbox className="h-8 w-8 text-slate-300" aria-hidden="true" />
                      Tidak ada transaksi sesuai filter.
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => {
                  // Compute cumulative left offsets for sticky columns from actual visible sizes.
                  let acc = 0;
                  const stickyOffsets: number[] = [];
                  row.getVisibleCells().slice(0, 3).forEach((c) => {
                    stickyOffsets.push(acc);
                    acc += c.column.getSize() || 0;
                  });
                  return (
                    <TableRow
                      key={row.id}
                      className="group cursor-pointer"
                      onClick={() => setSelectedRow(row.original)}
                    >
                      {row.getVisibleCells().map((cell, idx) => {
                        const size = cell.column.getSize();
                        const isSticky = idx <= 2;
                        const leftOffset = isSticky ? stickyOffsets[idx] : undefined;
                        return (
                          <TableCell
                            key={cell.id}
                            style={{
                              width: size ? `${size}px` : undefined,
                              minWidth: size ? `${size}px` : undefined,
                              maxWidth: size ? `${size}px` : undefined,
                              left: leftOffset,
                            }}
                            className={cn(
                              'border-b border-slate-100 px-3 py-1.5 text-sm',
                              isSticky
                                ? 'sticky z-10 bg-white group-hover:bg-slate-50'
                                : 'group-hover:bg-slate-50',
                              idx === 2 && 'border-r border-slate-200 shadow-[2px_0_4px_-2px_rgba(15,23,42,0.08)]',
                            )}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* Footer: totals + pagination */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 bg-slate-50/50 px-4 py-3 text-xs text-slate-600">
          <div className="flex flex-wrap items-center gap-5">
            <span>
              <strong className="text-slate-900">{rows.length}</strong> baris di halaman ini
              {totalRecords > 0 ? ` dari ${totalRecords.toLocaleString('id-ID')} total` : ''}
            </span>
            <span className="font-mono">
              Total tagihan (halaman ini):{' '}
              <strong className="text-slate-900">{fmtRupiah(totalAmount)}</strong>
            </span>
            {totalBiaya > 0 ? (
              <span className="font-mono">
                Biaya adm:{' '}
                <strong className="text-slate-900">{fmtRupiah(totalBiaya)}</strong>
              </span>
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[25, 50, 100, 200].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n} / hal
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="tabular-nums">
              Hal {meta?.page ?? page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={(meta?.page ?? page) <= 1 || isFetching}
              onClick={() => setPage(1)}
              aria-label="Halaman pertama"
              title="Halaman pertama"
            >
              <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={(meta?.page ?? page) <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Halaman sebelumnya"
              title="Halaman sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={(meta?.page ?? page) >= totalPages || isFetching}
              onClick={() => setPage((p) => p + 1)}
              aria-label="Halaman berikutnya"
              title="Halaman berikutnya"
            >
              {isFetching ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              disabled={(meta?.page ?? page) >= totalPages || isFetching || totalPages < 1}
              onClick={() => setPage(totalPages)}
              aria-label="Halaman terakhir"
              title="Halaman terakhir — cek transaksi terbaru"
            >
              <ChevronsRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>

      <SiswaDetailPanel row={selectedRow} onClose={() => setSelectedRow(null)} />
    </div>
  );
}
