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
import { Switch } from '@/components/ui/switch';
import {
  userCreateSchema,
  userUpdateSchema,
  type UserCreateInput,
  type UserUpdateInput,
} from '@/lib/validators/user.schema';
import type { Role } from '@/types/domain';

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  BENDAHARA: 'Bendahara',
  TU: 'Tata Usaha',
  VIEWER: 'Viewer',
};

export interface UserFormProps {
  mode: 'create' | 'edit';
  defaultValues?: Partial<UserCreateInput & UserUpdateInput>;
  onSubmit: (values: UserCreateInput | UserUpdateInput) => Promise<void> | void;
  onCancel?: () => void;
  submitLabel?: string;
  isSubmitting?: boolean;
}

export function UserForm({
  mode,
  defaultValues,
  onSubmit,
  onCancel,
  submitLabel,
  isSubmitting,
}: UserFormProps) {
  const schema = mode === 'create' ? userCreateSchema : userUpdateSchema;

  const form = useForm<UserCreateInput & Partial<UserUpdateInput>>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      email: '',
      nama: '',
      role: 'BENDAHARA',
      password: '',
      isActive: true,
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

  const role = watch('role');
  const isActive = watch('isActive');

  return (
    <form onSubmit={handleSubmit(async (v) => onSubmit(v))} className="space-y-4">
      <FormFieldWrapper label="Email" required error={errors.email?.message}>
        <Input type="email" {...register('email')} autoComplete="off" />
      </FormFieldWrapper>

      <FormFieldWrapper label="Nama" required error={errors.nama?.message}>
        <Input {...register('nama')} />
      </FormFieldWrapper>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormFieldWrapper label="Role" required error={errors.role?.message}>
          <Select
            value={role ?? 'BENDAHARA'}
            onValueChange={(v) => setValue('role', v as Role, { shouldDirty: true })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABEL[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormFieldWrapper>
        <FormFieldWrapper label="Status">
          <div className="flex items-center gap-3 rounded-md border border-slate-200 px-3 py-2">
            <Switch
              checked={!!isActive}
              onCheckedChange={(v) => setValue('isActive', v, { shouldDirty: true })}
            />
            <span className="text-sm text-slate-700">{isActive ? 'Aktif' : 'Nonaktif'}</span>
          </div>
        </FormFieldWrapper>
      </div>

      {mode === 'create' ? (
        <FormFieldWrapper
          label="Kata sandi"
          required
          hint="Minimal 10 karakter, mengandung huruf kapital, kecil, dan angka."
          error={errors.password?.message}
        >
          <Input type="password" autoComplete="new-password" {...register('password')} />
        </FormFieldWrapper>
      ) : null}

      <div className="flex items-center justify-end gap-2 pt-2">
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Batal
          </Button>
        ) : null}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {submitLabel ?? (mode === 'create' ? 'Buat pengguna' : 'Simpan')}
        </Button>
      </div>
    </form>
  );
}
