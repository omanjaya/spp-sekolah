'use client';

import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { SiswaForm } from '@/components/forms/siswa-form';
import { Card, CardContent } from '@/components/ui/card';
import { useCreateSiswa } from '@/hooks/use-siswa';
import { HttpError } from '@/lib/http';

export default function SiswaNewPage() {
  const router = useRouter();
  const createSiswa = useCreateSiswa();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tambah Siswa"
        description="Tambahkan siswa baru ke master data."
      />
      <Card>
        <CardContent className="pt-6">
          <SiswaForm
            isSubmitting={createSiswa.isPending}
            onCancel={() => router.back()}
            submitLabel="Simpan siswa"
            onSubmit={async (values) => {
              try {
                const siswa = await createSiswa.mutateAsync(values);
                toast.success('Siswa berhasil ditambahkan.');
                router.push(`/siswa/${siswa.id}`);
              } catch (err) {
                const msg = err instanceof HttpError ? err.message : 'Gagal menyimpan siswa.';
                toast.error(msg);
              }
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
