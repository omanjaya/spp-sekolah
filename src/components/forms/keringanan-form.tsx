'use client';

import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { SiswaCombobox } from '@/components/combobox/siswa-combobox';
import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import {
  MonthRangePicker,
  countMonthsInRange,
  enumerateMonthRange,
  type MonthRangeValue,
} from '@/components/pickers/month-range-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  JENIS_KERINGANAN,
  type JenisKeringanan,
  type KeringananBulkAssignInput,
} from '@/lib/validators/keringanan.schema';

const JENIS_LABEL: Record<JenisKeringanan, string> = {
  JUARA: 'Juara Lomba',
  OSN: 'OSN',
  JUARA_UMUM: 'Juara Umum',
  BEASISWA: 'Beasiswa',
  KELUARGA_TIDAK_MAMPU: 'Keluarga Tidak Mampu',
  PINDAHAN: 'Pindahan',
  IJAZAH: 'Ijazah',
  LAINNYA: 'Lainnya',
};

export interface KeringananFormSingleValue {
  siswaId: string;
  range: MonthRangeValue | null;
  jenis: JenisKeringanan;
  persentase: number;
  alasan: string;
}

export interface KeringananFormProps {
  onSubmit: (
    payload: KeringananBulkAssignInput,
    meta: { label: string },
  ) => Promise<void> | void;
  isSubmitting?: boolean;
  onCancel?: () => void;
  initialSiswaId?: string;
}

/**
 * Single-siswa keringanan form. We accept a rentang bulan and expand it into
 * a bulkAssign payload (siswaIds=[one], periods=[...]) so the same endpoint
 * handles both flows and dedup is guaranteed.
 */
export function KeringananForm({
  onSubmit,
  isSubmitting,
  onCancel,
  initialSiswaId,
}: KeringananFormProps) {
  const [siswaId, setSiswaId] = useState<string>(initialSiswaId ?? '');
  const [range, setRange] = useState<MonthRangeValue | null>(null);
  const [jenis, setJenis] = useState<JenisKeringanan>('JUARA');
  const [persentase, setPersentase] = useState<number>(100);
  const [alasan, setAlasan] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const monthCount = countMonthsInRange(range);

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!siswaId) next.siswaId = 'Pilih siswa terlebih dahulu.';
    if (!range || monthCount <= 0) next.range = 'Pilih rentang bulan yang valid.';
    if (persentase < 0 || persentase > 100) next.persentase = 'Persentase harus 0–100.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!range) return;

    const periods = enumerateMonthRange(range);
    const payload: KeringananBulkAssignInput = {
      siswaIds: [siswaId],
      periods,
      jenis,
      persentase,
      alasan: alasan.trim() || undefined,
    };
    await onSubmit(payload, { label: `${monthCount} bulan` });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormFieldWrapper label="Siswa" required error={errors.siswaId}>
        <SiswaCombobox value={siswaId} onChange={(id) => setSiswaId(id)} />
      </FormFieldWrapper>

      <FormFieldWrapper
        label="Rentang periode"
        required
        hint="Pilih bulan mulai dan akhir (inklusif)."
        error={errors.range}
      >
        <MonthRangePicker value={range} onChange={setRange} />
      </FormFieldWrapper>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Jenis keringanan" required>
          <Select value={jenis} onValueChange={(v) => setJenis(v as JenisKeringanan)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {JENIS_KERINGANAN.map((j) => (
                <SelectItem key={j} value={j}>
                  {JENIS_LABEL[j]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>

        <FormFieldWrapper
          label="Persentase (%)"
          required
          hint="100% berarti bebas biaya penuh."
          error={errors.persentase}
        >
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={persentase}
            onChange={(e) => setPersentase(Number(e.target.value))}
          />
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper label="Alasan / catatan" hint="Opsional. Mis: Juara 1 Olimpiade Matematika.">
        <Textarea
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </FormFieldWrapper>

      {range && monthCount > 0 ? (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Akan membuat <span className="font-semibold text-slate-900">{monthCount}</span> entri
          keringanan untuk siswa terpilih.
        </div>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Batal
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Simpan keringanan
        </Button>
      </div>
    </form>
  );
}
