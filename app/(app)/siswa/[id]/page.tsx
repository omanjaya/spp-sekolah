'use client';

import {
  AlertCircle,
  Award,
  CreditCard,
  LayoutGrid,
  Pencil,
  RefreshCw,
  StickyNote,
  User,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSiswaDetail } from '@/hooks/use-siswa';
import type { MatrixData, MatrixCell } from '@/services/matrix-data.service';
import type { PembayaranDto } from '@/services/pembayaran.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const MONTH_SHORTS = ['', 'J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-900">
        {value === null || value === undefined || value === '' ? (
          <span className="text-slate-400">—</span>
        ) : value}
      </div>
    </div>
  );
}

function formatPeriod(year: number, month: number): string {
  return `${MONTH_NAMES[month] ?? month} ${year}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatDateShort(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getFullYear()).slice(2)}`;
}

function formatRupiah(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
}

function sourceLabel(source: PembayaranDto['source']): string {
  switch (source) {
    case 'IMPORT_EXCEL': return 'Import';
    case 'PASTE_SPREADSHEET': return 'Paste';
    case 'MANUAL': return 'Manual';
    default: return source;
  }
}

function periodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

// ─── Shared components ────────────────────────────────────────────────────────

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Card className="border-red-200 bg-red-50/60">
      <CardContent className="flex items-center justify-between gap-4 p-5">
        <div className="flex items-center gap-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {message}
        </div>
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
          Coba Lagi
        </Button>
      </CardContent>
    </Card>
  );
}

function CatatanBanner({ catatan }: { catatan: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" aria-hidden="true" />
      <span>{catatan}</span>
    </div>
  );
}

// ─── Tab: Pembayaran ──────────────────────────────────────────────────────────

async function fetchPembayaran(siswaId: string): Promise<PembayaranDto[]> {
  const params = new URLSearchParams({
    siswaId,
    limit: '100',
    sortBy: 'periode',
    sortOrder: 'asc',
  });
  const res = await fetch(`/api/v1/pembayaran?${params.toString()}`);
  const json = await res.json() as { success: boolean; data?: PembayaranDto[]; error?: { message?: string } };
  if (!res.ok || !json.success) {
    throw new Error(json.error?.message ?? `Gagal memuat data pembayaran (${res.status})`);
  }
  return json.data ?? [];
}

