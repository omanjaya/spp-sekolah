'use client';

import { type ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight, Loader2, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/feedback/confirm-dialog';
import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { SiswaCombobox } from '@/components/combobox/siswa-combobox';
import { CurrencyInput } from '@/components/inputs/currency-input';
import { PageHeader } from '@/components/layouts/page-header';
import { DataTable } from '@/components/tables/data-table';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useRefundCreate,
  useRefundDelete,
  useRefundList,
  type RefundDto,
} from '@/hooks/use-refund';
import { usePembayaranList } from '@/hooks/use-pembayaran';
import type { SiswaSearchItem } from '@/hooks/use-siswa-search';
import type { RefundFilterInput } from '@/lib/validators/refund.schema';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatRupiah(value: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
}

function formatTanggal(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function periodLabel(year: number, month: number): string {
  const names = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  return `${names[month - 1] ?? month} ${year}`;
}

// ─── Refund Form (inline dialog) ─────────────────────────────────────────────

interface RefundFormState {
  siswaId: string;
  pembayaranId: string;
  amount: number | null;
  alasan: string;
  tanggal: string;
  noBukti: string;
}

interface RefundFormProps {
  onSubmit: (payload: {
    siswaId: string;
    pembayaranId?: string;
    amount: number;
    alasan: string;
    tanggal: Date;
    noBukti?: string;
  }) => Promise<void>;
  onCancel: () => void;
  isSubmitting?: boolean;
}

function RefundForm({ onSubmit, onCancel, isSubmitting }: RefundFormProps) {
  const [form, setForm] = useState<RefundFormState>({
    siswaId: '',
    pembayaranId: '',
    amount: null,
    alasan: '',
    tanggal: todayIso(),
    noBukti: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load pembayaran for selected siswa
  const { data: pembayaranData } = usePembayaranList(
    form.siswaId ? { siswaId: form.siswaId, limit: 100 } : {},
  );
  const pembayaranList = pembayaranData?.items ?? [];

  function set<K extends keyof RefundFormState>(key: K, value: RefundFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: '' }));
  }

  function handleSiswaChange(id: string, _siswa: SiswaSearchItem | null) {
    setForm((prev) => ({ ...prev, siswaId: id, pembayaranId: '' }));
    setErrors((prev) => ({ ...prev, siswaId: '' }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.siswaId) next.siswaId = 'Pilih siswa terlebih dahulu.';
    if (form.amount === null || form.amount <= 0) next.amount = 'Jumlah refund harus lebih dari 0.';
    if (!form.alasan.trim() || form.alasan.trim().length < 5) next.alasan = 'Alasan minimal 5 karakter.';
    if (!form.tanggal) next.tanggal = 'Tanggal wajib diisi.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || form.amount === null) return;
    await onSubmit({
      siswaId: form.siswaId,
      pembayaranId: form.pembayaranId || undefined,
      amount: form.amount,
      alasan: form.alasan.trim(),
      tanggal: new Date(`${form.tanggal}T00:00:00.000Z`),
      noBukti: form.noBukti.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormFieldWrapper label="Siswa" required error={errors.siswaId}>
        <SiswaCombobox value={form.siswaId} onChange={handleSiswaChange} />
      </FormFieldWrapper>

      <FormFieldWrapper
        label="Pembayaran terkait"
        hint="Opsional. Pilih jika refund berkaitan dengan pembayaran spesifik."
      >
        <Select
          value={form.pembayaranId}
          onValueChange={(v) => set('pembayaranId', v === '__none__' ? '' : v)}
          disabled={!form.siswaId || pembayaranList.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={form.siswaId ? (pembayaranList.length === 0 ? 'Tidak ada pembayaran' : 'Pilih pembayaran…') : 'Pilih siswa dahulu'} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— Tidak terkait pembayaran —</SelectItem>
            {pembayaranList.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {periodLabel(p.periodYear, p.periodMonth)} — {formatRupiah(typeof p.amount === 'number' ? p.amount : Number(p.amount))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormFieldWrapper>

      <FormFieldWrapper label="Jumlah refund" required error={errors.amount}>
        <CurrencyInput value={form.amount} onChange={(v) => set('amount', v)} />
      </FormFieldWrapper>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Tanggal" required error={errors.tanggal}>
          <Input
            type="date"
            value={form.tanggal}
            onChange={(e) => set('tanggal', e.target.value)}
          />
        </FormFieldWrapper>

        <FormFieldWrapper label="No. bukti" hint="Opsional.">
          <Input
            value={form.noBukti}
            onChange={(e) => set('noBukti', e.target.value)}
            placeholder="mis. RFD-20240715-001"
            maxLength={64}
          />
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper label="Alasan" required error={errors.alasan} hint="Min. 5, maks. 500 karakter.">
        <Textarea
          value={form.alasan}
          onChange={(e) => set('alasan', e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="Jelaskan alasan kelebihan bayar atau pengembalian dana…"
        />
      </FormFieldWrapper>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Batal
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Simpan Refund
        </Button>
      </div>
    </form>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RefundPage() {
  const [filter, setFilter] = useState<Partial<RefundFilterInput>>({ limit: 20, page: 1 });
  const [search, setSearch] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<RefundDto | null>(null);

  const { data, isLoading } = useRefundList(filter);

  const totalPages = data?.meta?.totalPages ?? 1;
  const currentPage = filter.page ?? 1;

  const filteredData = useMemo(() => {
    const rows = data?.data ?? [];
    if (!search.trim()) return rows;
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        r.siswa?.nama?.toLowerCase().includes(q) ||
        r.siswa?.nis?.toLowerCase().includes(q),
    );
  }, [data?.data, search]);

  const createMutation = useRefundCreate({
    onError: (err) => toast.error(err.message),
    onSuccess: () => {
      toast.success('Refund dicatat.');
      setFormOpen(false);
    },
  });

  const deleteMutation = useRefundDelete({
    onError: (err) => toast.error(err.message),
    onSuccess: () => {
      toast.success('Refund dihapus.');
      setToDelete(null);
    },
  });

  const columns = useMemo<ColumnDef<RefundDto>[]>(
    () => [
      {
        header: 'Tanggal',
        accessorKey: 'tanggal',
        cell: ({ row }) => (
          <span className="text-sm">{formatTanggal(row.original.tanggal)}</span>
        ),
      },
      {
        header: 'Siswa',
        accessorKey: 'siswa.nama',
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-slate-900">{row.original.siswa?.nama ?? '-'}</span>
            <span className="font-mono text-xs text-slate-500">{row.original.siswa?.nis ?? '-'}</span>
          </div>
        ),
      },
      {
        header: 'Pembayaran terkait',
        accessorKey: 'pembayaranId',
        cell: ({ row }) => {
          const p = row.original.pembayaran;
          if (!p) return <span className="text-xs text-slate-400">—</span>;
          return (
            <span className="text-xs text-slate-600">
              {periodLabel(p.periodYear, p.periodMonth)}
            </span>
          );
        },
      },
      {
        header: 'Jumlah',
        accessorKey: 'amount',
        cell: ({ row }) => (
          <span className="font-mono text-sm font-medium text-amber-700">
            {formatRupiah(row.original.amount)}
          </span>
        ),
      },
      {
        header: 'Alasan',
        accessorKey: 'alasan',
        cell: ({ row }) => (
          <span className="max-w-xs truncate text-sm text-slate-700" title={row.original.alasan}>
            {row.original.alasan}
          </span>
        ),
      },
      {
        header: 'No. Bukti',
        accessorKey: 'noBukti',
        cell: ({ row }) => (
          <span className="font-mono text-xs text-slate-600">{row.original.noBukti ?? '-'}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-slate-500 hover:text-destructive"
              onClick={() => setToDelete(row.original)}
              aria-label="Hapus"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refund / Kelebihan Bayar"
        description="Catat pengembalian dana karena kelebihan pembayaran siswa."
        actions={
          <Button onClick={() => setFormOpen(true)}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
            Tambah Refund
          </Button>
        }
      />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari NIS atau nama siswa"
          className="pl-9"
          aria-label="Cari siswa"
        />
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        isLoading={isLoading}
        emptyState={
          <div className="flex flex-col items-center gap-2 py-8 text-sm text-slate-500">
            <RotateCcw className="h-8 w-8 text-slate-300" aria-hidden="true" />
            Belum ada catatan refund.
          </div>
        }
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-3 text-sm text-slate-600">
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage <= 1 || isLoading}
            onClick={() => setFilter((prev) => ({ ...prev, page: currentPage - 1 }))}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="tabular-nums">Hal {currentPage} dari {totalPages}</span>
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={currentPage >= totalPages || isLoading}
            onClick={() => setFilter((prev) => ({ ...prev, page: currentPage + 1 }))}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Tambah Refund</DialogTitle>
            <DialogDescription>
              Catat pengembalian dana karena kelebihan bayar. Pilih pembayaran terkait jika ada.
            </DialogDescription>
          </DialogHeader>
          <RefundForm
            onSubmit={async (payload) => { await createMutation.mutateAsync(payload); }}
            onCancel={() => setFormOpen(false)}
            isSubmitting={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={toDelete !== null}
        onOpenChange={(open) => { if (!open) setToDelete(null); }}
        title="Hapus catatan refund?"
        description={
          toDelete ? (
            <span>
              Refund <span className="font-semibold">{toDelete.siswa?.nama ?? '—'}</span> sebesar{' '}
              <span className="font-semibold">{formatRupiah(toDelete.amount)}</span> akan dihapus.
            </span>
          ) : null
        }
        confirmLabel="Hapus"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={async () => { if (toDelete) await deleteMutation.mutateAsync(toDelete.id); }}
      />
    </div>
  );
}
