'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Filter, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader } from '@/components/layouts/page-header';
import { AuditLogTable } from '@/components/tables/audit-log-table';
import { useAuditLog, type UseAuditLogParams } from '@/hooks/use-audit-log';

const PAGE_SIZE = 50;

export default function LaporanAuditPage() {
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [dateError, setDateError] = useState('');
  const [page, setPage] = useState(1);
  const [params, setParams] = useState<UseAuditLogParams>({ page: 1, limit: PAGE_SIZE });

  function applyFilter() {
    if (dateFrom && dateTo && dateTo < dateFrom) {
      setDateError('Tanggal akhir harus sama dengan atau setelah tanggal awal.');
      return;
    }
    setDateError('');
    setPage(1);
    setParams({
      action: action.trim() || undefined,
      entity: entity.trim() || undefined,
      dateFrom: dateFrom.trim() || undefined,
      dateTo: dateTo.trim() || undefined,
      page: 1,
      limit: PAGE_SIZE,
    });
  }

  function goToPage(next: number) {
    setPage(next);
    setParams((prev) => ({ ...prev, page: next }));
  }

  const { data, isLoading, isFetching } = useAuditLog(params);

  const rows = data ?? [];
  const hasNext = rows.length >= PAGE_SIZE;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Laporan Audit"
        description="Riwayat aktivitas pengguna dalam sistem pembayaran SPP."
      />
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Filter Audit Log</CardTitle>
          </div>
          <CardDescription>
            Pengguna non-SUPER_ADMIN hanya dapat melihat audit log miliknya sendiri.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
            <div className="space-y-1.5">
              <Label htmlFor="action">Aksi</Label>
              <Input
                id="action"
                placeholder="EXPORT_PDF"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                aria-label="Filter berdasarkan aksi"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="entity">Entitas</Label>
              <Input
                id="entity"
                placeholder="Pembayaran"
                value={entity}
                onChange={(e) => setEntity(e.target.value)}
                aria-label="Filter berdasarkan entitas"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateFrom">Dari</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setDateError('');
                }}
                aria-label="Tanggal awal"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dateTo">Sampai</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setDateError('');
                }}
                aria-label="Tanggal akhir"
              />
            </div>
            <div className="flex flex-col justify-end gap-1">
              <Button variant="secondary" onClick={applyFilter} disabled={isFetching}>
                Terapkan
              </Button>
              {dateError && (
                <p className="text-xs text-destructive">{dateError}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Audit Log</CardTitle>
          </div>
          <CardDescription>
            {rows.length} entri · terurut dari paling baru.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogTable data={rows} isLoading={isLoading} pageSize={20} />
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={page <= 1 || isFetching}
          onClick={() => goToPage(page - 1)}
          aria-label="Halaman sebelumnya"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="tabular-nums">Hal {page}</span>
        <Button
          variant="outline"
          size="sm"
          className="h-8 w-8 p-0"
          disabled={!hasNext || isFetching}
          onClick={() => goToPage(page + 1)}
          aria-label="Halaman berikutnya"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
