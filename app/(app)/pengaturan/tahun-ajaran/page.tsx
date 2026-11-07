'use client';

import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';

import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { DataTable } from '@/components/tables/data-table';
import { TahunAjaranForm } from '@/components/forms/tahun-ajaran-form';
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
  useActivateTahunAjaran,
  useCreateTahunAjaran,
  useDeleteTahunAjaran,
  useTahunAjaranList,
  useUpdateTahunAjaran,
} from '@/hooks/use-tahun-ajaran';
import { HttpError } from '@/lib/http';
import type { TahunAjaranDTO } from '@/types/domain';
import type { TahunAjaranCreateInput } from '@/lib/validators/tahun-ajaran.schema';

function formatRp(n: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(new Date(iso));
}

export default function TahunAjaranPage() {
  const { data, isLoading } = useTahunAjaranList();
  const createTA = useCreateTahunAjaran();
  const updateTA = useUpdateTahunAjaran();
  const deleteTA = useDeleteTahunAjaran();
  const activateTA = useActivateTahunAjaran();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<TahunAjaranDTO | null>(null);
  const [pendingDelete, setPendingDelete] = useState<TahunAjaranDTO | null>(null);
  const [pendingActivate, setPendingActivate] = useState<TahunAjaranDTO | null>(null);

  const columns = useMemo<ColumnDef<TahunAjaranDTO>[]>(
    () => [
      {
        accessorKey: 'kode',
        header: 'Kode',
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <span className="font-mono font-medium">{row.original.kode}</span>
            {row.original.isActive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Aktif
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: 'periode',
        header: 'Periode',
        cell: ({ row }) => (
          <span className="text-xs text-slate-600">
            {formatDate(row.original.tanggalMulai)} – {formatDate(row.original.tanggalAkhir)}
          </span>
        ),
      },
      {
        id: 'nominal',
        header: 'Nominal Sumbangan Komite',
        cell: ({ row }) => (
          <span className="font-mono">{formatRp(row.original.nominalSppDefault)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            {!row.original.isActive ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPendingActivate(row.original)}
              >
                Aktifkan
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditTarget(row.original);
                setDialogOpen(true);
              }}
              aria-label="Edit"
            >
              <Pencil className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingDelete(row.original)}
              aria-label="Hapus"
              disabled={row.original.isActive}
            >
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  async function handleSubmit(values: TahunAjaranCreateInput) {
    try {
      if (editTarget) {
        await updateTA.mutateAsync({ id: editTarget.id, input: values });
        toast.success('Tahun ajaran diperbarui.');
      } else {
        await createTA.mutateAsync(values);
        toast.success('Tahun ajaran dibuat.');
      }
      setDialogOpen(false);
      setEditTarget(null);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal menyimpan tahun ajaran.';
      toast.error(msg);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteTA.mutateAsync(pendingDelete.id);
      toast.success('Tahun ajaran dihapus.');
      setPendingDelete(null);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal menghapus.';
      toast.error(msg);
    }
  }

  async function handleActivate() {
    if (!pendingActivate) return;
    try {
      await activateTA.mutateAsync(pendingActivate.id);
      toast.success(`Tahun ajaran ${pendingActivate.kode} diaktifkan.`);
      setPendingActivate(null);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengaktifkan tahun ajaran.';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tahun Ajaran"
        description="Kelola periode akademik dan nominal Sumbangan Komite default."
        actions={
          <Button
            onClick={() => {
              setEditTarget(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Tambah Tahun Ajaran
          </Button>
        }
      />

      <DataTable columns={columns} data={data ?? []} isLoading={isLoading} />

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editTarget ? 'Edit Tahun Ajaran' : 'Tambah Tahun Ajaran'}
            </DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Perbarui tahun ajaran ${editTarget.kode}.`
                : 'Buat periode akademik baru.'}
            </DialogDescription>
          </DialogHeader>
          <TahunAjaranForm
            defaultValues={
              editTarget
                ? {
                    kode: editTarget.kode,
                    tahunMulai: editTarget.tahunMulai,
                    tahunAkhir: editTarget.tahunAkhir,
                    tanggalMulai: editTarget.tanggalMulai.slice(0, 10),
                    tanggalAkhir: editTarget.tanggalAkhir.slice(0, 10),
                    nominalSppDefault: editTarget.nominalSppDefault,
                    isActive: editTarget.isActive,
                  }
                : undefined
            }
            onSubmit={handleSubmit}
            onCancel={() => {
              setDialogOpen(false);
              setEditTarget(null);
            }}
            submitLabel={editTarget ? 'Simpan perubahan' : 'Simpan'}
            isSubmitting={createTA.isPending || updateTA.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Hapus tahun ajaran?"
        description={pendingDelete ? `Tahun ajaran ${pendingDelete.kode} akan dihapus.` : null}
        variant="destructive"
        confirmLabel="Hapus"
        isLoading={deleteTA.isPending}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={!!pendingActivate}
        onOpenChange={(open) => !open && setPendingActivate(null)}
        title="Aktifkan tahun ajaran?"
        description={
          pendingActivate
            ? `Tahun ajaran ${pendingActivate.kode} akan menjadi aktif dan menonaktifkan yang lain.`
            : null
        }
        confirmLabel="Aktifkan"
        isLoading={activateTA.isPending}
        onConfirm={handleActivate}
      />
    </div>
  );
}