function PembayaranTab({ siswaId, catatanSiswa }: { siswaId: string; catatanSiswa?: string | null }) {
  const query = useQuery<PembayaranDto[]>({
    queryKey: ['pembayaran', 'siswa', siswaId],
    queryFn: () => fetchPembayaran(siswaId),
    enabled: Boolean(siswaId),
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    );
  }

  if (query.isError) {
    return (
      <LoadError
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat data pembayaran.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const items = query.data ?? [];

  return (
    <div className="space-y-3">
      {/* Catatan siswa */}
      {catatanSiswa && <CatatanBanner catatan={catatanSiswa} />}

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[180px] items-center justify-center text-sm text-slate-500">
            Belum ada data pembayaran untuk siswa ini.
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Summary */}
          <div className="flex flex-wrap gap-2 text-sm">
            <div className="rounded-md border border-slate-200 bg-white px-3 py-1.5">
              <span className="text-slate-500">Transaksi</span>
              <span className="ml-1.5 font-semibold text-slate-900">{items.length}</span>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-3 py-1.5">
              <span className="text-slate-500">Total</span>
              <span className="ml-1.5 font-semibold text-slate-900">
                {formatRupiah(items.reduce((s, p) => s + p.amount, 0))}
              </span>
            </div>
            {items.some(p => p.biayaAdm > 0) && (
              <div className="rounded-md border border-slate-200 bg-white px-3 py-1.5">
                <span className="text-slate-500">Adm</span>
                <span className="ml-1.5 font-semibold text-slate-900">
                  {formatRupiah(items.reduce((s, p) => s + p.biayaAdm, 0))}
                </span>
              </div>
            )}
          </div>

          {/* Table */}
          <div className="overflow-auto rounded-md border border-slate-200 bg-white">
            <table className="w-full border-collapse text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">Periode</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">Tgl Transaksi</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">Nominal</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">Adm</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">No Bukti</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">Teller</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">Sumber</th>
                  <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => (
                  <tr key={p.id} className={i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}>
                    <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs font-semibold text-slate-800">
                      {formatPeriod(p.periodYear, p.periodMonth)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-600">
                      {formatDate(p.tanggalTransaksi)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right font-mono text-xs text-slate-900">
                      {formatRupiah(p.amount)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right font-mono text-xs text-slate-500">
                      {p.biayaAdm > 0 ? formatRupiah(p.biayaAdm) : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs text-slate-500">
                      {p.noBukti || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-xs text-slate-500">
                      {p.tellerUser || <span className="text-slate-300">—</span>}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <Badge variant="outline" className="text-[10px] font-normal">
                        {sourceLabel(p.source)}
                      </Badge>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 max-w-[200px] text-xs text-slate-600">
                      {p.catatan ? (
                        <span className="block truncate" title={p.catatan}>{p.catatan}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tab: Matriks (compact year-by-year) ─────────────────────────────────────

/** Return the 12 academic-year periods for a given kode like "2022/2023". */
function getAcademicYearPeriods(tahunAjaranKode: string): Array<{ year: number; month: number }> {
  const startYear = parseInt(tahunAjaranKode.split('/')[0] ?? '2022', 10);
  const periods: Array<{ year: number; month: number }> = [];
  for (let m = 7; m <= 12; m++) periods.push({ year: startYear, month: m });
  for (let m = 1; m <= 6; m++) periods.push({ year: startYear + 1, month: m });
  return periods;
}

function MatrixCellView({ cell }: { cell: MatrixCell | undefined }) {
  if (!cell || cell.status === 'BELUM') {
    return (
      <td className="border border-slate-100 px-1 py-1 text-center text-[10px] text-slate-300">
        –
      </td>
    );
  }
  if (cell.status === 'LUNAS') {
    return (
      <td className="border border-slate-100 bg-green-50 px-1 py-1 text-center text-[10px] text-green-700">
        {cell.date ? formatDateShort(cell.date) : '✓'}
      </td>
    );
  }
  // Keringanan
  const badge: Record<string, { label: string; cls: string }> = {
    JUARA_UMUM: { label: 'J.UMM', cls: 'bg-yellow-50 text-yellow-700' },
    JUARA: { label: 'JRA', cls: 'bg-amber-50 text-amber-700' },
    OSN: { label: 'OSN', cls: 'bg-blue-50 text-blue-700' },
    BEASISWA: { label: 'BEA', cls: 'bg-purple-50 text-purple-700' },
    KELUARGA_TIDAK_MAMPU: { label: 'KTM', cls: 'bg-orange-50 text-orange-700' },
    LAINNYA: { label: 'BEBA', cls: 'bg-slate-100 text-slate-600' },
  };
  const b = badge[cell.status] ?? { label: cell.status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <td className={`border border-slate-100 px-1 py-1 text-center text-[10px] font-semibold ${b.cls}`}>
      {b.label}
    </td>
  );
}

function SingleStudentMatrix({ data }: { data: MatrixData }) {
  const siswa = data.rombels[0]?.siswa[0];
  if (!siswa) return <p className="text-sm text-slate-500">Tidak ada data.</p>;

  return (
    <div className="space-y-3">
      <div className="overflow-auto rounded-md border border-slate-200 bg-white">
        <table className="border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50">
              <th className="border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-600 whitespace-nowrap">
                Tahun Ajaran
              </th>
              <th className="border border-slate-200 px-3 py-2 text-left text-xs font-medium text-slate-600">
                Kelas
              </th>
              {/* 12 month header cells */}
              {Array.from({ length: 12 }, (_, i) => {
                // Academic year months: Jul(7)..Des(12), Jan(1)..Jun(6)
                const month = i < 6 ? i + 7 : i - 5;
                return (
                  <th
                    key={i}
                    className="border border-slate-200 px-1 py-2 text-center text-[10px] font-medium text-slate-500 min-w-[40px]"
                  >
                    {MONTH_SHORTS[month]}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {data.rombels.map((rombel) => {
              const periods = getAcademicYearPeriods(rombel.tahunAjaranKode);
              const cells = rombel.siswa[0]?.cells ?? {};
              return (
                <tr key={rombel.rombelId}>
                  <td className="border border-slate-200 px-3 py-2 text-xs text-slate-700 whitespace-nowrap font-medium">
                    {rombel.tahunAjaranKode}
                  </td>
                  <td className="border border-slate-200 px-3 py-2 text-xs font-mono text-slate-700 whitespace-nowrap">
                    {rombel.grade} {rombel.nomor}
                    {rombel.waliKelas ? (
                      <span className="block text-[10px] font-normal text-slate-400">
                        {rombel.waliKelas}
                      </span>
                    ) : null}
                  </td>
                  {periods.map((p) => (
                    <MatrixCellView key={periodKey(p.year, p.month)} cell={cells[periodKey(p.year, p.month)]} />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm bg-green-50 ring-1 ring-green-200" /> Lunas</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm bg-yellow-50 ring-1 ring-yellow-200" /> Juara Umum</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm bg-amber-50 ring-1 ring-amber-200" /> Juara</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm bg-blue-50 ring-1 ring-blue-200" /> OSN</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm bg-orange-50 ring-1 ring-orange-200" /> Kurang Mampu</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-5 rounded-sm bg-slate-100 ring-1 ring-slate-200" /> Bebas SPP</span>
        <span className="flex items-center gap-1 text-slate-300">– Belum</span>
      </div>
    </div>
  );
}

function MatriksTab({ siswaId }: { siswaId: string }) {
  const query = useQuery<MatrixData>({
    queryKey: ['siswa', siswaId, 'matrix'],
    queryFn: async () => {
      const res = await fetch(`/api/v1/siswa/${siswaId}/matrix`);
      const json = await res.json() as { success: boolean; data?: MatrixData; error?: { message?: string } };
      if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Gagal memuat matriks');
      return json.data!;
    },
    enabled: Boolean(siswaId),
    staleTime: 30_000,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <LoadError
        message={query.error instanceof Error ? query.error.message : 'Gagal memuat data matriks.'}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!query.data || query.data.rombels.length === 0) {
    return (
      <Card>
        <CardContent className="flex min-h-[180px] items-center justify-center text-sm text-slate-500">
          Belum ada data matriks untuk siswa ini.
        </CardContent>
      </Card>
    );
  }

  return <SingleStudentMatrix data={query.data} />;
}

// ─── Tab: Keringanan ─────────────────────────────────────────────────────────

interface KeringananDto {
  id: string;
  siswaId: string;
  periodYear: number;
  periodMonth: number;
  jenis: string;
  persentase: number;
  catatan: string | null;
}

async function fetchKeringanan(siswaId: string): Promise<KeringananDto[]> {
  const params = new URLSearchParams({ siswaId, limit: '100' });
  const res = await fetch(`/api/v1/keringanan?${params.toString()}`);
  const json = await res.json() as { success: boolean; data?: KeringananDto[]; error?: { message?: string } };
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Gagal memuat keringanan');
  return json.data ?? [];
}

const KERINGANAN_MAP: Record<string, { label: string; cls: string }> = {
  JUARA_UMUM: { label: 'Juara Umum', cls: 'bg-yellow-50 text-yellow-700 ring-yellow-200' },
  JUARA: { label: 'Juara', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  OSN: { label: 'OSN', cls: 'bg-blue-50 text-blue-700 ring-blue-200' },
  BEASISWA: { label: 'Beasiswa', cls: 'bg-purple-50 text-purple-700 ring-purple-200' },
  KELUARGA_TIDAK_MAMPU: { label: 'Kurang Mampu', cls: 'bg-orange-50 text-orange-700 ring-orange-200' },
  LAINNYA: { label: 'Bebas SPP', cls: 'bg-slate-50 text-slate-700 ring-slate-200' },
};

function KeringananTab({ siswaId }: { siswaId: string }) {
  const query = useQuery<KeringananDto[]>({
    queryKey: ['keringanan', 'siswa', siswaId],
    queryFn: () => fetchKeringanan(siswaId),
    enabled: Boolean(siswaId),
    staleTime: 30_000,
  });

  const items = query.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {query.isLoading ? 'Memuat...' : `${items.length} data keringanan`}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href={`/keringanan?siswaId=${siswaId}`}>
            <Award className="mr-1.5 h-3.5 w-3.5" />
            Kelola Keringanan
          </Link>
        </Button>
      </div>

      {query.isError ? (
        <LoadError message="Gagal memuat data keringanan." onRetry={() => void query.refetch()} />
      ) : items.length === 0 && !query.isLoading ? (
        <Card>
          <CardContent className="flex min-h-[120px] items-center justify-center text-sm text-slate-500">
            Tidak ada keringanan untuk siswa ini.
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-auto rounded-md border border-slate-200 bg-white">
          <table className="w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">Periode</th>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">Jenis</th>
                <th className="border-b border-slate-200 px-3 py-2 text-right font-medium">Diskon</th>
                <th className="border-b border-slate-200 px-3 py-2 text-left font-medium">Catatan</th>
              </tr>
            </thead>
            <tbody>
              {items.map((k, i) => {
                const cfg = KERINGANAN_MAP[k.jenis] ?? { label: k.jenis, cls: 'bg-slate-50 text-slate-700 ring-slate-200' };
                return (
                  <tr key={k.id} className={i % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'}>
                    <td className="border-b border-slate-100 px-3 py-2 font-mono text-xs font-semibold text-slate-800">
                      {formatPeriod(k.periodYear, k.periodMonth)}
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2">
                      <span className={`inline-flex items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 text-right font-mono text-xs text-slate-700">
                      {k.persentase}%
                    </td>
                    <td className="border-b border-slate-100 px-3 py-2 max-w-[240px] text-xs text-slate-600">
                      {k.catatan
                        ? <span className="block truncate" title={k.catatan}>{k.catatan}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SiswaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const { data, isLoading, isError, error, refetch } = useSiswaDetail(id);

  if (!id) return null;

  if (isError) {
    const message = error instanceof Error ? error.message : 'Terjadi kesalahan saat memuat data siswa.';
    return (
      <div className="space-y-6">
        <PageHeader title="Detail Siswa" description="Gagal memuat data" />
        <LoadError message={message} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={data?.nama ?? 'Detail Siswa'}
        description={data ? `NIS ${data.nis} · Angkatan ${data.angkatan}` : 'Memuat data siswa...'}
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
            <TabsTrigger value="profil">
              <User className="mr-1.5 h-3.5 w-3.5" />
              Profil
            </TabsTrigger>
            <TabsTrigger value="pembayaran">
              <CreditCard className="mr-1.5 h-3.5 w-3.5" />
              Pembayaran
            </TabsTrigger>
            <TabsTrigger value="keringanan">
              <Award className="mr-1.5 h-3.5 w-3.5" />
              Keringanan
            </TabsTrigger>
            <TabsTrigger value="matriks">
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5" />
              Matriks
            </TabsTrigger>
          </TabsList>

          {/* ── Profil ── */}
          <TabsContent value="profil" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  Informasi Siswa
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {data.catatan && <CatatanBanner catatan={data.catatan} />}
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="NIS" value={data.nis} />
                  <Field label="Nama" value={data.nama} />
                  <Field label="Angkatan" value={data.angkatan} />
                  <Field
                    label="Jenis Kelamin"
                    value={data.jenisKelamin === 'L' ? 'Laki-laki' : data.jenisKelamin === 'P' ? 'Perempuan' : null}
                  />
                  <Field label="Status" value={data.statusSiswa} />
                  <Field label="Rombel Aktif" value={data.enrollmentAktif?.rombel?.kode ?? null} />
                  <Field label="Kontak Orang Tua" value={data.kontakOrtu} />
                  <Field label="Alamat" value={data.alamat} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Pembayaran ── */}
          <TabsContent value="pembayaran" className="mt-4">
            <PembayaranTab siswaId={id} catatanSiswa={data.catatan} />
          </TabsContent>

          {/* ── Keringanan ── */}
          <TabsContent value="keringanan" className="mt-4">
            <KeringananTab siswaId={id} />
          </TabsContent>

          {/* ── Matriks ── */}
          <TabsContent value="matriks" className="mt-4">
            <MatriksTab siswaId={id} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
