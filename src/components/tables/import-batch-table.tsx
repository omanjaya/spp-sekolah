'use client';

import { Fragment, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  Loader2,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { DataTable } from '@/components/tables/data-table';
import { EmptyState } from '@/components/feedback/empty-state';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface ImportBatchTableRow {
  id: string;
  fileName: string;
  fileSize: number;
  uploadedAt: string;
  uploadedByNama: string;
  totalRows: number;
  successCount: number;
  duplicateCount: number;
  errorCount: number;
  status: string;
  errorDetails: unknown;
}

interface ImportBatchTableProps {
  data: ImportBatchTableRow[];
  isLoading?: boolean;
  pageSize?: number;
}

const STATUS_META: Record<
  string,
  { label: string; variant: BadgeProps['variant']; icon: LucideIcon }
> = {
  PENDING: { label: 'Menunggu', variant: 'outline', icon: Clock },
  PROCESSING: { label: 'Memproses', variant: 'secondary', icon: Loader2 },
  COMPLETED: { label: 'Berhasil', variant: 'success', icon: CheckCircle2 },
  FAILED: { label: 'Gagal', variant: 'destructive', icon: XCircle },
  PARTIAL: { label: 'Sebagian', variant: 'warning', icon: TriangleAlert },
};

const dateFormatter = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImportBatchTable({ data, isLoading, pageSize = 20 }: ImportBatchTableProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const columns = useMemo<ColumnDef<ImportBatchTableRow>[]>(
    () => [
      {
        id: 'expand',
        header: '',
        cell: ({ row }) => {
          const isOpen = Boolean(expanded[row.original.id]);
          const Icon = isOpen ? ChevronDown : ChevronRight;
          return (
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [row.original.id]: !prev[row.original.id] }))
              }
              aria-label={isOpen ? 'Tutup detail' : 'Buka detail'}
              className="flex h-6 w-6 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100"
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
            </button>
          );
        },
      },
      {
        accessorKey: 'fileName',
        header: 'File',
        cell: ({ row }) => (
          <div className="min-w-0 space-y-0.5">
            <p className="truncate text-sm font-medium text-slate-900">{row.original.fileName}</p>
            <p className="text-xs text-slate-500">{formatSize(row.original.fileSize)}</p>
          </div>
        ),
      },
      {
        accessorKey: 'uploadedAt',
        header: 'Waktu',
        cell: ({ row }) => (
          <span className="text-xs text-slate-600">
            {dateFormatter.format(new Date(row.original.uploadedAt))}
          </span>
        ),
      },
      {
        accessorKey: 'uploadedByNama',
        header: 'Oleh',
        cell: ({ row }) => <span className="text-sm text-slate-700">{row.original.uploadedByNama}</span>,
      },
      {
        accessorKey: 'totalRows',
        header: 'Baris',
        cell: ({ row }) => (
          <div className="text-xs text-slate-600">
            <span className="font-mono tabular-nums text-slate-900">{row.original.totalRows}</span>{' '}
            total
            <div className="flex gap-2 text-[11px]">
              <span className="text-emerald-700">+{row.original.successCount}</span>
              <span className="text-amber-700">~{row.original.duplicateCount}</span>
              <span className="text-red-700">×{row.original.errorCount}</span>
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const meta = STATUS_META[row.original.status] ?? {
            label: row.original.status,
            variant: 'outline' as const,
            icon: AlertCircle,
          };
          const Icon = meta.icon;
          return (
            <Badge variant={meta.variant} className="gap-1">
              <Icon
                className={cn('h-3 w-3', row.original.status === 'PROCESSING' && 'animate-spin')}
                aria-hidden="true"
              />
              {meta.label}
            </Badge>
          );
        },
      },
    ],
    [expanded],
  );

  // Inject expanded detail rows by rendering them via a custom row wrapper.
  // Simpler: show expanded details under the DataTable when a row is expanded.
  const expandedRows = data.filter((r) => expanded[r.id]);

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={data}
        isLoading={isLoading}
        pageSize={pageSize}
        emptyState={
          <EmptyState
            icon={Inbox}
            title="Belum ada riwayat import"
            description="Upload Excel pembayaran untuk mulai mencatat riwayat import."
          />
        }
      />
      {expandedRows.length > 0 ? (
        <div className="space-y-3">
          {expandedRows.map((r) => (
            <div
              key={`detail-${r.id}`}
              className="rounded-md border border-slate-200 bg-slate-50/60 p-4 text-sm"
            >
              <div className="mb-2 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-600">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Detail Error — {r.fileName}
              </div>
              <ErrorDetails details={r.errorDetails} />
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ErrorDetails({ details }: { details: unknown }) {
  if (!details) {
    return <p className="text-xs text-slate-500">Tidak ada detail error tercatat.</p>;
  }
  if (Array.isArray(details)) {
    return (
      <ul className="space-y-1">
        {details.slice(0, 50).map((entry, idx) => (
          <li key={idx} className="font-mono text-[11px] text-slate-700">
            <Fragment>{typeof entry === 'string' ? entry : JSON.stringify(entry)}</Fragment>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <pre className="max-h-64 overflow-auto rounded bg-white p-2 text-[11px] text-slate-700 ring-1 ring-slate-200">
      {JSON.stringify(details, null, 2)}
    </pre>
  );
}
