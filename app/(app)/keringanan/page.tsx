'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { Award, ChevronLeft, ChevronRight, Filter, Pencil, Plus, Trash2, Users2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { KeringananBulkForm } from '@/components/forms/keringanan-bulk-form';
import { KeringananForm } from '@/components/forms/keringanan-form';
import { MONTH_LABELS } from '@/components/pickers/month-range-picker';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useKeringananBulkAssign,
  useKeringananDelete,
  useKeringananList,
  type KeringananDto,
} from '@/hooks/use-keringanan';
import {
  JENIS_KERINGANAN,
  type JenisKeringanan,
  type KeringananBulkAssignInput,
  type KeringananFilterInput,
} from '@/lib/validators/keringanan.schema';

const JENIS_LABEL: Record<JenisKeringanan, string> = {
  JUARA: 'Juara',
  OSN: 'OSN',
  JUARA_UMUM: 'Juara Umum',
  BEASISWA: 'Beasiswa',
  KELUARGA_TIDAK_MAMPU: 'Keluarga Tidak Mampu',
  PINDAHAN: 'Pindahan',
  IJAZAH: 'Ijazah',
  LAINNYA: 'Lainnya',
};

const JENIS_TONE: Record<JenisKeringanan, 'default' | 'secondary' | 'success' | 'warning' | 'outline'> = {
  JUARA: 'success',
  OSN: 'default',
  JUARA_UMUM: 'default',
  BEASISWA: 'secondary',
  KELUARGA_TIDAK_MAMPU: 'warning',
  PINDAHAN: 'default',
  IJAZAH: 'secondary',
  LAINNYA: 'outline',
};

function formatPeriode(year: number, month: number): string {
  const label = MONTH_LABELS[month - 1] ?? `${month}`;
  return `${label} ${year}`;
}

