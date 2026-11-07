'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowUpRight, TriangleAlert } from 'lucide-react';
import { DataTable } from '@/components/tables/data-table';
import { EmptyState } from '@/components/feedback/empty-state';
import { Badge } from '@/components/ui/badge';

export interface TunggakanTableRow {
  siswaId: string;
  nis: string;
  nama: string;
  angkatan: number;
  rombelKode: string | null;
  bulanTunggak: number;
  totalTunggakan: number;
  periodeTerlama: string | null;
}

interface TunggakanTableProps {
  data: TunggakanTableRow[];
  isLoading?: boolean;
  pageSize?: number;
  showSiswaLink?: boolean;
}

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

export function TunggakanTable({
  data,
  isLoading,
  pageSize = 20,
  showSiswaLink = true,
}: TunggakanTableProps) {
  const columns = useMemo<ColumnDef<TunggakanTableRow>[]>(
    () => [
      {
        accessorKey: 'nis',
        header: 'NIS',
        cell: ({ row }) => (
          <span className="font-mono text-xs tabular-nums text-slate-700">{row.original.nis}</span>
        ),
      },
      {
        accessorKey: 'nama',
        header: 'Nama',
        cell: ({ row }) => (
          <div className="min-w-0 space-y-0.5">
            <p className="text-sm font-medium text-slate-900">{row.original.nama}</p>
            <p className="text-xs text-slate-500">
              Angkatan {row.original.angkatan}
              {row.original.rombelKode ? ` · Kelas ${row.original.rombelKode}` : ''}
            </p>
          </div>
        ),
      },
      {
        accessorKey: 'bulanTunggak',
        header: 'Bulan',
        cell: ({ row }) => (
          <Badge variant={row.original.bulanTunggak >= 3 ? 'destructive' : 'warning'}>
            {row.original.bulanTunggak} bln
          </Badge>
        ),
      },
      {
        accessorKey: 'periodeTerlama',
        header: 'Sejak',
        cell: ({ row }) => (
          <span className="text-xs text-slate-600">{row.original.periodeTerlama ?? '—'}</span>
        ),
      },
      {
        accessorKey: 'totalTunggakan',
        header: 'Estimasi',
        cell: ({ row }) => (
          <span className="font-mono tabular-nums text-sm text-slate-900">
            {rupiahFormatter.format(row.original.totalTunggakan)}
          </span>
        ),
      },
      ...(showSiswaLink
        ? [
            {
              id: 'actions',
              header: '',
              cell: ({ row }) => (
                <Link
                  href={`/siswa/${row.original.siswaId}`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                  aria-label={`Buka detail ${row.original.nama}`}
                >
                  Detail
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              ),
            } satisfies ColumnDef<TunggakanTableRow>,
          ]
        : []),
    ],
    [showSiswaLink],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      pageSize={pageSize}
      emptyState={
        <EmptyState
          icon={TriangleAlert}
          title="Tidak ada tunggakan"
          description="Semua siswa dalam filter ini telah terbayar pada periode aktif."
        />
      }
    />
  );
}
