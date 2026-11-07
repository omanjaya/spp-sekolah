'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Download, Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layouts/page-header';
import { TunggakanTable } from '@/components/tables/tunggakan-table';
import { useTunggakan, type UseTunggakanParams } from '@/hooks/use-reports';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function triggerCsvDownload(filename: string, rows: string[][]) {
  const csv = rows.map((r) => r.map(escapeCsv).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function LaporanTunggakanContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Read filter values from URL
  const angkatanInput = searchParams.get('angkatan') ?? '';
  const rombelInput = searchParams.get('rombelId') ?? '';
  const minBulanInput = searchParams.get('minBulan') ?? '2';

  // Update URL when a filter key changes
  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Derive query params from URL
  const angkatanNum = angkatanInput ? Number(angkatanInput) : undefined;
  const minBulanNum = minBulanInput ? Number(minBulanInput) : undefined;
  const queryParams: UseTunggakanParams = {
    angkatan: angkatanNum && !Number.isNaN(angkatanNum) ? angkatanNum : undefined,
    rombelId: rombelInput.trim() || undefined,
    minBulan: minBulanNum && !Number.isNaN(minBulanNum) ? minBulanNum : undefined,
    limit: 500,
  };

  const { data, isLoading, isFetching } = useTunggakan(queryParams);
  const rows = data ?? [];

  const totalTunggakan = rows.reduce((acc, r) => acc + r.totalTunggakan, 0);

  const handleExport = () => {
    const header = ['NIS', 'Nama', 'Angkatan', 'Rombel', 'Bulan Tunggak', 'Periode Terlama', 'Estimasi Tunggakan'];
    const csv: string[][] = [
      header,
      ...rows.map((r) => [
        r.nis,
        r.nama,
        String(r.angkatan),
        r.rombelKode ?? '',
        String(r.bulanTunggak),
        r.periodeTerlama ?? '',
        String(r.totalTunggakan),
      ]),
    ];
    const stamp = new Date().toISOString().slice(0, 10);
    triggerCsvDownload(`tunggakan-${stamp}.csv`, csv);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laporan Tunggakan"
        description="Daftar siswa dengan tunggakan Sumbangan Komite berdasarkan filter angkatan dan rombel."
      />
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Filter</CardTitle>
          </div>
          <CardDescription>Saring berdasarkan angkatan, rombel, atau jumlah bulan minimal tertunggak.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="angkatan">Angkatan</Label>
              <Input
                id="angkatan"
                inputMode="numeric"
                placeholder="2023"
                value={angkatanInput}
                onChange={(e) => setFilter('angkatan', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rombel">Rombel ID</Label>
              <Input
                id="rombel"
                placeholder="opsional"
                value={rombelInput}
                onChange={(e) => setFilter('rombelId', e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="minBulan">Min. Bulan</Label>
              <Input
                id="minBulan"
                inputMode="numeric"
                placeholder="2"
                value={minBulanInput}
                onChange={(e) => setFilter('minBulan', e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.replace(pathname, { scroll: false })}
                disabled={isFetching || (!angkatanInput && !rombelInput && minBulanInput === '2')}
              >
                Reset Filter
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">
              Daftar Tunggakan ({rows.length}{rows.length >= 500 ? ' — batas maks. 500 data' : ''})
            </CardTitle>
            <CardDescription>
              Total estimasi tunggakan:{' '}
              <span className="font-mono tabular-nums text-slate-900">
                {rupiahFormatter.format(totalTunggakan)}
              </span>
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={rows.length === 0}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent>
          <TunggakanTable data={rows} isLoading={isLoading} pageSize={20} />
        </CardContent>
      </Card>
    </div>
  );
}

export default function LaporanTunggakanPage() {
  return (
    <Suspense>
      <LaporanTunggakanContent />
    </Suspense>
  );
}
