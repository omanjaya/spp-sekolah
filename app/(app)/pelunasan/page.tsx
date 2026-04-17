'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, ChevronLeft, ChevronRight, Filter, Plus, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { PelunasanForm } from '@/components/forms/pelunasan-form';
import { PageHeader } from '@/components/layouts/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { formatRupiah } from '@/components/inputs/currency-input';
import {
  usePelunasanCreate,
  usePelunasanDelete,
  usePelunasanList,
  type PelunasanDto,
} from '@/hooks/use-pelunasan';
import type { PelunasanCreateInput, PelunasanFilterInput } from '@/lib/validators/pelunasan.schema';

function formatPeriodLabel(ym: string): string {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return ym;
  const [year, month] = ym.split('-');
  const m = Number(month);
  const labels = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agt',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  const label = Number.isFinite(m) && m >= 1 && m <= 12 ? labels[m - 1] : month;
  return `${label} ${year}`;
}

function formatTanggal(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function PelunasanPage() {
  const [filter, setFilter] = useState<Partial<PelunasanFilterInput>>({ limit: 20, page: 1 });
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<PelunasanDto | null>(null);

  const { data, isLoading } = usePelunasanList(filter);

  const totalPages = data?.meta?.totalPages ?? 1;
  const currentPage = filter.page ?? 1;

  const filteredData = useMemo(() => {
    const rows = data?.data ?? [];
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.siswa?.nama?.toLowerCase().includes(q) ||
        r.siswa?.nis?.toLowerCase().includes(q),
    );
  }, [data?.data, search]);

  const createMutation = usePelunasanCreate({
    onError: (err) => toast.error(err.message),
    onSuccess: () => {
      toast.success('Pelunasan dicatat.');
      setFormOpen(false);
    },
  });

  const deleteMutation = usePelunasanDelete({
    onError: (err) => toast.error(err.message),
    onSuccess: () => {
      toast.success('Pelunasan dihapus.');
      setToDelete(null);
    },
  });

  async function handleSubmit(payload: PelunasanCreateInput) {
    await createMutation.mutateAsync(payload);
  }

  const columns = useMemo<ColumnDef<PelunasanDto>[]>(
    () => [
      {
        header: 'Tanggal',
        accessorKey: 'tanggalLunas',
        cell: ({ row }) => (
          <span className="text-sm">{formatTanggal(row.original.tanggalLunas)}</span>
        ),
      },
      {
        header: 'Siswa',
        accessorKey: 'siswa.nama',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-slate-900">{row.original.siswa?.nama ?? '-'}</span>
            <span className="font-mono text-xs text-slate-500">
              {row.original.siswa?.nis ?? '-'}
            </span>
          </div>
        ),
      },
      {
        header: 'Periode',
        accessorKey: 'periodeMulai',
        cell: ({ row }) => (
          <div className="text-xs">
            <span className="font-medium text-slate-900">
              {formatPeriodLabel(row.original.periodeMulai)}
            </span>
            <span className="mx-1 text-slate-400">→</span>
            <span className="font-medium text-slate-900">
              {formatPeriodLabel(row.original.periodeAkhir)}
            </span>
          </div>
        ),
      },
      {
        header: 'Nominal',
        accessorKey: 'nominalTotal',
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium text-emerald-700">
            {formatRupiah(row.original.nominalTotal)}
          </span>
        ),
      },
      {
        header: 'Metode',
        accessorKey: 'metodeLabel',
        cell: ({ row }) =>
          row.original.metodeLabel ? (
            <Badge variant="secondary" className="font-normal">
              {row.original.metodeLabel}
            </Badge>
          ) : (
            <span className="text-xs text-slate-400">-</span>
          ),
      },
      {
        header: 'No. Bukti',
        accessorKey: 'noBukti',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600">{row.original.noBukti ?? '-'}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 hover:text-destructive"
              onClick={() => setToDelete(row.original)}
              aria-label="Hapus"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pelunasan Sekaligus"
        description="Catat pembayaran lunas untuk rentang periode (mis. lunas 3 tahun sekaligus)."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Catat Pelunasan
          </Button>
        }
      />

      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari NIS atau nama siswa"
            className="pl-9"
            aria-label="Cari siswa"
          />
        </div>
        <FilterBar filter={filter} onChange={(n) => setFilter((p) => ({ ...p, ...n, page: 1 }))} />
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        isLoading={isLoading}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-slate-500">
            <CheckCircle2 className="h-8 w-8 text-slate-300" aria-hidden="true" />
            Belum ada catatan pelunasan.
          </div>
        }
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage <= 1 || isLoading}
            onClick={() => setFilter((prev) => ({ ...prev, page: currentPage - 1 }))}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="tabular-nums">Hal {currentPage} dari {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage >= totalPages || isLoading}
            onClick={() => setFilter((prev) => ({ ...prev, page: currentPage + 1 }))}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Catat Pelunasan</DialogTitle>
            <DialogDescription>
              Pelunasan menandai siswa sebagai lunas untuk rentang periode tersebut. Tidak membuat
              baris pembayaran per bulan.
            </DialogDescription>
          </DialogHeader>
          <PelunasanForm
            onSubmit={handleSubmit}
            onCancel={() => setFormOpen(false)}
            isSubmitting={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Hapus catatan pelunasan?"
        description={
          toDelete ? (
            <span>
              Pelunasan <span className="font-semibold">{toDelete.siswa?.nama ?? '—'}</span> untuk
              periode {formatPeriodLabel(toDelete.periodeMulai)} –{' '}
              {formatPeriodLabel(toDelete.periodeAkhir)} akan dihapus.
            </span>
          ) : null
        }
        confirmLabel="Hapus"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={async () => {
          if (toDelete) await deleteMutation.mutateAsync(toDelete.id);
        }}
      />
    </div>
  );
}

function FilterBar({
  filter,
  onChange,
}: {
  filter: Partial<PelunasanFilterInput>;
  onChange: (next: Partial<PelunasanFilterInput>) => void;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-600">
        <Filter className="h-4 w-4" aria-hidden="true" />
        Filter
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500" htmlFor="filter-angkatan">
          Angkatan
        </label>
        <Input
          id="filter-angkatan"
          type="number"
          placeholder="2023"
          className="h-8 w-28 text-xs"
          value={filter.angkatan ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ angkatan: v ? Number(v) : undefined });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500" htmlFor="filter-tahun">
          Tahun catat
        </label>
        <Input
          id="filter-tahun"
          type="number"
          placeholder="2024"
          className="h-8 w-24 text-xs"
          value={filter.tahun ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ tahun: v ? Number(v) : undefined });
          }}
        />
      </div>
      {filter.angkatan !== undefined || filter.tahun !== undefined ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() => onChange({ angkatan: undefined, tahun: undefined })}
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}
