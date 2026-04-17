'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { History } from 'lucide-react';
import { DataTable } from '@/components/tables/data-table';
import { EmptyState } from '@/components/feedback/empty-state';
import { Badge } from '@/components/ui/badge';

export interface AuditLogTableRow {
  id: string;
  userNama: string;
  action: string;
  entity: string | null;
  entityId: string | null;
  metadata: unknown;
  ipAddress: string | null;
  createdAt: string;
}

interface AuditLogTableProps {
  data: AuditLogTableRow[];
  isLoading?: boolean;
  pageSize?: number;
}

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

export function AuditLogTable({ data, isLoading, pageSize = 20 }: AuditLogTableProps) {
  const columns = useMemo<ColumnDef<AuditLogTableRow>[]>(
    () => [
      {
        accessorKey: 'createdAt',
        header: 'Waktu',
        cell: ({ row }) => (
          <span className="font-mono text-[11px] tabular-nums text-slate-700">
            {dateFormatter.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
      {
        accessorKey: 'userNama',
        header: 'Pengguna',
        cell: ({ row }) => (
          <span className="text-sm text-slate-900">{row.original.userNama}</span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Aksi',
        cell: ({ row }) => <Badge variant="outline">{row.original.action}</Badge>,
      },
      {
        accessorKey: 'entity',
        header: 'Entitas',
        cell: ({ row }) => (
          <div className="text-xs text-slate-600">
            {row.original.entity ? (
              <>
                <span className="font-medium text-slate-700">{row.original.entity}</span>
                {row.original.entityId ? (
                  <span className="ml-1 font-mono text-[11px] text-slate-500">
                    #{row.original.entityId.slice(0, 8)}
                  </span>
                ) : null}
              </>
            ) : (
              '—'
            )}
          </div>
        ),
      },
      {
        accessorKey: 'ipAddress',
        header: 'IP',
        cell: ({ row }) => (
          <span className="font-mono text-[11px] text-slate-500">
            {row.original.ipAddress ?? '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      pageSize={pageSize}
      emptyState={
        <EmptyState
          icon={History}
          title="Belum ada catatan audit"
          description="Semua aksi penting akan terekam di sini untuk audit trail."
        />
      }
    />
  );
}
