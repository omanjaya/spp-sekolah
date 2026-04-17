'use client';

import {
  AlertCircle,
  ArrowUpCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Search,
  UserPlus,
  Users,
} from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/layouts/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ExcelUploader } from '@/components/uploaders/excel-uploader';
import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { apiFetch, HttpError } from '@/lib/http';
import { useTahunAjaranList } from '@/hooks/use-tahun-ajaran';
import {
  usePreviewNaikKelas,
  useConfirmNaikKelas,
  type AnalyzedRow,
  type NaikKelasAction,
  type NaikKelasPreviewResult,
  type NaikKelasSelection,
  type NaikKelasStatus,
} from '@/hooks/use-naik-kelas';

// ---------- Types -----------------------------------------------------------

type ActionState = Record<number, NaikKelasAction>;

// ---------- Helpers ---------------------------------------------------------

function defaultActions(rows: AnalyzedRow[]): ActionState {
  const out: ActionState = {};
  for (const r of rows) {
    out[r.rowIndex] = r.defaultAction;
  }
  return out;
}

function statusLabel(status: NaikKelasStatus): string {
  switch (status) {
    case 'MATCH':
      return 'Cocok';
    case 'NAMA_BEDA':
      return 'Nama Beda';
    case 'NIS_TIDAK_DIKENAL':
      return 'NIS Baru';
    case 'SUDAH_ASSIGN':
      return 'Sudah Assign';
  }
}

// ---------- Sub-components --------------------------------------------------

