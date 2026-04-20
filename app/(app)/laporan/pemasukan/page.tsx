'use client';

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { FileBarChart, Filter, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
// Recharts pulls ~200KB; defer so page TTI isn't blocked by chart bundle.
const LineChart = dynamic(
  () => import('@/components/charts/line-chart').then((m) => m.LineChart),
  { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded bg-slate-100" /> },
) as typeof import('@/components/charts/line-chart').LineChart;
import { EmptyState } from '@/components/feedback/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { usePemasukan } from '@/hooks/use-reports';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('id-ID');

export default function LaporanPemasukanPage() {
  const now = new Date();
  const [yearInput, setYearInput] = useState(String(now.getUTCFullYear()));
  const [monthInput, setMonthInput] = useState(String(now.getUTCMonth() + 1));

  const params = useMemo(() => {
    const y = Number(yearInput);
    const m = Number(monthInput);
    return {
      year: y && !Number.isNaN(y) ? y : undefined,
      month: m && !Number.isNaN(m) ? m : undefined,
    };
  }, [yearInput, monthInput]);

  const { data, isLoading, refetch, isFetching } = usePemasukan(params);
  const chartData = data?.series12Bulan ?? [];
  const hasChartData = chartData.some((p) => p.total > 0);

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Periode</CardTitle>
          </div>
          <CardDescription>Pilih tahun dan bulan untuk melihat breakdown per cabang.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="year">Tahun</Label>
              <Input
                id="year"
                inputMode="numeric"
                placeholder="2025"
                value={yearInput}
                onChange={(e) => setYearInput(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="month">Bulan (1-12)</Label>
              <Input
                id="month"
                inputMode="numeric"
                placeholder="1"
                value={monthInput}
                onChange={(e) => setMonthInput(e.target.value)}
              />
            </div>
            <div className="flex items-end gap-2">
              <Button variant="secondary" onClick={() => void refetch()} disabled={isFetching}>
                Terapkan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Tren 12 Bulan Terakhir</CardTitle>
          </div>
          <CardDescription>Total pemasukan TERBAYAR per periode tagihan.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : !hasChartData ? (
            <EmptyState
              icon={FileBarChart}
              title="Belum ada data pemasukan"
              description="Import atau input pembayaran terlebih dahulu."
            />
          ) : (
            <LineChart data={chartData} xKey="label" yKey="total" />
          )}
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">
            Breakdown per Cabang
            {data?.year ? ` — ${data.year}` : ''}
            {data?.month ? `/${String(data.month).padStart(2, '0')}` : ''}
          </CardTitle>
          <CardDescription>
            Total {numberFormatter.format(data?.transaksi ?? 0)} transaksi ·{' '}
            {rupiahFormatter.format(data?.totalAmount ?? 0)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : !data || data.breakdown.length === 0 ? (
            <EmptyState
              icon={FileBarChart}
              title="Tidak ada transaksi"
              description="Tidak ada pembayaran yang tercatat untuk periode ini."
            />
          ) : (
            <div className="overflow-x-auto overflow-hidden rounded-md border border-slate-200 bg-white">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/60">
                    <TableHead>Kode Cabang</TableHead>
                    <TableHead className="text-right">Transaksi</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Biaya Adm</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.breakdown.map((row) => (
                    <TableRow key={row.kodeCabang}>
                      <TableCell className="font-mono text-xs text-slate-700">
                        {row.kodeCabang}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-slate-700">
                        {numberFormatter.format(row.transaksi)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-slate-900">
                        {rupiahFormatter.format(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-slate-600">
                        {rupiahFormatter.format(row.totalAdm)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
