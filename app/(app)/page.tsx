'use client';

import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  CopyCheck,
  CreditCard,
  Download,
  FileBarChart,
  Minus,
  PercentSquare,
  TrendingUp,
  TriangleAlert,
  Upload,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/layouts/page-header';
import { StatCard, type StatCardTone } from '@/components/feedback/stat-card';
import { EmptyState } from '@/components/feedback/empty-state';
import { ActivityFeed, type ActivityItem } from '@/components/feedback/activity-feed';
// Recharts pulls ~200KB; defer so initial dashboard paint isn't blocked.
const LineChart = dynamic(
  () => import('@/components/charts/line-chart').then((m) => m.LineChart),
  { ssr: false, loading: () => <div className="h-[260px] w-full animate-pulse rounded bg-slate-100" /> },
) as typeof import('@/components/charts/line-chart').LineChart;
import { TunggakanTable } from '@/components/tables/tunggakan-table';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSummary } from '@/hooks/use-reports';
import { cn } from '@/lib/utils';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat('id-ID');

const percentFormatter = new Intl.NumberFormat('id-ID', {
  style: 'percent',
  maximumFractionDigits: 1,
});

function formatDeltaLabel(delta: number): { icon: typeof ArrowUpRight; tone: string; text: string } {
  if (!Number.isFinite(delta)) return { icon: Minus, tone: 'text-slate-500', text: '—' };
  if (delta > 0) {
    return {
      icon: ArrowUpRight,
      tone: 'text-emerald-700',
      text: `+${delta.toFixed(1)}% vs bulan lalu`,
    };
  }
  if (delta < 0) {
    return {
      icon: ArrowDownRight,
      tone: 'text-red-700',
      text: `${delta.toFixed(1)}% vs bulan lalu`,
    };
  }
  return { icon: Minus, tone: 'text-slate-500', text: 'Sama dengan bulan lalu' };
}

