'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { rombelCreateSchema, type RombelCreateInput } from '@/lib/validators/rombel.schema';
import type { TahunAjaranDTO } from '@/types/domain';

export interface RombelFormProps {
  tahunAjaranOptions: TahunAjaranDTO[];
  defaultValues?: Partial<RombelCreateInput>;
  onSubmit: (values: RombelCreateInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export function RombelForm({
  tahunAjaranOptions,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Simpan',
  isSubmitting,
}: RombelFormProps) {
  const form = useForm<RombelCreateInput>({
    resolver: zodResolver(rombelCreateSchema),
    defaultValues: {
      tahunAjaranId: tahunAjaranOptions[0]?.id ?? '',
      grade: 'X',
      nomor: 1,
      kode: '',
      waliKelas: '',
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

  const tahunAjaranId = watch('tahunAjaranId');
  const grade = watch('grade');
  const nomor = watch('nomor');

  // Auto-fill kode bila user belum menulis kode
  const currentKode = watch('kode');
  function maybeAutoKode() {
    if (!currentKode || currentKode.length === 0) {
      setValue('kode', `${grade}.${nomor}`, { shouldDirty: true });
    }
  }

  return (
    <form onSubmit={handleSubmit(async (v) => onSubmit(v))} className="space-y-4">
      <FormFieldWrapper label="Tahun Ajaran" required error={errors.tahunAjaranId?.message}>
        <Select
          value={tahunAjaranId}
          onValueChange={(v) => setValue('tahunAjaranId', v, { shouldDirty: true })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Pilih tahun ajaran" />
          </SelectTrigger>
          <SelectContent>
            {tahunAjaranOptions.length === 0 ? (
              <SelectItem value="__none" disabled>
                Belum ada tahun ajaran
              </SelectItem>
            ) : (
              tahunAjaranOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.kode} {t.isActive ? '(Aktif)' : ''}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </FormFieldWrapper>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Tingkat" required error={errors.grade?.message}>
          <Select
            value={grade}
            onValueChange={(v) => {
              setValue('grade', v as 'X' | 'XI' | 'XII', { shouldDirty: true });
              maybeAutoKode();
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="X">X</SelectItem>
              <SelectItem value="XI">XI</SelectItem>
              <SelectItem value="XII">XII</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="Nomor" required error={errors.nomor?.message}>
          <Input
            type="number"
            min={1}
            max={30}
            {...register('nomor', { valueAsNumber: true, onBlur: maybeAutoKode })}
          />
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper
        label="Kode Rombel"
        required
        hint="Contoh: XII.4 (harus match kolom Excel asik.bpdbali)"
        error={errors.kode?.message}
      >
        <Input {...register('kode')} placeholder="XII.4" className="font-mono" />
      </FormFieldWrapper>

      <FormFieldWrapper label="Wali Kelas" error={errors.waliKelas?.message}>
        <Input {...register('waliKelas')} placeholder="Nama wali kelas (opsional)" />
      </FormFieldWrapper>

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