export default function KeringananPage() {
  const [filter, setFilter] = useState<Partial<KeringananFilterInput>>({ limit: 20, page: 1 });
  const [singleOpen, setSingleOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [toDelete, setToDelete] = useState<KeringananDto | null>(null);

  const { data, isLoading } = useKeringananList(filter);

  const totalPages = data?.meta?.totalPages ?? 1;
  const currentPage = filter.page ?? 1;

  const bulkMutation = useKeringananBulkAssign({
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = useKeringananDelete({
    onError: (err) => toast.error(err.message),
    onSuccess: () => {
      toast.success('Keringanan dihapus.');
      setToDelete(null);
    },
  });

  async function handleSingleSubmit(payload: KeringananBulkAssignInput) {
    // Expand single via bulk endpoint for idempotency.
    const result = await bulkMutation.mutateAsync(payload);
    toast.success(
      `Disimpan: ${result.created} entri dibuat, ${result.skipped} dilewati (duplikat).`,
    );
    setSingleOpen(false);
  }

  async function handleBulkSubmit(payload: KeringananBulkAssignInput, meta: { entryCount: number }) {
    const result = await bulkMutation.mutateAsync(payload);
    toast.success(
      `Selesai: ${result.created}/${meta.entryCount} entri dibuat (${result.skipped} duplikat dilewati).`,
    );
    setBulkOpen(false);
  }

  const columns = useMemo<ColumnDef<KeringananDto>[]>(
    () => [
      {
        header: 'NIS',
        accessorKey: 'siswa.nis',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600">
            {row.original.siswa?.nis ?? '-'}
          </span>
        ),
      },
      {
        header: 'Nama',
        accessorKey: 'siswa.nama',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-slate-900">{row.original.siswa?.nama ?? '-'}</span>
            {row.original.siswa?.angkatan ? (
              <span className="text-xs text-slate-500">Angkatan {row.original.siswa.angkatan}</span>
            ) : null}
          </div>
        ),
      },
      {
        header: 'Periode',
        accessorKey: 'periodYear',
        cell: ({ row }) => formatPeriode(row.original.periodYear, row.original.periodMonth),
      },
      {
        header: 'Jenis',
        accessorKey: 'jenis',
        cell: ({ row }) => {
          const j = row.original.jenis as JenisKeringanan;
          return <Badge variant={JENIS_TONE[j]}>{JENIS_LABEL[j] ?? j}</Badge>;
        },
      },
      {
        header: 'Persentase',
        accessorKey: 'persentase',
        cell: ({ row }) => (
          <span className="font-mono text-sm">{row.original.persentase}%</span>
        ),
      },
      {
        header: 'Alasan',
        accessorKey: 'alasan',
        cell: ({ row }) => (
          <span className="line-clamp-1 max-w-xs text-xs text-slate-500">
            {row.original.alasan ?? '-'}
          </span>
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
              className="h-8 w-8 text-slate-500 hover:text-slate-900"
              disabled
              aria-label="Edit (segera hadir)"
              title="Edit keringanan (segera hadir)"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
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
        title="Keringanan Sumbangan Komite"
        description="Pencatatan bebas biaya / potongan Sumbangan Komite (JUARA, OSN, beasiswa, dll) per periode."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setBulkOpen(true)}>
              <Users2 className="mr-1 h-4 w-4" aria-hidden="true" />
              Bulk Assign
            </Button>
            <Button onClick={() => setSingleOpen(true)}>
              <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
              Tambah Keringanan
            </Button>
          </div>
        }
      />

      <FilterBar
        filter={filter}
        onChange={(next) => setFilter((prev) => ({ ...prev, ...next, page: 1 }))}
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        isLoading={isLoading}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-slate-500">
            <Award className="h-8 w-8 text-slate-300" aria-hidden="true" />
            Belum ada keringanan tercatat.
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

      <Dialog open={singleOpen} onOpenChange={setSingleOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tambah Keringanan</DialogTitle>
            <DialogDescription>
              Catat keringanan untuk satu siswa pada rentang bulan tertentu.
            </DialogDescription>
          </DialogHeader>
          <KeringananForm
            onSubmit={handleSingleSubmit}
            onCancel={() => setSingleOpen(false)}
            isSubmitting={bulkMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Assign Keringanan</DialogTitle>
            <DialogDescription>
              Terapkan jenis &amp; persentase yang sama ke beberapa siswa dan beberapa bulan
              sekaligus.
            </DialogDescription>
          </DialogHeader>
          <KeringananBulkForm
            onSubmit={handleBulkSubmit}
            onCancel={() => setBulkOpen(false)}
            isSubmitting={bulkMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => {
          if (!open) setToDelete(null);
        }}
        title="Hapus keringanan?"
        description={
          toDelete ? (
            <span>
              Entri untuk{' '}
              <span className="font-semibold">{toDelete.siswa?.nama ?? '—'}</span> periode{' '}
              {formatPeriode(toDelete.periodYear, toDelete.periodMonth)} akan dihapus permanen.
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
  filter: Partial<KeringananFilterInput>;
  onChange: (next: Partial<KeringananFilterInput>) => void;
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
        <label className="text-xs text-slate-500" htmlFor="filter-jenis">
          Jenis
        </label>
        <Select
          value={filter.jenis ?? 'all'}
          onValueChange={(v) =>
            onChange({ jenis: v === 'all' ? undefined : (v as JenisKeringanan) })
          }
        >
          <SelectTrigger id="filter-jenis" className="h-8 w-44 text-xs">
            <SelectValue placeholder="Semua jenis" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua jenis</SelectItem>
            {JENIS_KERINGANAN.map((j) => (
              <SelectItem key={j} value={j}>
                {JENIS_LABEL[j]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500" htmlFor="filter-year">
          Tahun
        </label>
        <Input
          id="filter-year"
          type="number"
          placeholder="2024"
          className="h-8 w-24 text-xs"
          value={filter.year ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ year: v ? Number(v) : undefined });
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500" htmlFor="filter-month">
          Bulan
        </label>
        <Select
          value={filter.month ? String(filter.month) : 'all'}
          onValueChange={(v) =>
            onChange({ month: v === 'all' ? undefined : Number(v) })
          }
        >
          <SelectTrigger id="filter-month" className="h-8 w-36 text-xs">
            <SelectValue placeholder="Semua bulan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua bulan</SelectItem>
            {MONTH_LABELS.map((label, idx) => (
              <SelectItem key={label} value={String(idx + 1)}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {filter.angkatan !== undefined ||
      filter.jenis !== undefined ||
      filter.year !== undefined ||
      filter.month !== undefined ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-xs"
          onClick={() =>
            onChange({
              angkatan: undefined,
              jenis: undefined,
              year: undefined,
              month: undefined,
            })
          }
        >
          Reset
        </Button>
      ) : null}
    </div>
  );
}
