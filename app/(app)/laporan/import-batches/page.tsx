'use client';

import { useState } from 'react';
import { Filter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ImportBatchTable } from '@/components/tables/import-batch-table';
import { useImportBatches } from '@/hooks/use-reports';

const STATUS_OPTIONS = [
  { value: 'ALL', label: 'Semua' },
  { value: 'PENDING', label: 'Menunggu' },
  { value: 'PROCESSING', label: 'Memproses' },
  { value: 'COMPLETED', label: 'Berhasil' },
  { value: 'FAILED', label: 'Gagal' },
  { value: 'PARTIAL', label: 'Sebagian' },
];

export default function LaporanImportBatchesPage() {
  const [status, setStatus] = useState<string>('ALL');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch, isFetching } = useImportBatches({
    status: status === 'ALL' ? undefined : status,
    page,
    limit: 20,
  });

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-500" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Filter Riwayat Import</CardTitle>
          </div>
          <CardDescription>Klik baris untuk melihat detail error (jika ada).</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger id="status">
                  <SelectValue placeholder="Pilih status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setPage(1);
                  void refetch();
                }}
                disabled={isFetching}
              >
                Terapkan
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Riwayat Import</CardTitle>
          <CardDescription>
            {data?.length ?? 0} batch pada halaman ini · klik ikon panah untuk membuka detail error.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ImportBatchTable data={data ?? []} isLoading={isLoading} pageSize={20} />
        </CardContent>
      </Card>
    </div>
  );
}
