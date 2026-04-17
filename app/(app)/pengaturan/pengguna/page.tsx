'use client';

import { KeyRound, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useSession } from 'next-auth/react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import type { ColumnDef } from '@tanstack/react-table';

import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { DataTable } from '@/components/tables/data-table';
import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { UserForm } from '@/components/forms/user-form';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  useAdminChangePassword,
  useCreateUser,
  useDeleteUser,
  useUpdateUser,
  useUserList,
} from '@/hooks/use-users';
import { HttpError } from '@/lib/http';
import type { Role, UserDTO } from '@/types/domain';
import type {
  UserCreateInput,
  UserUpdateInput,
} from '@/lib/validators/user.schema';

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  BENDAHARA: 'Bendahara',
  TU: 'Tata Usaha',
  VIEWER: 'Viewer',
};

export default function PenggunaPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role;
  const isSuperAdmin = role === 'SUPER_ADMIN';

  const { data, isLoading } = useUserList();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const deleteUser = useDeleteUser();
  const adminChangePassword = useAdminChangePassword();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<UserDTO | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserDTO | null>(null);
  const [pwTarget, setPwTarget] = useState<UserDTO | null>(null);
  const [pwValue, setPwValue] = useState('');

  const columns = useMemo<ColumnDef<UserDTO>[]>(
    () => [
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => <span className="font-mono text-xs">{row.original.email}</span>,
      },
      { accessorKey: 'nama', header: 'Nama' },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: ({ row }) => (
          <span className="text-xs font-medium">{ROLE_LABEL[row.original.role as Role]}</span>
        ),
      },
      {
        accessorKey: 'isActive',
        header: 'Status',
        cell: ({ row }) =>
          row.original.isActive ? (
            <Badge variant="outline" className="text-xs text-emerald-700 border-emerald-300">Aktif</Badge>
          ) : (
            <Badge variant="outline" className="text-xs text-slate-500 border-slate-300">Nonaktif</Badge>
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
                setPwTarget(row.original);
                setPwValue('');
              }}
              aria-label="Reset kata sandi"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
            </Button>
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
            >
              <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  if (status === 'loading') {
    return <p className="text-sm text-slate-500">Memuat...</p>;
  }
  if (!isSuperAdmin) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-slate-500">
          Hanya Super Admin yang dapat mengelola pengguna.
        </CardContent>
      </Card>
    );
  }

  async function handleSubmit(values: UserCreateInput | UserUpdateInput) {
    try {
      if (editTarget) {
        await updateUser.mutateAsync({ id: editTarget.id, input: values });
        toast.success('Pengguna diperbarui.');
      } else {
        await createUser.mutateAsync(values as UserCreateInput);
        toast.success('Pengguna dibuat.');
      }
      setDialogOpen(false);
      setEditTarget(null);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal menyimpan pengguna.';
      toast.error(msg);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    try {
      await deleteUser.mutateAsync(pendingDelete.id);
      toast.success('Pengguna dihapus.');
      setPendingDelete(null);
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal menghapus pengguna.';
      toast.error(msg);
    }
  }

  async function handleResetPassword() {
    if (!pwTarget) return;
    try {
      await adminChangePassword.mutateAsync({
        id: pwTarget.id,
        input: { newPassword: pwValue },
      });
      toast.success('Kata sandi diperbarui.');
      setPwTarget(null);
      setPwValue('');
    } catch (err) {
      const msg = err instanceof HttpError ? err.message : 'Gagal reset kata sandi.';
      toast.error(msg);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengguna"
        description="Kelola akun pengguna dan hak akses."
        actions={
          <Button
            onClick={() => {
              setEditTarget(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
            Tambah Pengguna
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
            <DialogTitle>{editTarget ? 'Edit Pengguna' : 'Tambah Pengguna'}</DialogTitle>
            <DialogDescription>
              {editTarget
                ? `Perbarui data pengguna ${editTarget.email}.`
                : 'Tambah akun baru.'}
            </DialogDescription>
          </DialogHeader>
          <UserForm
            mode={editTarget ? 'edit' : 'create'}
            defaultValues={
              editTarget
                ? {
                    email: editTarget.email,
                    nama: editTarget.nama,
                    role: editTarget.role,
                    isActive: editTarget.isActive,
                  }
                : undefined
            }
            isSubmitting={createUser.isPending || updateUser.isPending}
            onSubmit={handleSubmit}
            onCancel={() => {
              setDialogOpen(false);
              setEditTarget(null);
            }}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
        title="Hapus pengguna?"
        description={
          pendingDelete ? `Akun ${pendingDelete.email} akan dihapus atau dinonaktifkan.` : null
        }
        variant="destructive"
        confirmLabel="Hapus"
        isLoading={deleteUser.isPending}
        onConfirm={handleDelete}
      />

      <Dialog
        open={!!pwTarget}
        onOpenChange={(open) => {
          if (!open) {
            setPwTarget(null);
            setPwValue('');
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Kata Sandi</DialogTitle>
            <DialogDescription>
              Set kata sandi baru untuk {pwTarget?.email}. User akan harus login ulang.
            </DialogDescription>
          </DialogHeader>
          <FormFieldWrapper
            label="Kata sandi baru"
            htmlFor="new-password"
            required
            hint="Minimal 10 karakter, mengandung huruf kapital, kecil, dan angka."
            error={pwValue.length > 0 && pwValue.length < 10 ? 'Minimal 10 karakter' : undefined}
          >
            <Input
              id="new-password"
              type="password"
              value={pwValue}
              onChange={(e) => setPwValue(e.target.value)}
              autoComplete="new-password"
            />
          </FormFieldWrapper>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPwTarget(null);
                setPwValue('');
              }}
              disabled={adminChangePassword.isPending}
            >
              Batal
            </Button>
            <Button
              onClick={() => void handleResetPassword()}
              disabled={adminChangePassword.isPending || pwValue.length < 10}
            >
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
