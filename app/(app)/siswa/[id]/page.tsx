'use client';

import { AlertCircle, Pencil, RefreshCw, User } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PaymentMatrix } from '@/components/tables/payment-matrix';
import { useSiswaDetail } from '@/hooks/use-siswa';
import { apiFetch } from '@/lib/http';
import type { MatrixData } from '@/services/matrix-data.service';

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-900">
        {value === null || value === undefined || value === '' ? (
          <span className="text-slate-400">—</span>
        ) : (
          value
        )}
      </div>
    </div>
  );
}

export default function SiswaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, isLoading, isError, error, refetch } = useSiswaDetail(id);
  const matrixQuery = useQuery<MatrixData>({
    queryKey: ['siswa', id, 'matrix'],
    queryFn: () => apiFetch<MatrixData>(`/api/v1/siswa/${id}/matrix`),
    enabled: Boolean(id),
    staleTime: 30_000,
  });

  if (!id) return null;

  if (isError) {
    const message =
      error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat data siswa.';
    return (
      <div className="space-y-6">
        <PageHeader title="Detail Siswa" description="Gagal memuat data" />
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="flex items-center justify-between gap-4 p-5">
            <div className="flex items-center gap-3 text-sm text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              {message}
            </div>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
              Coba Lagi
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.nama ?? 'Detail Siswa'}
        description={data ? `NIS ${data.nis}` : 'Memuat data siswa...'}
        actions={
          data ? (
            <Button asChild>
              <Link href={`/siswa/${id}/edit`}>
                <Pencil className="mr-2 h-4 w-4" aria-hidden="true" />
                Ubah
              </Link>
            </Button>
          ) : null
        }
      />

      {isLoading || !data ? (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-6 w-40" />
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="profil">
          <TabsList>
            <TabsTrigger value="profil">Profil</TabsTrigger>
            <TabsTrigger value="pembayaran">Pembayaran</TabsTrigger>
            <TabsTrigger value="keringanan">Keringanan</TabsTrigger>
          </TabsList>

          <TabsContent value="profil" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Informasi Siswa
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <Field label="NIS" value={data.nis} />
                <Field label="Nama" value={data.nama} />
                <Field label="Angkatan" value={data.angkatan} />
                <Field
                  label="Jenis Kelamin"
                  value={
                    data.jenisKelamin === 'L'
                      ? 'Laki-laki'
                      : data.jenisKelamin === 'P'
                        ? 'Perempuan'
                        : null
                  }
                />
                <Field label="Status" value={data.statusSiswa} />
                <Field
                  label="Rombel Aktif"
                  value={data.enrollmentAktif?.rombel?.kode ?? null}
                />
                <Field label="Kontak Orang Tua" value={data.kontakOrtu} />
                <Field label="Alamat" value={data.alamat} />
                <div className="sm:col-span-2">
                  <Field label="Catatan" value={data.catatan} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pembayaran" className="mt-4">
            {matrixQuery.isLoading ? (
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-32 w-full" />
                </CardContent>
              </Card>
            ) : matrixQuery.isError ? (
              <Card className="border-red-200 bg-red-50/60">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div className="flex items-center gap-3 text-sm text-red-700">
                    <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {matrixQuery.error instanceof Error
                      ? matrixQuery.error.message
                      : 'Gagal memuat data pembayaran.'}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void matrixQuery.refetch()}
                  >
                    <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    Coba Lagi
                  </Button>
                </CardContent>
              </Card>
            ) : matrixQuery.data ? (
              <PaymentMatrix data={matrixQuery.data} compact />
            ) : (
              <Card>
                <CardContent className="flex min-h-[200px] items-center justify-center text-sm text-slate-500">
                  Belum ada data pembayaran untuk siswa ini.
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="keringanan" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Keringanan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-slate-600">
                <p>Kelola keringanan untuk siswa ini melalui halaman Keringanan.</p>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/keringanan?siswaId=${id}`}>Buka Keringanan</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
