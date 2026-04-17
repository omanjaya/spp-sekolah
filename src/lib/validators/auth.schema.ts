import { z } from 'zod'
import { PASSWORD_POLICY } from '@/core/constants'

export const loginSchema = z.object({
  email: z
    .string({ required_error: 'Email wajib diisi.' })
    .trim()
    .min(1, 'Email wajib diisi.')
    .email('Format email tidak valid.')
    .max(254, 'Email terlalu panjang.')
    .toLowerCase(),
  password: z
    .string({ required_error: 'Kata sandi wajib diisi.' })
    .min(PASSWORD_POLICY.MIN_LENGTH, `Kata sandi minimal ${PASSWORD_POLICY.MIN_LENGTH} karakter.`)
    .max(128, 'Kata sandi terlalu panjang.'),
})

export type LoginInput = z.infer<typeof loginSchema>

/**
 * Used when a user updates their own password.
 */
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
    newPassword: z
      .string()
      .min(PASSWORD_POLICY.MIN_LENGTH, `Kata sandi minimal ${PASSWORD_POLICY.MIN_LENGTH} karakter.`)
      .max(128, 'Kata sandi terlalu panjang.')
      .regex(/[A-Z]/, 'Kata sandi harus mengandung huruf kapital.')
      .regex(/[a-z]/, 'Kata sandi harus mengandung huruf kecil.')
      .regex(/[0-9]/, 'Kata sandi harus mengandung angka.'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok.',
    path: ['confirmPassword'],
  })

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>
