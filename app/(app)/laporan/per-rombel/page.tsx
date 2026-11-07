'use client';

import { Suspense, useState, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Filter, Printer, Layers, Archive, Loader2, History } from 'lucide-react';

import { PageHeader } from '@/components/layouts/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { apiFetch } from '@/lib/http';
import { useTahunAjaranList } from '@/hooks/use-tahun-ajaran';
import { useRombelList } from '@/hooks/use-rombel';
import type { TahunAjaranDTO, RombelDTO } from '@/types/domain';
import type { PerRombelResult, PerRombelSiswaRow } from '@/app/api/v1/reports/per-rombel/route';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

type Grade = 'X' | 'XI' | 'XII';

function ProgressBar({ value }: { value: number }) {
  const clamped = Math.min(100, Math.max(0, value));
  const color =
    clamped >= 80
      ? 'bg-green-500'
      : clamped >= 50
        ? 'bg-amber-400'
        : 'bg-red-400';

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className="text-xs tabular-nums text-slate-500">{clamped}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    AKTIF: 'bg-green-100 text-green-700',
    PINDAH: 'bg-amber-100 text-amber-700',
    LULUS: 'bg-blue-100 text-blue-700',
    DO: 'bg-red-100 text-red-700',
    CUTI: 'bg-slate-100 text-slate-600',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

function SiswaTable({ data, isLoading }: { data: PerRombelSiswaRow[]; isLoading: boolean }) {
  if (isLoading) {
    return <p className="py-10 text-center text-sm text-slate-400">Memuat data...</p>;
  }
  if (data.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        Pilih rombel dan tahun ajaran untuk melihat data.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
            <th className="pb-2 pr-4 w-8">No</th>
            <th className="pb-2 pr-4">NIS</th>
            <th className="pb-2 pr-4">Nama Siswa</th>
            <th className="pb-2 pr-4">Status</th>
            <th className="pb-2 pr-4 text-right">Total Bayar</th>
            <th className="pb-2 pr-4 text-right">Tunggakan</th>
            <th className="pb-2">% Lunas</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.map((row, i) => (
            <tr key={row.siswaId} className="hover:bg-slate-50">
              <td className="py-2.5 pr-4 text-xs text-slate-400">{i + 1}</td>
              <td className="py-2.5 pr-4 font-mono text-xs">{row.nis}</td>
              <td className="py-2.5 pr-4 font-medium text-slate-900">{row.nama}</td>
              <td className="py-2.5 pr-4">
                <StatusBadge status={row.statusSiswa} />
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-xs">
                {rupiahFormatter.format(row.totalBayar)}
              </td>
              <td className="py-2.5 pr-4 text-right font-mono text-xs">
                {row.totalTunggakan > 0 ? (
                  <span className="text-red-600">{rupiahFormatter.format(row.totalTunggakan)}</span>
                ) : (
                  <span className="text-green-600">{rupiahFormatter.format(0)}</span>
                )}
              </td>
              <td className="py-2.5">
                <ProgressBar value={row.persentaseLunas} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LaporanPerRombelContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const tahunAjaranId = searchParams.get('tahunAjaranId') ?? '';
  const grade = (searchParams.get('grade') ?? '') as Grade | '';
  const rombelId = searchParams.get('rombelId') ?? '';

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    // Reset rombelId when grade changes
    if (key === 'grade') params.delete('rombelId');
    if (key === 'tahunAjaranId') { params.delete('grade'); params.delete('rombelId'); }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const { data: tahunAjaranList = [] } = useTahunAjaranList();

  // Derive active tahun ajaran for default
  const activeTahunAjaran = tahunAjaranList.find((ta) => ta.isActive) ?? tahunAjaranList[0];
  const effectiveTahunAjaranId = tahunAjaranId || activeTahunAjaran?.id || '';

  const { data: rombelData } = useRombelList(
    effectiveTahunAjaranId
      ? { tahunAjaranId: effectiveTahunAjaranId, grade: grade || undefined, limit: 100 }
      : {},
  );
  const rombelList: RombelDTO[] = rombelData?.items ?? [];

  // Fetch report
  const { data: report, isLoading: reportLoading } = useQuery({
    queryKey: ['reports', 'per-rombel', rombelId, effectiveTahunAjaranId],
    queryFn: () =>
      apiFetch<PerRombelResult>('/api/v1/reports/per-rombel', {
        searchParams: { rombelId, tahunAjaranId: effectiveTahunAjaranId },
      }),
    enabled: !!rombelId && !!effectiveTahunAjaranId,
  });

  const siswaRows = report?.siswa ?? [];
  const totalBayar = siswaRows.reduce((acc, r) => acc + r.totalBayar, 0);
  const totalTunggakan = siswaRows.reduce((acc, r) => acc + r.totalTunggakan, 0);
  const avgLunas =
    siswaRows.length > 0
      ? Math.round(siswaRows.reduce((acc, r) => acc + r.persentaseLunas, 0) / siswaRows.length)
      : 0;

  const [zipLoading, setZipLoading] = useState(false);

  function handlePrintRombel() {
    if (!rombelId || !effectiveTahunAjaranId) return;
    const url = `/api/v1/reports/per-rombel/pdf?rombelId=${rombelId}&tahunAjaranId=${effectiveTahunAjaranId}`;
    window.open(url, '_blank');
  }

  function handlePrintGrade() {
    if (!grade || !effectiveTahunAjaranId) return;
    const url = `/api/v1/reports/per-rombel/pdf?grade=${grade}&tahunAjaranId=${effectiveTahunAjaranId}`;
    window.open(url, '_blank');
  }

  function handlePrintHistory() {
    if (!rombelId || !effectiveTahunAjaranId) return;
    const url = `/api/v1/reports/per-rombel/pdf?rombelId=${rombelId}&tahunAjaranId=${effectiveTahunAjaranId}&mode=history`;
    window.open(url, '_blank');
  }

  const handleZipDownload = useCallback(async () => {
    if (!rombelId) return;
    setZipLoading(true);
    try {
      const params = new URLSearchParams({ rombelId });
      if (effectiveTahunAjaranId) params.set('tahunAjaranId', effectiveTahunAjaranId);
      const res = await fetch(`/api/v1/kwitansi/bulk-pdf?${params.toString()}`);
      if (!res.ok) {
        const json = await res.json().catch(() => null) as { error?: { message?: string } } | null;
        toast.error(json?.error?.message ?? 'Gagal mengunduh ZIP kwitansi.');
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') ?? '';
      const match = cd.match(/filename="([^"]+)"/);
      a.download = match?.[1] ?? 'Kwitansi_Rombel.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Gagal mengunduh ZIP kwitansi.');
    } finally {
      setZipLoading(false);
    }
  }, [rombelId, effectiveTahunAjaranId]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laporan Per Rombel"
        description="Ringkasan pembayaran Sumbangan Komite per siswa dalam satu rombel."
      />

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Filter</CardTitle>
          </div>
          <CardDescription>Pilih tahun ajaran, grade, dan rombel.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Tahun Ajaran</Label>
              <Select
                value={effectiveTahunAjaranId}
                onValueChange={(v) => setFilter('tahunAjaranId', v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tahun ajaran..." />
                </SelectTrigger>
                <SelectContent>
                  {tahunAjaranList.map((ta: TahunAjaranDTO) => (
                    <SelectItem key={ta.id} value={ta.id}>
                      {ta.kode}
                      {ta.isActive && ' (aktif)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Grade</Label>
              <Select
                value={grade}
                onValueChange={(v) => setFilter('grade', v)}
                disabled={!effectiveTahunAjaranId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih grade..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="X">Kelas X</SelectItem>
                  <SelectItem value="XI">Kelas XI</SelectItem>
                  <SelectItem value="XII">Kelas XII</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rombel</Label>
              <Select
                value={rombelId}
                onValueChange={(v) => setFilter('rombelId', v)}
                disabled={!grade}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pilih rombel..." />
                </SelectTrigger>
                <SelectContent>
                  {rombelList.map((r: RombelDTO) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.kode}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {report && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Total Bayar</p>
              <p className="mt-1 font-mono text-lg font-semibold">{rupiahFormatter.format(totalBayar)}</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Total Tunggakan</p>
              <p className={`mt-1 font-mono text-lg font-semibold ${totalTunggakan > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {rupiahFormatter.format(totalTunggakan)}
              </p>
            </CardContent>
          </Card>
          <Card className="border-slate-200">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">Rata-rata Ketuntasan</p>
              <p className="mt-1 font-mono text-lg font-semibold">{avgLunas}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">
              Daftar Siswa
              {report && ` — ${report.rombelKode} (${siswaRows.length} siswa)`}
            </CardTitle>
            {report && (
              <CardDescription>
                Tahun Ajaran {report.tahunAjaranKode} · {report.totalBulan} bulan tagihan
              </CardDescription>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintRombel}
              disabled={!rombelId || !effectiveTahunAjaranId}
              title="Cetak laporan TA aktif untuk rombel ini (1 lembar F4)"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              Cetak Rombel
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintHistory}
              disabled={!rombelId || !effectiveTahunAjaranId}
              title="Cetak riwayat lintas TA (X=1, XI=2, XII=3 lembar)"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              Cetak Riwayat
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintGrade}
              disabled={!grade || !effectiveTahunAjaranId}
              title="Cetak semua rombel di tingkat yang sama (1 lembar per rombel)"
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              Cetak Semua Kelas {grade || ''}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleZipDownload()}
              disabled={!rombelId || zipLoading}
            >
              {zipLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Archive className="h-4 w-4" aria-hidden="true" />
              )}
              {zipLoading ? 'Mengunduh...' : 'Download Kwitansi ZIP'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <SiswaTable data={siswaRows} isLoading={reportLoading && !!rombelId} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function LaporanPerRombelPage() {
  return (
    <Suspense>
      <LaporanPerRombelContent />
    </Suspense>
  );
}
