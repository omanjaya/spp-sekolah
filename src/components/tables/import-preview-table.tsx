'use client';

import {
  AlertTriangle,
  CheckCircle2,
  FileWarning,
  ShieldQuestion,
  XCircle,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import type { AnalyzedRow, PreviewCounts, RowStatus } from '@/services/import.service';
import type { ImportAction } from '@/lib/validators/import.schema';

export type SelectionState = Record<number, { selected: boolean; action: ImportAction }>;

interface ImportPreviewTableProps {
  rows: AnalyzedRow[];
  counts: PreviewCounts;
  selections: SelectionState;
  onSelectionsChange: (next: SelectionState) => void;
}

type TabKey = 'SEMUA' | RowStatus;

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'SEMUA', label: 'Semua' },
  { key: 'BARU', label: 'Baru' },
  { key: 'DUPLIKAT_NO_BUKTI', label: 'Duplikat No.Bukti' },
  { key: 'DUPLIKAT_PERIODE', label: 'Duplikat Periode' },
  { key: 'NIS_TIDAK_DIKENAL', label: 'NIS Tidak Dikenal' },
  { key: 'INVALID', label: 'Invalid' },
];

function statusBadge(status: RowStatus): ReactNode {
  const config: Record<
    RowStatus,
    { label: string; variant: 'default' | 'success' | 'warning' | 'destructive' | 'secondary'; icon: ReactNode }
  > = {
    BARU: {
      label: 'Baru',
      variant: 'success',
      icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />,
    },
    DUPLIKAT_NO_BUKTI: {
      label: 'Dup. No.Bukti',
      variant: 'secondary',
      icon: <FileWarning className="h-3 w-3" aria-hidden="true" />,
    },
    DUPLIKAT_PERIODE: {
      label: 'Dup. Periode',
      variant: 'warning',
      icon: <AlertTriangle className="h-3 w-3" aria-hidden="true" />,
    },
    NIS_TIDAK_DIKENAL: {
      label: 'NIS ?',
      variant: 'warning',
      icon: <ShieldQuestion className="h-3 w-3" aria-hidden="true" />,
    },
    INVALID: {
      label: 'Invalid',
      variant: 'destructive',
      icon: <XCircle className="h-3 w-3" aria-hidden="true" />,
    },
  };
  const c = config[status];
  return (
    <Badge variant={c.variant} className="gap-1">
      {c.icon}
      {c.label}
    </Badge>
  );
}

function availableActions(status: RowStatus): ImportAction[] {
  if (status === 'BARU') return ['import', 'skip'];
  if (status === 'DUPLIKAT_NO_BUKTI') return ['skip'];
  if (status === 'DUPLIKAT_PERIODE') return ['roll_forward', 'skip', 'replace'];
  if (status === 'NIS_TIDAK_DIKENAL') return ['skip', 'create_siswa'];
  return ['skip']; // INVALID
}

function actionLabel(a: ImportAction): string {
  if (a === 'import') return 'Import';
  if (a === 'skip') return 'Lewati';
  if (a === 'replace') return 'Ganti';
  if (a === 'roll_forward') return 'Pindah ke bulan berikutnya';
  if (a === 'create_siswa') return 'Buat siswa + import';
  return a;
}

const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

function formatPeriode(y: number | null, m: number | null): string {
  if (!y || !m) return '—';
  return `${y}-${String(m).padStart(2, '0')}`;
}

function formatTanggal(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return '—';
  }
}

export function ImportPreviewTable({
  rows,
  counts,
  selections,
  onSelectionsChange,
}: ImportPreviewTableProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('SEMUA');

  const filtered = useMemo(() => {
    if (activeTab === 'SEMUA') return rows;
    return rows.filter((r) => r.status === activeTab);
  }, [rows, activeTab]);

  const countFor = (t: TabKey): number => {
    if (t === 'SEMUA') return rows.length;
    return counts[t];
  };

  const toggleRow = (row: AnalyzedRow, checked: boolean) => {
    const current = selections[row.rowIndex];
    onSelectionsChange({
      ...selections,
      [row.rowIndex]: {
        selected: checked,
        action: current?.action ?? row.defaultAction,
      },
    });
  };

  const setRowAction = (row: AnalyzedRow, action: ImportAction) => {
    const current = selections[row.rowIndex];
    onSelectionsChange({
      ...selections,
      [row.rowIndex]: {
        selected: current?.selected ?? row.status === 'BARU',
        action,
      },
    });
  };

  const toggleAllFiltered = (checked: boolean) => {
    const next: SelectionState = { ...selections };
    for (const r of filtered) {
      const current = next[r.rowIndex];
      const actions = availableActions(r.status);
      const action: ImportAction = current?.action ?? (actions[0] ?? 'skip');
      next[r.rowIndex] = { selected: checked, action };
    }
    onSelectionsChange(next);
  };

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selections[r.rowIndex]?.selected === true);

  return (
    <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
      <TabsList className="flex w-full flex-wrap gap-1 bg-slate-100 p-1">
        {TABS.map((t) => (
          <TabsTrigger key={t.key} value={t.key} className="text-xs">
            {t.label} ({nf.format(countFor(t.key))})
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((t) => (
        <TabsContent key={t.key} value={t.key} className="space-y-2">
          <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/60">
                  <TableHead className="w-10">
                    <Checkbox
                      aria-label="Pilih semua"
                      checked={allFilteredSelected}
                      onCheckedChange={(v) => toggleAllFiltered(v === true)}
                    />
                  </TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead>NIS</TableHead>
                  <TableHead>Nama</TableHead>
                  <TableHead>Periode</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>No. Bukti</TableHead>
                  <TableHead className="w-48">Tindakan</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="h-24 text-center text-sm text-slate-500">
                      Tidak ada baris pada kategori ini.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((row) => {
                    const sel = selections[row.rowIndex];
                    const actions = availableActions(row.status);
                    const currentAction: ImportAction =
                      sel?.action ?? row.defaultAction ?? (actions[0] ?? 'skip');
                    return (
                      <TableRow key={row.rowIndex} className={cn(row.status === 'INVALID' && 'bg-red-50/40')}>
                        <TableCell>
                          <Checkbox
                            aria-label={`Pilih baris ${row.rowIndex + 1}`}
                            checked={sel?.selected ?? false}
                            onCheckedChange={(v) => toggleRow(row, v === true)}
                            disabled={row.status === 'DUPLIKAT_NO_BUKTI' || row.status === 'INVALID'}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            {statusBadge(row.status)}
                            {row.message ? (
                              <span className="text-xs text-slate-500" title={row.message}>
                                {row.message.length > 60
                                  ? `${row.message.slice(0, 60)}…`
                                  : row.message}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{row.nis}</TableCell>
                        <TableCell>{row.nama || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {formatPeriode(row.periodYear, row.periodMonth)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">
                          Rp {nf.format(row.amount)}
                        </TableCell>
                        <TableCell className="text-xs">{formatTanggal(row.tanggalTransaksi)}</TableCell>
                        <TableCell className="font-mono text-xs">{row.noBukti || '—'}</TableCell>
                        <TableCell>
                          <Select
                            value={currentAction}
                            onValueChange={(v) => setRowAction(row, v as ImportAction)}
                            disabled={actions.length <= 1}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {actions.map((a) => (
                                <SelectItem key={a} value={a} className="text-xs">
                                  {actionLabel(a)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      ))}
    </Tabs>
  );
}
