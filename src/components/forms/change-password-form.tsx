'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useForm } from 'react-hook-form';

import { FormFieldWrapper } from '@/components/forms/form-field-wrapper';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  selfChangePasswordSchema,
  type SelfChangePasswordInput,
} from '@/lib/validators/user.schema';

export interface ChangePasswordFormProps {
  onSubmit: (values: SelfChangePasswordInput) => Promise<void> | void;
  isSubmitting?: boolean;
}

export function ChangePasswordForm({ onSubmit, isSubmitting }: ChangePasswordFormProps) {
  const form = useForm<SelfChangePasswordInput>({
    resolver: zodResolver(selfChangePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = form;

  return (
    <form
      onSubmit={handleSubmit(async (v) => {
        await onSubmit(v);
        reset();
      })}
      className="space-y-4"
    >
      <FormFieldWrapper label="Kata sandi saat ini" required error={errors.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...register('currentPassword')} />
      </FormFieldWrapper>

      <FormFieldWrapper
        label="Kata sandi baru"
        required
        hint="Minimal 10 karakter, mengandung huruf kapital, kecil, dan angka."
        error={errors.newPassword?.message}
      >
        <Input type="password" autoComplete="new-password" {...register('newPassword')} />
      </FormFieldWrapper>

      <FormFieldWrapper label="Konfirmasi kata sandi" required error={errors.confirmPassword?.message}>
        <Input type="password" autoComplete="new-password" {...register('confirmPassword')} />
      </FormFieldWrapper>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          Ubah kata sandi
        </Button>
      </div>
    </form>
  );
}