function StatusBadge({ status }: { status: NaikKelasStatus }) {
  const variants: Record<NaikKelasStatus, string> = {
    MATCH: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    NAMA_BEDA: 'bg-amber-100 text-amber-800 border-amber-200',
    NIS_TIDAK_DIKENAL: 'bg-red-100 text-red-800 border-red-200',
    SUDAH_ASSIGN: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${variants[status]}`}
    >
      {statusLabel(status)}
    </span>
  );
}

interface RowActionProps {
  row: AnalyzedRow;
  action: NaikKelasAction;
  onChange: (rowIndex: number, action: NaikKelasAction) => void;
}

function RowAction({ row, action, onChange }: RowActionProps) {
  if (row.status === 'MATCH') {
    return <span className="text-xs text-slate-500">Auto-assign</span>;
  }

  if (row.status === 'SUDAH_ASSIGN') {
    return (
      <Badge variant="outline" className="text-slate-500">
        Sudah di-assign
      </Badge>
    );
  }

  if (row.status === 'NAMA_BEDA') {
    return (
      <Select value={action} onValueChange={(v) => onChange(row.rowIndex, v as NaikKelasAction)}>
        <SelectTrigger className="h-8 w-48 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="pakai_db">Pakai nama DB</SelectItem>
          <SelectItem value="pakai_excel">Pakai nama Excel (update DB)</SelectItem>
          <SelectItem value="skip">Lewati</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  if (row.status === 'NIS_TIDAK_DIKENAL') {
    return (
      <Select value={action} onValueChange={(v) => onChange(row.rowIndex, v as NaikKelasAction)}>
        <SelectTrigger className="h-8 w-40 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="buat_baru">Buat siswa baru</SelectItem>
          <SelectItem value="skip">Lewati</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return null;
}

interface PreviewRowProps {
  row: AnalyzedRow;
  action: NaikKelasAction;
  onActionChange: (rowIndex: number, action: NaikKelasAction) => void;
}

function PreviewRow({ row, action, onActionChange }: PreviewRowProps) {
  const isDimmed = row.status === 'SUDAH_ASSIGN';

  return (
    <TableRow className={isDimmed ? 'opacity-50' : undefined}>
      <TableCell>
        <StatusBadge status={row.status} />
      </TableCell>
      <TableCell className="font-mono text-xs">{row.nis}</TableCell>
      <TableCell>
        {row.status === 'NAMA_BEDA' ? (
          <div className="space-y-0.5">
            <p className="text-xs font-medium text-amber-700">{row.namaExcel}</p>
            <p className="text-xs text-slate-500">{row.namaDb ?? '—'}</p>
          </div>
        ) : (
          <span className="text-sm">{row.namaExcel}</span>
        )}
      </TableCell>
      <TableCell className="text-sm text-slate-600">{row.namaDb ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs text-slate-500">{row.rombelKodeAsal ?? '—'}</TableCell>
      <TableCell className="font-mono text-xs">{row.rombelKodeTujuan}</TableCell>
      <TableCell>
        <RowAction row={row} action={action} onChange={onActionChange} />
      </TableCell>
    </TableRow>
  );
}

interface PreviewTableProps {
  rows: AnalyzedRow[];
  actions: ActionState;
  onActionChange: (rowIndex: number, action: NaikKelasAction) => void;
}

function PreviewTable({ rows, actions, onActionChange }: PreviewTableProps) {
  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">Tidak ada data pada tab ini.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-slate-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Status</TableHead>
            <TableHead className="w-28">NIS</TableHead>
            <TableHead>Nama di Excel</TableHead>
            <TableHead>Nama di Database</TableHead>
            <TableHead className="w-32">Rombel Asal</TableHead>
            <TableHead className="w-32">Rombel Tujuan</TableHead>
            <TableHead className="w-52">Aksi</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <PreviewRow
              key={row.rowIndex}
              row={row}
              action={actions[row.rowIndex] ?? row.defaultAction}
              onActionChange={onActionChange}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------- Warning panel ---------------------------------------------------

interface WarningPanelProps {
  items: Array<{ nis: string; nama: string }>;
}

function WarningPanel({ items }: WarningPanelProps) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div className="flex-1">
          <p className="font-medium">
            {items.length} siswa di tahun ajaran sebelumnya tidak ada di Excel (belum di-assign ke
            kelas baru):
          </p>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="mt-1 flex items-center gap-1 text-xs font-medium text-amber-700 underline-offset-2 hover:underline"
          >
            {open ? (
              <>
                <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> Sembunyikan daftar
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> Tampilkan daftar
              </>
            )}
          </button>
          {open ? (
            <ul className="mt-2 space-y-1 text-xs">
              {items.map((item) => (
                <li key={item.nis} className="flex gap-2">
                  <span className="font-mono text-amber-800">{item.nis}</span>
                  <span className="text-amber-700">{item.nama}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------- Summary cards ---------------------------------------------------

interface SummaryCardsProps {
  preview: NaikKelasPreviewResult;
  actions: ActionState;
}

function SummaryCards({ preview, actions }: SummaryCardsProps) {
  const counts = useMemo(() => {
    let willAssign = 0;
    let namaUpdate = 0;
    let siswaCreated = 0;
    let skipped = 0;

    for (const row of preview.rows) {
      const action = actions[row.rowIndex] ?? row.defaultAction;
      if (row.status === 'SUDAH_ASSIGN') continue;
      switch (action) {
        case 'assign':
        case 'pakai_db':
          willAssign += 1;
          break;
        case 'pakai_excel':
          willAssign += 1;
          namaUpdate += 1;
          break;
        case 'buat_baru':
          willAssign += 1;
          siswaCreated += 1;
          break;
        case 'skip':
          skipped += 1;
          break;
      }
    }

    return { willAssign, namaUpdate, siswaCreated, skipped };
  }, [preview.rows, actions]);

  const cards = [
    { label: 'Akan di-assign', value: counts.willAssign, color: 'text-emerald-700' },
    { label: 'Nama di-update', value: counts.namaUpdate, color: 'text-amber-700' },
    { label: 'Siswa baru dibuat', value: counts.siswaCreated, color: 'text-sky-700' },
    { label: 'Dilewati', value: counts.skipped, color: 'text-slate-600' },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="border-slate-200">
          <CardContent className="pt-4">
            <p className={`font-mono text-3xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
            <p className="mt-1 text-xs text-slate-500">{c.label}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ---------- Manual Assign Section ------------------------------------------

interface SiswaLookup {
  id: string;
  nis: string;
  nama: string;
  angkatan: number;
  enrollmentAktif?: { rombel?: { kode: string } } | null;
}

function ManualAssignSection({
  tahunAjaranId,
  onTahunAjaranChange,
}: {
  tahunAjaranId: string;
  onTahunAjaranChange: (v: string) => void;
}) {
  const { data: tahunAjaranList, isLoading: loadingTahun } = useTahunAjaranList();
  const [nis, setNis] = useState('');
  const [siswa, setSiswa] = useState<SiswaLookup | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [rombelBaru, setRombelBaru] = useState('');
  const [assigning, setAssigning] = useState(false);

  async function lookupSiswa() {
    if (!nis.trim()) { setLookupError('Ketik NIS dulu.'); return; }
    setLookupLoading(true);
    setLookupError(null);
    setSiswa(null);
    try {
      const items = await apiFetch<SiswaLookup[]>('/api/v1/siswa', {
        searchParams: { search: nis.trim(), limit: 5 },
      });
      const exact = items.find((s) => s.nis === nis.trim());
      if (exact) {
        setSiswa(exact);
      } else {
        setLookupError('Siswa dengan NIS tersebut tidak ditemukan.');
      }
    } catch (err) {
      setLookupError(err instanceof HttpError ? err.message : 'Gagal mencari siswa.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleAssign() {
    if (!siswa || !rombelBaru.trim() || !tahunAjaranId) {
      toast.error('Lengkapi NIS, rombel tujuan, dan tahun ajaran.');
      return;
    }
    setAssigning(true);
    try {
      await apiFetch('/api/v1/naik-kelas/manual', {
        method: 'POST',
        body: {
          siswaId: siswa.id,
          rombelKode: rombelBaru.trim(),
          tahunAjaranId,
        },
      });
      toast.success(
        `${siswa.nama} (${siswa.nis}) berhasil dipindah ke ${rombelBaru.trim()} di TA ${
          tahunAjaranList?.find((t) => t.id === tahunAjaranId)?.kode ?? ''
        }.`,
      );
      setNis('');
      setSiswa(null);
      setRombelBaru('');
    } catch (err) {
      toast.error(err instanceof HttpError ? err.message : 'Gagal memindahkan siswa.');
    } finally {
      setAssigning(false);
    }
  }

  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserPlus className="h-4 w-4 text-slate-500" aria-hidden="true" />
          Input Manual (1–2 Siswa)
        </CardTitle>
        <CardDescription>
          Pindahkan siswa ke rombel baru satu per satu tanpa perlu upload Excel.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Tahun Ajaran</label>
            <Select
              value={tahunAjaranId}
              onValueChange={onTahunAjaranChange}
              disabled={loadingTahun}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pilih TA" />
              </SelectTrigger>
              <SelectContent>
                {(tahunAjaranList ?? []).map((ta) => (
                  <SelectItem key={ta.id} value={ta.id}>
                    {ta.kode}{ta.isActive ? ' (Aktif)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">NIS Siswa</label>
            <div className="flex gap-2">
              <Input
                value={nis}
                onChange={(e) => setNis(e.target.value)}
                placeholder="Contoh: 25683"
                className="font-mono"
                onKeyDown={(e) => { if (e.key === 'Enter') void lookupSiswa(); }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => void lookupSiswa()}
                disabled={lookupLoading}
                aria-label="Cari siswa"
              >
                {lookupLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-4 w-4" aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700">Rombel Tujuan</label>
            <Input
              value={rombelBaru}
              onChange={(e) => setRombelBaru(e.target.value)}
              placeholder="Contoh: XI.6"
              className="font-mono"
            />
          </div>

          <div className="flex items-end">
            <Button
              onClick={() => void handleAssign()}
              disabled={!siswa || !rombelBaru.trim() || !tahunAjaranId || assigning}
              className="w-full gap-2"
            >
              {assigning ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Plus className="h-4 w-4" aria-hidden="true" />
              )}
              Pindahkan
            </Button>
          </div>
        </div>

        {lookupError ? (
          <p className="text-xs text-destructive">{lookupError}</p>
        ) : null}

        {siswa ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm">
            <span className="font-mono text-emerald-800">{siswa.nis}</span>
            <span className="mx-2 text-emerald-600">·</span>
            <span className="font-medium text-emerald-900">{siswa.nama}</span>
            <span className="mx-2 text-emerald-600">·</span>
            <span className="text-emerald-700">
              Angkatan {siswa.angkatan}
              {siswa.enrollmentAktif?.rombel
                ? ` · Saat ini di ${siswa.enrollmentAktif.rombel.kode}`
                : ''}
            </span>
          </div>
        ) : null}

        <Separator />
      </CardContent>
    </Card>
  );
}

// ---------- Page ------------------------------------------------------------

export default function NaikKelasPage() {
  const [file, setFile] = useState<File | null>(null);
  const [tahunAjaranId, setTahunAjaranId] = useState<string>('');
  const [preview, setPreview] = useState<NaikKelasPreviewResult | null>(null);
  const [actions, setActions] = useState<ActionState>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  const { data: tahunAjaranList, isLoading: loadingTahun } = useTahunAjaranList();
  const previewMut = usePreviewNaikKelas();
  const confirmMut = useConfirmNaikKelas();

  function handleActionChange(rowIndex: number, action: NaikKelasAction) {
    setActions((prev) => ({ ...prev, [rowIndex]: action }));
  }

  async function runAnalysis() {
    if (!file) {
      toast.error('Pilih file Excel terlebih dahulu.');
      return;
    }
    if (!tahunAjaranId) {
      toast.error('Pilih tahun ajaran tujuan terlebih dahulu.');
      return;
    }
    try {
      const res = await previewMut.mutateAsync({ file, tahunAjaranId });
      setPreview(res);
      setActions(defaultActions(res.rows));
      setTimeout(() => {
        previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    } catch (err) {
      toast.error(err instanceof HttpError ? err.message : 'Gagal menganalisis file.');
    }
  }

  function reset() {
    setPreview(null);
    setActions({});
    setFile(null);
  }

  async function onConfirm() {
    if (!preview || !tahunAjaranId) return;

    const selections: NaikKelasSelection[] = preview.rows
      .filter((r) => r.status !== 'SUDAH_ASSIGN')
      .map((r) => ({
        rowIndex: r.rowIndex,
        action: actions[r.rowIndex] ?? r.defaultAction,
      }));

    try {
      const res = await confirmMut.mutateAsync({
        batchId: preview.batchId,
        tahunAjaranId,
        selections,
      });
      toast.success(
        `${res.assigned} siswa berhasil dinaikkan` +
          (res.namaUpdated > 0 ? `, ${res.namaUpdated} nama diupdate` : '') +
          (res.siswaCreated > 0 ? `, ${res.siswaCreated} siswa baru dibuat` : '') +
          (res.skipped > 0 ? `, ${res.skipped} dilewati` : '') +
          (res.errors.length > 0 ? `, ${res.errors.length} error` : '') +
          '.',
      );
      setConfirmOpen(false);
      reset();
    } catch (err) {
      setConfirmOpen(false);
      toast.error(err instanceof HttpError ? err.message : 'Gagal menyimpan data naik kelas.');
    }
  }

  // Group rows per tab
  const rowsByTab = useMemo(() => {
    if (!preview) return null;
    return {
      semua: preview.rows,
      siap: preview.rows.filter((r) => r.status === 'MATCH'),
      namaBeda: preview.rows.filter((r) => r.status === 'NAMA_BEDA'),
      nisBaru: preview.rows.filter((r) => r.status === 'NIS_TIDAK_DIKENAL'),
      sudahAssign: preview.rows.filter((r) => r.status === 'SUDAH_ASSIGN'),
    };
  }, [preview]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Naik Kelas"
        description="Upload data rombel baru untuk menaikkan siswa dari kelas X ke XI atau XI ke XII."
      />

      {/* Manual quick-assign for 1-2 students */}
      <ManualAssignSection tahunAjaranId={tahunAjaranId} onTahunAjaranChange={setTahunAjaranId} />

      {/* Section 1: Bulk via Excel */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ArrowUpCircle className="h-4 w-4 text-slate-500" aria-hidden="true" />
            Bulk Import via Excel
          </CardTitle>
          <CardDescription>
            Upload file Excel yang berisi data rombel baru untuk banyak siswa sekaligus.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700" htmlFor="tahun-ajaran-select">
              Tahun Ajaran Tujuan
            </label>
            <Select
              value={tahunAjaranId}
              onValueChange={setTahunAjaranId}
              disabled={loadingTahun || previewMut.isPending}
            >
              <SelectTrigger id="tahun-ajaran-select" className="w-64">
                <SelectValue placeholder={loadingTahun ? 'Memuat...' : 'Pilih tahun ajaran'} />
              </SelectTrigger>
              <SelectContent>
                {(tahunAjaranList ?? []).map((ta) => (
                  <SelectItem key={ta.id} value={ta.id}>
                    {ta.kode}
                    {ta.isActive ? ' (Aktif)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <ExcelUploader file={file} onChange={setFile} disabled={previewMut.isPending} />

          <div className="flex items-center justify-end gap-2">
            {preview ? (
              <Button variant="outline" onClick={reset} disabled={confirmMut.isPending} aria-label="Reset data">
                Reset
              </Button>
            ) : null}
            <Button
              onClick={() => void runAnalysis()}
              disabled={!file || !tahunAjaranId || previewMut.isPending}
            >
              {previewMut.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              Analisis
            </Button>
          </div>
        </CardContent>
      </Card>

      {preview && rowsByTab ? (
        <div ref={previewRef} className="space-y-6">
          {/* Section 2: Preview */}
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-slate-500" aria-hidden="true" />
                Pratinjau
              </CardTitle>
              <CardDescription>
                {preview.totalRows} baris dari{' '}
                <span className="font-medium">{preview.fileName}</span>. Tinjau setiap baris
                sebelum konfirmasi.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="semua">
                <TabsList className="mb-4">
                  <TabsTrigger value="semua">
                    Semua ({rowsByTab.semua.length})
                  </TabsTrigger>
                  <TabsTrigger value="siap">
                    Siap ({rowsByTab.siap.length})
                  </TabsTrigger>
                  <TabsTrigger value="nama-beda">
                    Nama Beda ({rowsByTab.namaBeda.length})
                  </TabsTrigger>
                  <TabsTrigger value="nis-baru">
                    NIS Baru ({rowsByTab.nisBaru.length})
                  </TabsTrigger>
                  <TabsTrigger value="sudah-assign">
                    Sudah Assign ({rowsByTab.sudahAssign.length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="semua">
                  <PreviewTable
                    rows={rowsByTab.semua}
                    actions={actions}
                    onActionChange={handleActionChange}
                  />
                </TabsContent>
                <TabsContent value="siap">
                  <PreviewTable
                    rows={rowsByTab.siap}
                    actions={actions}
                    onActionChange={handleActionChange}
                  />
                </TabsContent>
                <TabsContent value="nama-beda">
                  <PreviewTable
                    rows={rowsByTab.namaBeda}
                    actions={actions}
                    onActionChange={handleActionChange}
                  />
                </TabsContent>
                <TabsContent value="nis-baru">
                  <PreviewTable
                    rows={rowsByTab.nisBaru}
                    actions={actions}
                    onActionChange={handleActionChange}
                  />
                </TabsContent>
                <TabsContent value="sudah-assign">
                  <PreviewTable
                    rows={rowsByTab.sudahAssign}
                    actions={actions}
                    onActionChange={handleActionChange}
                  />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          {/* Section 3: Warning panel */}
          <WarningPanel items={preview.tidakTerassign} />

          {/* Section 4: Summary + Confirm */}
          <Card className="border-slate-200">
            <CardHeader>
              <CardTitle className="text-base">Ringkasan</CardTitle>
              <CardDescription>
                Pastikan jumlah di bawah sudah sesuai sebelum konfirmasi.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SummaryCards preview={preview} actions={actions} />
              <div className="flex justify-end">
                <Button
                  onClick={() => setConfirmOpen(true)}
                  disabled={confirmMut.isPending}
                  className="gap-2"
                >
                  {confirmMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <ArrowUpCircle className="h-4 w-4" aria-hidden="true" />
                  )}
                  Naikkan Kelas
                </Button>
              </div>
            </CardContent>
          </Card>

          <ConfirmDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            title="Konfirmasi Naik Kelas"
            description={
              <span>
                Data naik kelas akan disimpan ke database. Aksi ini tidak dapat dibatalkan.
                Lanjutkan?
              </span>
            }
            confirmLabel="Ya, Naikkan Kelas"
            onConfirm={onConfirm}
            isLoading={confirmMut.isPending}
          />
        </div>
      ) : null}
    </div>
  );
}
