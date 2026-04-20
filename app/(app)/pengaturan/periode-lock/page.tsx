'use client';

import { Lock, Loader2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { apiFetch } from '@/lib/http';
import { HttpError } from '@/lib/http';
import type { PeriodeLockDto } from '@/services/periode-lock.service';

const MONTH_NAMES: Record<number, string> = {
  1: 'Januari', 2: 'Februari', 3: 'Maret', 4: 'April',
  5: 'Mei', 6: 'Juni', 7: 'Juli', 8: 'Agustus',
  9: 'September', 10: 'Oktober', 11: 'November', 12: 'Desember',
};

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => CURRENT_YEAR - 5 + i);
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function formatPeriode(year: number, month: number): string {
  return `${MONTH_NAMES[month] ?? month} ${year}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function PeriodeLockPage() {
  const queryClient = useQueryClient();

  const [selectedYear, setSelectedYear] = useState<string>(String(CURRENT_YEAR));
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [catatan, setCatatan] = useState('');

  const { data: locks, isLoading } = useQuery<PeriodeLockDto[]>({
    queryKey: ['periode-lock'],
    queryFn: () => apiFetch<PeriodeLockDto[]>('/api/v1/periode-lock'),
  });

  const lockMutation = useMutation({
    mutationFn: (body: { periodYear: number; periodMonth: number; catatan?: string }) =>
      apiFetch<PeriodeLockDto>('/api/v1/periode-lock', {
        method: 'POST',
        body,
      }),
    onSuccess: (data) => {
      toast.success(`Periode ${formatPeriode(data.periodYear, data.periodMonth)} berhasil dikunci.`);
      void queryClient.invalidateQueries({ queryKey: ['periode-lock'] });
      setSelectedMonth('');
      setCatatan('');
    },
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal mengunci periode.';
      toast.error(msg);
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (yearMonth: string) =>
      apiFetch<{ message: string }>(`/api/v1/periode-lock/${yearMonth}`, { method: 'DELETE' }),
    onSuccess: (_data, yearMonth) => {
      toast.success(`Periode ${yearMonth} berhasil dibuka.`);
      void queryClient.invalidateQueries({ queryKey: ['periode-lock'] });
    },
    onError: (err) => {
      const msg = err instanceof HttpError ? err.message : 'Gagal membuka kunci periode.';
      toast.error(msg);
    },
  });

  function handleLock() {
    if (!selectedYear || !selectedMonth) {
      toast.error('Pilih tahun dan bulan terlebih dahulu.');
      return;
    }
    lockMutation.mutate({
      periodYear: Number(selectedYear),
      periodMonth: Number(selectedMonth),
      catatan: catatan.trim() || undefined,
    });
  }

  function handleUnlock(year: number, month: number) {
    const mm = String(month).padStart(2, '0');
    unlockMutation.mutate(`${year}-${mm}`);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kunci Periode"
        description="Kunci periode akuntansi agar pembayaran tidak bisa ditambah, diubah, atau dibatalkan."
      />

      {/* Form kunci periode baru */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Kunci Periode Baru</CardTitle>
          <CardDescription>
            Setelah dikunci, tidak ada pembayaran yang bisa dibuat atau diubah pada periode tersebut.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormFieldWrapper label="Tahun">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih tahun" />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>

            <FormFieldWrapper label="Bulan">
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih bulan" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {MONTH_NAMES[m]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormFieldWrapper>
          </div>

          <FormFieldWrapper label="Catatan (opsional)">
            <Textarea
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              placeholder="Alasan penguncian periode..."
              rows={2}
            />
          </FormFieldWrapper>

          <div className="flex justify-end">
            <Button
              onClick={handleLock}
              disabled={lockMutation.isPending || !selectedYear || !selectedMonth}
            >
              {lockMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Lock className="mr-2 h-4 w-4" aria-hidden="true" />
              )}
              Kunci Periode
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabel periode terkunci */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Periode Terkunci</CardTitle>
          <CardDescription>
            Daftar semua periode yang saat ini dikunci.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              <span>Memuat...</span>
            </div>
          ) : !locks || locks.length === 0 ? (
            <p className="text-sm text-slate-500">Belum ada periode yang dikunci.</p>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Periode</TableHead>
                  <TableHead>Dikunci Oleh</TableHead>
                  <TableHead>Tanggal Kunci</TableHead>
                  <TableHead>Catatan</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {locks.map((lock) => {
                  const mm = String(lock.periodMonth).padStart(2, '0');
                  const yearMonth = `${lock.periodYear}-${mm}`;
                  return (
                    <TableRow key={lock.id}>
                      <TableCell className="font-medium">
                        {formatPeriode(lock.periodYear, lock.periodMonth)}
                      </TableCell>
                      <TableCell>{lock.lockedByNama ?? lock.lockedById}</TableCell>
                      <TableCell className="text-slate-600">
                        {formatDate(lock.lockedAt)}
                      </TableCell>
                      <TableCell className="max-w-xs truncate text-slate-600">
                        {lock.catatan ?? '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleUnlock(lock.periodYear, lock.periodMonth)}
                          disabled={unlockMutation.isPending && unlockMutation.variables === yearMonth}
                          aria-label={`Buka kunci periode ${formatPeriode(lock.periodYear, lock.periodMonth)}`}
                        >
                          {unlockMutation.isPending && unlockMutation.variables === yearMonth ? (
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
