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
import { Textarea } from '@/components/ui/textarea';
import {
  siswaCreateSchema,
  type SiswaCreateInput,
} from '@/lib/validators/siswa.schema';

const STATUS_OPTIONS: Array<{ value: SiswaCreateInput['statusSiswa']; label: string }> = [
  { value: 'AKTIF', label: 'Aktif' },
  { value: 'PINDAH', label: 'Pindah' },
  { value: 'LULUS', label: 'Lulus' },
  { value: 'DO', label: 'Drop Out' },
  { value: 'CUTI', label: 'Cuti' },
];

export interface SiswaFormProps {
  defaultValues?: Partial<SiswaCreateInput>;
  onSubmit: (values: SiswaCreateInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export function SiswaForm({
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel = 'Simpan',
  isSubmitting,
}: SiswaFormProps) {
  const form = useForm<SiswaCreateInput>({
    resolver: zodResolver(siswaCreateSchema),
    defaultValues: {
      nis: '',
      nama: '',
      angkatan: new Date().getFullYear(),
      jenisKelamin: null,
      statusSiswa: 'AKTIF',
      alamat: '',
      kontakOrtu: '',
      catatan: '',
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

  const jenisKelamin = watch('jenisKelamin');
  const statusSiswa = watch('statusSiswa');

  return (
    <form
      onSubmit={handleSubmit(async (values) => {
        await onSubmit(values);
      })}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="NIS" required error={errors.nis?.message}>
          <Input {...register('nis')} placeholder="Contoh: 2023001" className="font-mono" />
        </FormFieldWrapper>
        <FormFieldWrapper label="Angkatan" required error={errors.angkatan?.message}>
          <Input
            type="number"
            min={1990}
            max={2100}
            {...register('angkatan', { valueAsNumber: true })}
          />
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper label="Nama Lengkap" required error={errors.nama?.message}>
        <Input {...register('nama')} placeholder="Nama lengkap siswa" />
      </FormFieldWrapper>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Jenis Kelamin">
          <Select
            value={jenisKelamin ?? 'none'}
            onValueChange={(v) =>
              setValue('jenisKelamin', v === 'none' ? null : (v as 'L' | 'P'), {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Pilih..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">—</SelectItem>
              <SelectItem value="L">Laki-laki</SelectItem>
              <SelectItem value="P">Perempuan</SelectItem>
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="Status" error={errors.statusSiswa?.message}>
          <Select
            value={statusSiswa ?? 'AKTIF'}
            onValueChange={(v) =>
              setValue('statusSiswa', v as SiswaCreateInput['statusSiswa'], {
                shouldDirty: true,
              })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value ?? 'AKTIF'}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
      </div>

      <FormFieldWrapper label="Kontak Orang Tua" hint="Nomor HP atau email" error={errors.kontakOrtu?.message}>
        <Input {...register('kontakOrtu')} placeholder="08xxxxxxxxxx" />
      </FormFieldWrapper>

      <FormFieldWrapper label="Alamat" error={errors.alamat?.message}>
        <Textarea {...register('alamat')} rows={2} />
      </FormFieldWrapper>

      <FormFieldWrapper label="Catatan" error={errors.catatan?.message}>
        <Textarea {...register('catatan')} rows={2} />
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
