'use client';

import { Suspense, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { XCircle, Plus, CheckCircle, X } from 'lucide-react';

import { PageHeader } from '@/components/layouts/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { apiFetch } from '@/lib/http';
import type { CancelRequestDto } from '@/services/cancel-request.service';

const rupiahFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function monthLabel(month: number): string {
  const labels = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];
  return labels[month - 1] ?? String(month);
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'PENDING') return <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">Pending</Badge>;
  if (status === 'APPROVED') return <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50">Disetujui</Badge>;
  return <Badge variant="outline" className="text-red-600 border-red-300 bg-red-50">Ditolak</Badge>;
}

interface CancelRequestListResponse {
  data: CancelRequestDto[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

function useCancelRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
  return useQuery({
    queryKey: ['cancel-requests', status],
    queryFn: async () => {
      const res = await fetch(`/api/v1/cancel-request${status ? `?status=${status}` : ''}`, {
        credentials: 'include',
      });
      const json = (await res.json()) as
        | ({ success: true } & CancelRequestListResponse)
        | { success: false; error: { message: string } };
      if (!res.ok || !json.success) {
        const msg = !json.success ? json.error.message : 'Gagal memuat.';
        throw new Error(msg);
      }
      return json.data;
    },
  });
}

function NewRequestDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [pembayaranId, setPembayaranId] = useState('');
  const [alasan, setAlasan] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: { pembayaranId: string; alasan: string }) =>
      apiFetch<CancelRequestDto>('/api/v1/cancel-request', { method: 'POST', body: data }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cancel-requests'] });
      setPembayaranId('');
      setAlasan('');
      setError(null);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Buat Permintaan Cancel</DialogTitle>
          <DialogDescription>
            Masukkan ID pembayaran dan alasan permintaan pembatalan.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pembayaranId">ID Pembayaran</Label>
            <Input
              id="pembayaranId"
              placeholder="cuid pembayaran..."
              value={pembayaranId}
              onChange={(e) => setPembayaranId(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="alasan">Alasan</Label>
            <Textarea
              id="alasan"
              placeholder="Jelaskan alasan pembatalan..."
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button
            onClick={() => mutation.mutate({ pembayaranId, alasan })}
            disabled={mutation.isPending || !pembayaranId.trim() || alasan.trim().length < 5}
          >
            {mutation.isPending ? 'Menyimpan...' : 'Kirim Permintaan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewDialog({
  item,
  action,
  onClose,
}: {
  item: CancelRequestDto | null;
  action: 'approve' | 'reject' | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: { note: string }) => {
      if (!item) throw new Error('No item');
      const endpoint = `/api/v1/cancel-request/${item.id}/${action}`;
      const body = action === 'reject' ? { reviewNote: data.note } : { reviewNote: data.note || undefined };
      return apiFetch<CancelRequestDto>(endpoint, { method: 'PATCH', body });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cancel-requests'] });
      setNote('');
      setError(null);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  const isOpen = !!item && !!action;

  return (
    <Dialog open={isOpen} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {action === 'approve' ? 'Setujui Permintaan Cancel' : 'Tolak Permintaan Cancel'}
          </DialogTitle>
          <DialogDescription>
            {item && (
              <span>
                Pembayaran {monthLabel(item.pembayaran?.periodMonth ?? 0)}{' '}
                {item.pembayaran?.periodYear} — {item.pembayaran?.siswa?.nama ?? '—'}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {item && (
            <div className="rounded-md bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">Alasan permintaan:</p>
              <p className="text-slate-600">{item.alasan}</p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="note">
              Catatan {action === 'reject' ? '(wajib)' : '(opsional)'}
            </Label>
            <Textarea
              id="note"
              placeholder="Catatan untuk pemohon..."
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Batal</Button>
          <Button
            variant={action === 'approve' ? 'default' : 'destructive'}
            onClick={() => mutation.mutate({ note })}
            disabled={mutation.isPending || (action === 'reject' && note.trim().length < 5)}
          >
            {mutation.isPending
              ? 'Memproses...'
              : action === 'approve'
                ? 'Setujui'
                : 'Tolak'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelRequestTable({
  items,
  isLoading,
  showActions,
}: {
  items: CancelRequestDto[];
  isLoading: boolean;
  showActions: boolean;
}) {
  const [reviewItem, setReviewItem] = useState<CancelRequestDto | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null);

  if (isLoading) {
    return <p className="py-8 text-center text-sm text-slate-400">Memuat...</p>;
  }

  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-slate-400">Tidak ada data.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs font-medium text-slate-500">
              <th className="pb-2 pr-4">Siswa</th>
              <th className="pb-2 pr-4">Periode</th>
              <th className="pb-2 pr-4">Jumlah</th>
              <th className="pb-2 pr-4">Alasan</th>
              <th className="pb-2 pr-4">Tanggal</th>
              <th className="pb-2 pr-4">Status</th>
              {showActions && <th className="pb-2">Aksi</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="py-2.5 pr-4">
                  <div className="font-medium text-slate-900">
                    {item.pembayaran?.siswa?.nama ?? '—'}
                  </div>
                  <div className="text-xs text-slate-400">
                    {item.pembayaran?.siswa?.nis ?? '—'}
                  </div>
                </td>
                <td className="py-2.5 pr-4 font-mono text-xs">
                  {item.pembayaran
                    ? `${monthLabel(item.pembayaran.periodMonth)} ${item.pembayaran.periodYear}`
                    : '—'}
                </td>
                <td className="py-2.5 pr-4 font-mono text-xs">
                  {item.pembayaran ? rupiahFormatter.format(item.pembayaran.amount) : '—'}
                </td>
                <td className="py-2.5 pr-4 max-w-[200px]">
                  <span className="line-clamp-2 text-slate-600">{item.alasan}</span>
                </td>
                <td className="py-2.5 pr-4 text-xs text-slate-500">
                  {new Date(item.createdAt).toLocaleDateString('id-ID')}
                </td>
                <td className="py-2.5 pr-4">
                  <StatusBadge status={item.status} />
                </td>
                {showActions && (
                  <td className="py-2.5">
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={() => { setReviewItem(item); setReviewAction('approve'); }}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        Setujui
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => { setReviewItem(item); setReviewAction('reject'); }}
                      >
                        <X className="h-3.5 w-3.5" />
                        Tolak
                      </Button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ReviewDialog
        item={reviewItem}
        action={reviewAction}
        onClose={() => { setReviewItem(null); setReviewAction(null); }}
      />
    </>
  );
}

function CancelRequestContent() {
  const [tab, setTab] = useState<'PENDING' | 'DIPROSES'>('PENDING');
  const [showNew, setShowNew] = useState(false);

  const pendingQuery = useCancelRequests('PENDING');
  const processedQuery = useQuery({
    queryKey: ['cancel-requests', 'processed'],
    queryFn: async () => {
      const [approved, rejected] = await Promise.all([
        fetch('/api/v1/cancel-request?status=APPROVED&limit=50', { credentials: 'include' })
          .then((r) => r.json() as Promise<{ success: boolean; data: CancelRequestDto[] }>)
          .then((j) => (j.success ? j.data : [])),
        fetch('/api/v1/cancel-request?status=REJECTED&limit=50', { credentials: 'include' })
          .then((r) => r.json() as Promise<{ success: boolean; data: CancelRequestDto[] }>)
          .then((j) => (j.success ? j.data : [])),
      ]);
      return [...approved, ...rejected].sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    },
  });

  const pendingItems = pendingQuery.data ?? [];
  const processedItems = processedQuery.data ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Permintaan Cancel Pembayaran"
        description="Kelola permintaan pembatalan pembayaran yang perlu persetujuan."
      />

      <Card className="border-slate-200">
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <div className="flex gap-1 rounded-md bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setTab('PENDING')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                tab === 'PENDING'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Pending
              {pendingItems.length > 0 && (
                <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-700">
                  {pendingItems.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setTab('DIPROSES')}
              className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                tab === 'DIPROSES'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Diproses
            </button>
          </div>
          <Button size="sm" onClick={() => setShowNew(true)} className="gap-1.5">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Buat Permintaan
          </Button>
        </CardHeader>
        <CardContent>
          {tab === 'PENDING' ? (
            <CancelRequestTable
              items={pendingItems}
              isLoading={pendingQuery.isLoading}
              showActions
            />
          ) : (
            <CancelRequestTable
              items={processedItems}
              isLoading={processedQuery.isLoading}
              showActions={false}
            />
          )}
        </CardContent>
      </Card>

      <NewRequestDialog open={showNew} onClose={() => setShowNew(false)} />
    </div>
  );
}

export default function CancelRequestPage() {
  return (
    <Suspense>
      <CancelRequestContent />
    </Suspense>
  );
}
