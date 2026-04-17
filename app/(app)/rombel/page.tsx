'use client';

import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';

import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { DataTable } from '@/components/tables/data-table';
import { RombelForm } from '@/components/forms/rombel-form';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useCreateRombel,
  useDeleteRombel,
  useRombelList,
  useUpdateRombel,
} from '@/hooks/use-rombel';
import { useTahunAjaranList } from '@/hooks/use-tahun-ajaran';
import { HttpError } from '@/lib/http';
import type { RombelDTO } from '@/types/domain';
import type {
  RombelCreateInput,
  RombelUpdateInput,
} from '@/lib/validators/rombel.schema';

export default function RombelPage() {
  const [tahunAjaranId, setTahunAjaranId] = useState<string>('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<RombelDTO | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RombelDTO | null>(null);

  const tahunAjaranQuery = useTahunAjaranList();
  const tahunAjaranOptions = tahunAjaranQuery.data ?? [];
  const tahunAjaranError = tahunAjaranQuery.error;

  const filter = useMemo(
    () => ({
      tahunAjaranId: tahunAjaranId !== 'ALL' ? tahunAjaranId : undefined,
      page: 1,
      limit: 100,
    }),
    [tahunAjaranId],
  );

  const { data, isLoading, error: rombelError } = useRombelList(filter);
  const createRombel = useCreateRombel();
  const updateRombel = useUpdateRombel();
  const deleteRombel = useDeleteRombel();

  const columns = useMemo<ColumnDef<RombelDTO>[]>(
    () => [
      {
        accessorKey: 'kode',
        header: 'Kode',
        cell: ({ row }) => <span className="font-mono font-medium">{row.original.kode}</span>,
      },
      {
        accessorKey: 'grade',
        header: 'Tingkat',
      },
      {
        id: 'tahunAjaran',
        header: 'Tahun Ajaran',
        cell: ({ row }) => row.original.tahunAjaran?.kode ?? '—',
      },
      {
        accessorKey: 'waliKelas',
        header: 'Wali Kelas',
        cell: ({ row }) => row.original.waliKelas || <span className="text-slate-400">—</span>,
      },
      {
        id: 'jumlahSiswa',
        header: 'Jumlah Siswa',
        cell: ({ row }) => (
          <span className="font-mono">{row.original.jumlahSiswa ?? 0}</span>
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
              onClick={() => {
                setEditTarget(row.original);
                setDialogOpen(true);
              }}
              aria-label="Ubah"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingDelete(row.original)}
              aria-label="Hapus"
            >
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  async function handleSubmit(values: RombelCreateInput | RombelUpdateInput) {
    try {
      if (editTarget) {
        await updateRombel.mutateAsync({ id: editTarget.id, input: values });
        toast.success('Rombel diperbarui.');
      } else {
        await createRombel.mutateAsync(values as RombelCreateInput);
        toast.success('Rombel dibuat.');
      }
      setDialogOpen(false);
      setEditTarget(null);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal menyimpan rombel.';
      toast.error(msg);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteRombel.mutateAsync(pendingDelete.id);
      toast.success('Rombel dihapus.');
      setPendingDelete(null);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal menghapus rombel.';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rombel"
        description="Kelola rombongan belajar per tahun ajaran."
        actions={
          <Button
            onClick={() => {
              setEditTarget(null);
              setDialogOpen(true);
            }}
            disabled={tahunAjaranOptions.length === 0}
            title={tahunAjaranOptions.length === 0 ? 'Tambahkan tahun ajaran terlebih dahulu' : undefined}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Tambah Rombel
          </Button>
        }
      />

      {tahunAjaranError ? (
        <p className="text-sm text-destructive" role="alert">
          Gagal memuat daftar tahun ajaran. Coba muat ulang halaman.
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <Select value={tahunAjaranId} onValueChange={setTahunAjaranId}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Pilih tahun ajaran" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Semua tahun ajaran</SelectItem>
            {tahunAjaranOptions.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.kode} {t.isActive ? '(Aktif)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {rombelError ? (
        <p className="text-sm text-destructive" role="alert">
          Gagal memuat daftar rombel. Coba muat ulang halaman.
        </p>
      ) : null}

      <DataTable columns={columns} data={data?.items ?? []} isLoading={isLoading} />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit Rombel' : 'Tambah Rombel'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Perbarui data rombel ${editTarget.kode}.`
                : 'Buat rombel baru untuk tahun ajaran.'}
            </DialogDescription>
          </DialogHeader>
          <RombelForm
            tahunAjaranOptions={tahunAjaranOptions}
            defaultValues={
              editTarget
                ? {
                    tahunAjaranId: editTarget.tahunAjaranId,
                    grade: editTarget.grade,
                    nomor: editTarget.nomor,
                    kode: editTarget.kode,
                    waliKelas: editTarget.waliKelas ?? '',
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            onCancel={() => {
              setDialogOpen(false);
              setEditTarget(null);
            }}
            submitLabel={editTarget ? 'Simpan perubahan' : 'Simpan rombel'}
            isSubmitting={createRombel.isPending || updateRombel.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Hapus rombel?"
        description={pendingDelete ? `Rombel "${pendingDelete.kode}" akan dihapus.` : null}
        confirmLabel="Hapus"
        variant="destructive"
        isLoading={deleteRombel.isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
