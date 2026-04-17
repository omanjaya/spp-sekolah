import { z } from 'zod'
import { ALL_ROLES, PASSWORD_POLICY } from '@/core/constants'

const roleEnum = z.enum(ALL_ROLES as [typeof ALL_ROLES[number], ...typeof ALL_ROLES])

const passwordPolicy = z
  .string()
  .min(PASSWORD_POLICY.MIN_LENGTH, `Kata sandi minimal ${PASSWORD_POLICY.MIN_LENGTH} karakter.`)
  .max(128, 'Kata sandi terlalu panjang.')
  .regex(/[A-Z]/, 'Kata sandi harus mengandung huruf kapital.')
  .regex(/[a-z]/, 'Kata sandi harus mengandung huruf kecil.')
  .regex(/[0-9]/, 'Kata sandi harus mengandung angka.')

export const userCreateSchema = z.object({
  email: z
    .string({ required_error: 'Email wajib diisi.' })
    .trim()
    .email('Format email tidak valid.')
    .max(254, 'Email terlalu panjang.')
    .toLowerCase(),
  nama: z
    .string({ required_error: 'Nama wajib diisi.' })
    .trim()
    .min(2, 'Nama minimal 2 karakter.')
    .max(120, 'Nama terlalu panjang.'),
  role: roleEnum,
  password: passwordPolicy,
  isActive: z.boolean().optional(),
})

export type UserCreateInput = z.infer<typeof userCreateSchema>

export const userUpdateSchema = z.object({
  email: z
    .string()
    .trim()
    .email('Format email tidak valid.')
    .max(254)
    .toLowerCase()
    .optional(),
  nama: z.string().trim().min(2).max(120).optional(),
  role: roleEnum.optional(),
  isActive: z.boolean().optional(),
})

export type UserUpdateInput = z.infer<typeof userUpdateSchema>

export const adminChangePasswordSchema = z.object({
  newPassword: passwordPolicy,
})

export type AdminChangePasswordInput = z.infer<typeof adminChangePasswordSchema>

export const selfChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
    newPassword: passwordPolicy,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Konfirmasi kata sandi tidak cocok.',
    path: ['confirmPassword'],
  })

export type SelfChangePasswordInput = z.infer<typeof selfChangePasswordSchema>

export const updateOwnProfileSchema = z.object({
  nama: z.string().trim().min(2, 'Nama minimal 2 karakter.').max(120, 'Nama terlalu panjang.'),
})

export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>