export default function DashboardPage() {
  const { data: summary, isLoading, error } = useSummary();

  const tahunAjaranSubtitle = summary?.tahunAjaran
    ? `Tahun Ajaran ${summary.tahunAjaran.kode}`
    : 'Belum ada tahun ajaran aktif.';

  const delta = summary ? formatDeltaLabel(summary.deltaPemasukan) : null;
  const DeltaIcon = delta?.icon ?? Minus;

  const kolektibilitasTone: StatCardTone = summary
    ? summary.kolektibilitas >= 90
      ? 'success'
      : summary.kolektibilitas >= 70
        ? 'default'
        : 'warning'
    : 'default';

  const tunggakanTone: StatCardTone = summary && summary.tunggakanSiswa > 0 ? 'warning' : 'default';

  const activityItems: ActivityItem[] = [
    ...(summary?.recentImports ?? []).map<ActivityItem>((b) => ({
      id: `import-${b.id}`,
      icon: Upload,
      title: b.fileName,
      description: `${b.successCount} baru · ${b.duplicateCount} duplikat · ${b.errorCount} error`,
      timestamp: b.uploadedAt,
      meta: b.uploadedBy,
      tone:
        b.status === 'COMPLETED'
          ? 'success'
          : b.status === 'FAILED'
            ? 'danger'
            : b.status === 'PARTIAL'
              ? 'warning'
              : 'default',
    })),
    ...(summary?.recentExports ?? []).map<ActivityItem>((e) => ({
      id: `export-${e.id}`,
      icon: Download,
      title: e.action.replace(/^EXPORT_/, 'Ekspor '),
      description: e.entity ? `${e.entity}${e.entityId ? ` · ${e.entityId}` : ''}` : undefined,
      timestamp: e.createdAt,
      meta: e.userNama,
      tone: 'default',
    })),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader title="Ringkasan" description={tahunAjaranSubtitle} />

      {error ? (
        <Card className="border-red-200 bg-red-50/60">
          <CardContent className="flex items-center gap-3 p-4 text-sm text-red-700">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
            Gagal memuat ringkasan dashboard. Silakan muat ulang halaman.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {isLoading || !summary ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          <>
            <StatCard
              label="Pemasukan Bulan Ini"
              value={rupiahFormatter.format(summary.pemasukanBulanIni)}
              hint={
                <span className={cn('inline-flex items-center gap-1 text-xs', delta?.tone)}>
                  <DeltaIcon className="h-3 w-3" aria-hidden="true" />
                  {delta?.text}
                </span>
              }
              icon={CreditCard}
            />
            <StatCard
              label="Siswa Aktif"
              value={numberFormatter.format(summary.siswaAktif)}
              hint="Status AKTIF di master data"
              icon={Users}
            />
            <StatCard
              label="Tunggakan > 1 Bulan"
              value={numberFormatter.format(summary.tunggakanSiswa)}
              hint="Berdasarkan periode berjalan"
              icon={CalendarDays}
              tone={tunggakanTone}
            />
            <StatCard
              label="Kolektibilitas"
              value={percentFormatter.format(summary.kolektibilitas / 100)}
              hint="Dibayar / ditagih pada tahun ajaran aktif"
              icon={PercentSquare}
              tone={kolektibilitasTone}
            />
            <Link
              href="/rekonsiliasi?duplikat=true"
              aria-label="Lihat detail duplikat bayar"
              className="group block h-full"
            >
              <StatCard
                className="h-full transition-shadow group-hover:shadow-md"
                label="Duplikat Bayar"
                value={numberFormatter.format(summary.duplikatBayar.transaksi)}
                hint={
                  <span className="text-xs text-slate-500">
                    {summary.duplikatBayar.siswa} siswa · {rupiahFormatter.format(summary.duplikatBayar.totalNominal)}
                  </span>
                }
                icon={CopyCheck}
                tone={summary.duplikatBayar.transaksi > 0 ? 'warning' : 'default'}
              />
            </Link>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="border-slate-200 lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
              <CardTitle className="text-base font-semibold">Pemasukan 12 Bulan Terakhir</CardTitle>
            </div>
            <CardDescription>
              Total pembayaran TERBAYAR per bulan (berdasarkan periode tagihan).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading || !summary ? (
              <Skeleton className="h-64 w-full" />
            ) : summary.pemasukan12Bulan.every((p) => p.total === 0) ? (
              <EmptyState
                icon={FileBarChart}
                title="Belum ada data pemasukan"
                description="Import pembayaran terlebih dahulu untuk melihat tren 12 bulan."
              />
            ) : (
              <LineChart
                data={summary.pemasukan12Bulan}
                xKey="label"
                yKey="total"
                ariaLabel="Pemasukan 12 bulan terakhir"
                tooltipLabelFormatter={(_label, payload) => {
                  const first = Array.isArray(payload) ? payload[0] : undefined;
                  const datum = (first as { payload?: { year?: number; month?: number; label?: string } } | undefined)
                    ?.payload;
                  if (datum?.year && datum.month && datum.label) {
                    return `${datum.label} ${datum.year}`;
                  }
                  return String(_label ?? '');
                }}
              />
            )}
          </CardContent>
        </Card>

        <Card className="border-slate-200">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Aktivitas Terakhir</CardTitle>
            <CardDescription>Import & ekspor terbaru oleh seluruh pengguna.</CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : (
              <ActivityFeed items={activityItems} emptyLabel="Belum ada aktivitas import/ekspor." />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold">10 Siswa Tunggakan Terlama</CardTitle>
            <CardDescription>
              Urut berdasarkan jumlah bulan tertunggak pada tahun ajaran aktif.
            </CardDescription>
          </div>
          <Link
            href="/laporan/tunggakan"
            aria-label="Lihat semua siswa dengan tunggakan"
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            Lihat semua
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </CardHeader>
        <CardContent>
          <TunggakanTable
            data={summary?.topTunggakan ?? []}
            isLoading={isLoading}
            pageSize={10}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SkeletonCard() {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-5">
        <div className="space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}
