'use client';

import { Calculator, Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { SiswaCombobox } from '@/components/combobox/siswa-combobox';
import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { CurrencyInput, formatRupiah } from '@/components/inputs/currency-input';
import {
  MonthRangePicker,
  countMonthsInRange,
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
import type { PelunasanCreateInput } from '@/lib/validators/pelunasan.schema';

const METODE_OPTIONS = [
  { value: 'Tunai', label: 'Tunai' },
  { value: 'Transfer BPD', label: 'Transfer BPD' },
  { value: 'Lainnya', label: 'Lainnya' },
] as const;

export interface PelunasanFormProps {
  onSubmit: (payload: PelunasanCreateInput) => Promise<void> | void;
  isSubmitting?: boolean;
  onCancel?: () => void;
  /** Default nominal per bulan (dari Setting / tahun ajaran aktif). */
  defaultNominalBulanan?: number;
}

function todayIso(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Pelunasan form — catat pembayaran lunas sekaligus untuk rentang bulan.
 * Tidak membuat Pembayaran rows; hanya mencatat pelunasan sebagai marker.
 */
export function PelunasanForm({
  onSubmit,
  isSubmitting,
  onCancel,
  defaultNominalBulanan = 350_000,
}: PelunasanFormProps) {
  const [siswaId, setSiswaId] = useState<string>('');
  const [range, setRange] = useState<MonthRangeValue | null>(null);
  const [nominalTotal, setNominalTotal] = useState<number | null>(null);
  const [tanggalLunas, setTanggalLunas] = useState<string>(todayIso());
  const [noBukti, setNoBukti] = useState<string>('');
  const [metodeLabel, setMetodeLabel] = useState<string>('Tunai');
  const [catatan, setCatatan] = useState<string>('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const months = countMonthsInRange(range);
  const suggestedTotal = useMemo(
    () => months * defaultNominalBulanan,
    [months, defaultNominalBulanan],
  );

  function applySuggestedTotal() {
    if (months > 0) setNominalTotal(suggestedTotal);
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!siswaId) next.siswaId = 'Pilih siswa terlebih dahulu.';
    if (!range || months <= 0) next.range = 'Pilih rentang periode yang valid.';
    if (nominalTotal === null || nominalTotal <= 0) {
      next.nominalTotal = 'Nominal total harus lebih dari 0.';
    }
    if (!tanggalLunas) next.tanggalLunas = 'Tanggal lunas wajib diisi.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    if (!range || nominalTotal === null) return;

    const payload: PelunasanCreateInput = {
      siswaId,
      periodeMulai: range.start,
      periodeAkhir: range.end,
      tanggalLunas,
      nominalTotal,
      noBukti: noBukti.trim() || undefined,
      metodeLabel: metodeLabel.trim() || undefined,
      catatan: catatan.trim() || undefined,
    };
    await onSubmit(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <FormFieldWrapper label="Siswa" required error={errors.siswaId}>
        <SiswaCombobox value={siswaId} onChange={(id) => setSiswaId(id)} />
      </FormFieldWrapper>

      <FormFieldWrapper
        label="Rentang periode lunas"
        required
        hint="Bulan mulai dan akhir (inklusif) yang dinyatakan lunas."
        error={errors.range}
      >
        <MonthRangePicker value={range} onChange={setRange} />
      </FormFieldWrapper>

      <FormFieldWrapper
        label="Nominal total"
        required
        hint={
          months > 0
            ? `Estimasi: ${months} bulan × ${formatRupiah(defaultNominalBulanan)} = ${formatRupiah(
                suggestedTotal,
              )}`
            : 'Pilih rentang periode untuk estimasi otomatis.'
        }
        error={errors.nominalTotal}
      >
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <CurrencyInput value={nominalTotal} onChange={setNominalTotal} />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applySuggestedTotal}
            disabled={months <= 0}
            title="Hitung otomatis dari rentang periode"
          >
            <Calculator className="mr-1 h-4 w-4" aria-hidden="true" />
            Hitung
          </Button>
        </div>
      </FormFieldWrapper>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Tanggal lunas" required error={errors.tanggalLunas}>
          <Input
            type="date"
            value={tanggalLunas}
            onChange={(e) => setTanggalLunas(e.target.value)}
          />
        </FormFieldWrapper>

        <FormFieldWrapper label="Metode pembayaran" hint="Opsional.">
          <Select value={metodeLabel} onValueChange={setMetodeLabel}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {METODE_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper label="No. bukti" hint="Opsional. Harus unik jika diisi.">
        <Input
          value={noBukti}
          onChange={(e) => setNoBukti(e.target.value)}
          placeholder="mis. KWT-20240715-001"
          maxLength={64}
        />
      </FormFieldWrapper>

      <FormFieldWrapper label="Catatan" hint="Opsional.">
        <Textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={3}
          maxLength={500}
        />
      </FormFieldWrapper>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Batal
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Catat pelunasan
        </Button>
      </div>
    </form>
  );
}
