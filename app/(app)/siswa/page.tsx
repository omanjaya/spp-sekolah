'use client';

import { ClipboardPaste, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/tables/data-table';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDeleteSiswa, useSiswaList } from '@/hooks/use-siswa';
import { HttpError } from '@/lib/http';
import type { SiswaDTO } from '@/types/domain';
import type { SiswaFilterInput } from '@/lib/validators/siswa.schema';

const STATUS_OPTIONS: Array<{ value: SiswaFilterInput['status'] | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'Semua status' },
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'PINDAH', label: 'Pindah' },
  { value: 'LULUS', label: 'Lulus' },
  { value: 'DO', label: 'Drop Out' },
  { value: 'CUTI', label: 'Cuti' },
];

const CURRENT_YEAR = new Date().getFullYear();
const ANGKATAN_OPTIONS = Array.from({ length: 6 }).map((_, i) => CURRENT_YEAR - i);

export default function SiswaListPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [angkatan, setAngkatan] = useState<string>('ALL');
  const [status, setStatus] = useState<string>('ALL');
  const [page, setPage] = useState(1);
  const [pendingDelete, setPendingDelete] = useState<SiswaDTO | null>(null);

  const filter: Partial<SiswaFilterInput> = useMemo(
    () => ({
      search: search.trim() || undefined,
      angkatan: angkatan !== 'ALL' ? Number(angkatan) : undefined,
      status: (status !== 'ALL' ? (status as SiswaFilterInput['status']) : undefined),
      page,
      limit: 20,
    }),
    [search, angkatan, status, page],
  );

  const { data, isLoading } = useSiswaList(filter);
  const deleteSiswa = useDeleteSiswa();

  const columns = useMemo<ColumnDef<SiswaDTO>[]>(
    () => [
      {
        accessorKey: 'nis',
        header: 'NIS',
        cell: ({ row }) => (
          <Link
            href={`/siswa/${row.original.id}`}
            className="font-mono text-slate-900 hover:underline"
          >
            {row.original.nis}
          </Link>
        ),
      },
      { accessorKey: 'nama', header: 'Nama' },
      {
        accessorKey: 'angkatan',
        header: 'Angkatan',
        cell: ({ row }) => <span className="font-mono">{row.original.angkatan}</span>,
      },
      {
        id: 'rombel',
        header: 'Rombel',
        cell: ({ row }) =>
          row.original.enrollmentAktif?.rombel?.kode ? (
            <span className="font-mono text-slate-700">
              {row.original.enrollmentAktif.rombel.kode}
            </span>
          ) : (
            <span className="text-xs text-slate-400">—</span>
          ),
      },
      {
        accessorKey: 'statusSiswa',
        header: 'Status',
        cell: ({ row }) => (
          <span className="text-xs font-medium uppercase tracking-wide text-slate-700">
            {row.original.statusSiswa}
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
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/siswa/${row.original.id}/edit`);
              }}
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setPendingDelete(row.original);
              }}
              aria-label="Hapus"
            >
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [router],
  );

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteSiswa.mutateAsync(pendingDelete.id);
      toast.success('Siswa dihapus.');
      setPendingDelete(null);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal menghapus siswa.';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Data Siswa"
        description="Kelola daftar siswa dan enrollment ke rombel."
        actions={
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/siswa/paste-import">
                <ClipboardPaste className="mr-2 h-4 w-4" aria-hidden="true" />
                Import Paste
              </Link>
            </Button>
            <Button asChild>
              <Link href="/siswa/new">
                <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
                Tambah Siswa
              </Link>
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Cari NIS atau nama..."
            className="pl-9"
          />
        </div>
        <Select
          value={angkatan}
          onValueChange={(v) => {
            setAngkatan(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Angkatan" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua angkatan</SelectItem>
            {ANGKATAN_OPTIONS.map((y) => (
              <SelectItem key={y} value={String(y)}>
                Angkatan {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value ?? 'ALL'} value={String(opt.value ?? 'ALL')}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        onRowClick={(row) => router.push(`/siswa/${row.id}`)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Hapus siswa?"
        description={
          pendingDelete
            ? `Siswa "${pendingDelete.nama}" (NIS ${pendingDelete.nis}) akan dihapus permanen.`
            : null
        }
        confirmLabel="Hapus"
        variant="destructive"
        isLoading={deleteSiswa.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
