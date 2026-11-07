'use client';

import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CurrencyInput } from '@/components/inputs/currency-input';
import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { SiswaCombobox } from '@/components/combobox/siswa-combobox';
import type { SiswaSearchItem } from '@/hooks/use-siswa-search';
import { useCreatePembayaranManual } from '@/hooks/use-pembayaran';
import { HttpError } from '@/lib/http';

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function PembayaranManualForm({ onSuccess }: { onSuccess?: () => void }) {
  const create = useCreatePembayaranManual();

  const [siswa, setSiswa] = useState<SiswaSearchItem | null>(null);

  const now = new Date();
  const [periodYear, setPeriodYear] = useState<number>(now.getFullYear());
  const [periodMonth, setPeriodMonth] = useState<number>(now.getMonth() + 1);
  const [amount, setAmount] = useState<number | null>(350000);
  const [biayaAdm, setBiayaAdm] = useState<number | null>(0);
  const [tanggal, setTanggal] = useState<string>(todayIso());
  const [kodeCabang, setKodeCabang] = useState('');
  const [catatan, setCatatan] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!siswa) {
      toast.error('Pilih siswa dulu.');
      return;
    }
    if (!amount || amount <= 0) {
      toast.error('Nominal harus lebih dari 0.');
      return;
    }
    try {
      await create.mutateAsync({
        siswaId: siswa.id,
        periodYear,
        periodMonth,
        amount,
        biayaAdm: biayaAdm ?? 0,
        tanggalTransaksi: new Date(tanggal),
        kodeCabang: kodeCabang.trim() || undefined,
        catatan: catatan.trim() || undefined,
      });
      toast.success('Pembayaran manual berhasil dicatat.');
      onSuccess?.();
      setSiswa(null);
      setCatatan('');
      setKodeCabang('');
    } catch (err) {
      toast.error(err instanceof HttpError ? err.message : 'Gagal mencatat pembayaran.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <FormFieldWrapper
        label="Siswa"
        required
        hint={siswa ? `${siswa.nis} · ${siswa.nama}` : 'Cari siswa berdasarkan NIS atau nama.'}
      >
        <SiswaCombobox
          value={siswa?.id}
          onChange={(_id, item) => setSiswa(item)}
          placeholder="Cari NIS atau nama siswa"
          allowClear
        />
      </FormFieldWrapper>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Tahun Periode" required>
          <Input
            type="number"
            value={periodYear}
            onChange={(e) => setPeriodYear(Number(e.target.value) || now.getFullYear())}
            min={2000}
            max={2100}
          />
        </FormFieldWrapper>
        <FormFieldWrapper label="Bulan Periode" required>
          <Select value={String(periodMonth)} onValueChange={(v) => setPeriodMonth(Number(v))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((label, idx) => (
                <SelectItem key={idx + 1} value={String(idx + 1)}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Nominal Sumbangan Komite" required>
          <CurrencyInput value={amount} onChange={setAmount} />
        </FormFieldWrapper>
        <FormFieldWrapper label="Biaya Adm">
          <CurrencyInput value={biayaAdm} onChange={setBiayaAdm} />
        </FormFieldWrapper>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Tanggal Transaksi" required>
          <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)} />
        </FormFieldWrapper>
        <FormFieldWrapper label="Kode Cabang">
          <Input
            value={kodeCabang}
            onChange={(e) => setKodeCabang(e.target.value)}
            placeholder="Contoh: GAPURA"
          />
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper label="Catatan">
        <Textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={3}
          placeholder="Optional — misal: bayar tunai di loket."
        />
      </FormFieldWrapper>

      <div className="flex justify-end">
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : null}
          Simpan Pembayaran
        </Button>
      </div>
    </form>
  );
}
