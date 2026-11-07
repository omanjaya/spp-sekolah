'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { CurrencyInput } from '@/components/inputs/currency-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  tahunAjaranCreateSchema,
  type TahunAjaranCreateInput,
} from '@/lib/validators/tahun-ajaran.schema';

export interface TahunAjaranFormProps {
  defaultValues?: Partial<TahunAjaranCreateInput>;
  onSubmit: (values: TahunAjaranCreateInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export function TahunAjaranForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Simpan',
  isSubmitting,
}: TahunAjaranFormProps) {
  const thisYear = new Date().getFullYear();
  const form = useForm<TahunAjaranCreateInput>({
    resolver: zodResolver(tahunAjaranCreateSchema),
    defaultValues: {
      kode: `${thisYear}/${thisYear + 1}`,
      tahunMulai: thisYear,
      tahunAkhir: thisYear + 1,
      tanggalMulai: `${thisYear}-07-01`,
      tanggalAkhir: `${thisYear + 1}-06-30`,
      nominalSppDefault: 350_000,
      isActive: false,
      ...defaultValues,
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = form;

  const nominal = watch('nominalSppDefault');
  const isActive = watch('isActive');

  return (
    <form onSubmit={handleSubmit(async (v) => onSubmit(v))} className="space-y-4">
      <FormFieldWrapper label="Kode" required hint="Format YYYY/YYYY" error={errors.kode?.message}>
        <Input {...register('kode')} className="font-mono" />
      </FormFieldWrapper>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Tahun Mulai" required error={errors.tahunMulai?.message}>
          <Input type="number" {...register('tahunMulai', { valueAsNumber: true })} />
        </FormFieldWrapper>
        <FormFieldWrapper label="Tahun Akhir" required error={errors.tahunAkhir?.message}>
          <Input type="number" {...register('tahunAkhir', { valueAsNumber: true })} />
        </FormFieldWrapper>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Tanggal Mulai" required error={errors.tanggalMulai?.message}>
          <Input type="date" {...register('tanggalMulai')} />
        </FormFieldWrapper>
        <FormFieldWrapper label="Tanggal Akhir" required error={errors.tanggalAkhir?.message}>
          <Input type="date" {...register('tanggalAkhir')} />
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper
        label="Nominal Sumbangan Komite Default"
        required
        hint="Nominal per bulan untuk tahun ajaran ini."
        error={errors.nominalSppDefault?.message}
      >
        <CurrencyInput
          value={nominal ?? 0}
          onChange={(v) => setValue('nominalSppDefault', v ?? 0, { shouldDirty: true })}
        />
      </FormFieldWrapper>

      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-slate-900">Aktifkan tahun ajaran ini</div>
          <p className="text-xs text-slate-500">
            Hanya satu tahun ajaran yang bisa aktif pada satu waktu.
          </p>
        </div>
        <Switch
          checked={!!isActive}
          onCheckedChange={(v) => setValue('isActive', v, { shouldDirty: true })}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Batal
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
