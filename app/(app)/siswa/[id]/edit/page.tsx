'use client';

import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { SiswaForm } from '@/components/forms/siswa-form';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSiswaDetail, useUpdateSiswa } from '@/hooks/use-siswa';
import { HttpError } from '@/lib/http';

export default function SiswaEditPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const { data, isLoading } = useSiswaDetail(id);
  const updateSiswa = useUpdateSiswa();

  if (!id) return null;

  return (
    <div className="space-y-6">
      <PageHeader title="Edit Siswa" description="Perbarui data siswa." />
      <Card>
        <CardContent className="pt-6">
          {isLoading || !data ? (
            <div className="space-y-4">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-full" />
            </div>
          ) : (
            <SiswaForm
              isSubmitting={updateSiswa.isPending}
              onCancel={() => router.back()}
              submitLabel="Simpan perubahan"
              defaultValues={{
                nis: data.nis,
                nama: data.nama,
                angkatan: data.angkatan,
                jenisKelamin: data.jenisKelamin,
                statusSiswa: data.statusSiswa,
                alamat: data.alamat ?? '',
                kontakOrtu: data.kontakOrtu ?? '',
                catatan: data.catatan ?? '',
              }}
              onSubmit={async (values) => {
                try {
                  await updateSiswa.mutateAsync({ id, input: values });
                  toast.success('Siswa diperbarui.');
                  router.push(`/siswa/${id}`);
                } catch (err) {
                  const msg = err instanceof HttpError ? err.message : 'Gagal memperbarui siswa.';
                  toast.error(msg);
                }
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
