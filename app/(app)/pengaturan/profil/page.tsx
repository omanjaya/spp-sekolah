'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ChangePasswordForm } from '@/components/forms/change-password-form';
import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useSelfChangePassword } from '@/hooks/use-users';
import { apiFetch, HttpError } from '@/lib/http';
import {
  updateOwnProfileSchema,
  type UpdateOwnProfileInput,
} from '@/lib/validators/user.schema';
import type { UserDTO } from '@/types/domain';

export default function ProfilPage() {
  const { data: session, update } = useSession();
  const userId = session?.user?.userId;
  const changePassword = useSelfChangePassword();

  const form = useForm<UpdateOwnProfileInput>({
    resolver: zodResolver(updateOwnProfileSchema),
    defaultValues: { nama: session?.user?.nama ?? '' },
  });

  useEffect(() => {
    if (session?.user?.nama) {
      form.reset({ nama: session.user.nama });
    }
  }, [session?.user?.nama, form]);

  return (
    <div className="space-y-6">
      <PageHeader title="Profil Saya" description="Perbarui nama dan kata sandi Anda." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informasi Akun</CardTitle>
          <CardDescription>Email tidak dapat diubah sendiri.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            onSubmit={form.handleSubmit(async (values) => {
              if (!userId) return;
              try {
                const updated = await apiFetch<UserDTO>(`/api/v1/users/${userId}`, {
                  method: 'PATCH',
                  body: { nama: values.nama },
                });
                toast.success('Profil diperbarui.');
                await update({ nama: updated.nama });
              } catch (err) {
                const msg =
                  err instanceof HttpError ? err.message : 'Gagal memperbarui profil.';
                toast.error(msg);
              }
            })}
            className="space-y-4"
          >
            <FormFieldWrapper label="Email" htmlFor="profile-email">
              <Input
                id="profile-email"
                type="email"
                value={session?.user?.email ?? ''}
                disabled
                readOnly
                className="font-mono"
              />
            </FormFieldWrapper>
            <FormFieldWrapper label="Nama" required error={form.formState.errors.nama?.message}>
              <Input {...form.register('nama')} />
            </FormFieldWrapper>
            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                ) : null}
                Simpan profil
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ubah Kata Sandi</CardTitle>
          <CardDescription>
            Setelah berhasil, Anda masih masuk di sesi ini — tapi sesi lain mungkin perlu login ulang.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm
            isSubmitting={changePassword.isPending}
            onSubmit={async (values) => {
              if (!userId) return;
              try {
                await changePassword.mutateAsync({ id: userId, input: values });
                toast.success('Kata sandi diperbarui.');
              } catch (err) {
                const msg =
                  err instanceof HttpError ? err.message : 'Gagal mengubah kata sandi.';
                toast.error(msg);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
