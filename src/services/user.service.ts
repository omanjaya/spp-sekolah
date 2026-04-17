import bcrypt from 'bcryptjs'
import type { Prisma, User } from '@prisma/client'

import { userRepo } from '@/repositories/user.repo'
import { ConflictError, NotFoundError, ValidationError } from '@/core/errors'
import { PASSWORD_POLICY } from '@/core/constants'
import type {
  AdminChangePasswordInput,
  SelfChangePasswordInput,
  UpdateOwnProfileInput,
  UserCreateInput,
  UserUpdateInput,
} from '@/lib/validators/user.schema'
import type { Role, UserDTO } from '@/types/domain'

function toDTO(u: User): UserDTO {
  return {
    id: u.id,
    email: u.email,
    nama: u.nama,
    role: u.role as Role,
    isActive: u.isActive,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  }
}

function isUniqueError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: string }).code === 'P2002'
  )
}

export const userService = {
  async list(): Promise<UserDTO[]> {
    const rows = await userRepo.list()
    return rows.map(toDTO)
  },

  async getById(id: string): Promise<UserDTO> {
    const row = await userRepo.findById(id)
    if (!row) throw new NotFoundError('Pengguna tidak ditemukan.')
    return toDTO(row)
  },

  async create(input: UserCreateInput): Promise<UserDTO> {
    try {
      const hash = await bcrypt.hash(input.password, PASSWORD_POLICY.BCRYPT_COST)
      const created = await userRepo.create({
        email: input.email,
        nama: input.nama,
        role: input.role,
        passwordHash: hash,
        isActive: input.isActive ?? true,
      })
      return toDTO(created)
    } catch (err) {
      if (isUniqueError(err)) throw new ConflictError('Email sudah terdaftar.')
      throw err
    }
  },

  async update(id: string, input: UserUpdateInput): Promise<UserDTO> {
    const exists = await userRepo.findById(id)
    if (!exists) throw new NotFoundError('Pengguna tidak ditemukan.')
    try {
      const data: Prisma.UserUpdateInput = {}
      if (input.email !== undefined) data.email = input.email
      if (input.nama !== undefined) data.nama = input.nama
      if (input.role !== undefined) data.role = input.role
      if (input.isActive !== undefined) data.isActive = input.isActive
      const updated = await userRepo.update(id, data)
      return toDTO(updated)
    } catch (err) {
      if (isUniqueError(err)) throw new ConflictError('Email sudah terdaftar.')
      throw err
    }
  },

  async remove(id: string): Promise<void> {
    const exists = await userRepo.findById(id)
    if (!exists) throw new NotFoundError('Pengguna tidak ditemukan.')
    try {
      await userRepo.delete(id)
    } catch (err) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code?: string }).code === 'P2003'
      ) {
        // Foreign key constraint — user masih punya importBatch/auditLog.
        // Soft-disable saja.
        await userRepo.setActive(id, false)
        throw new ConflictError(
          'Pengguna tidak bisa dihapus karena masih memiliki riwayat aksi. Sudah dinonaktifkan.',
        )
      }
      throw err
    }
  },

  async setActive(id: string, isActive: boolean): Promise<UserDTO> {
    const exists = await userRepo.findById(id)
    if (!exists) throw new NotFoundError('Pengguna tidak ditemukan.')
    const updated = await userRepo.setActive(id, isActive)
    return toDTO(updated)
  },

  async adminChangePassword(id: string, input: AdminChangePasswordInput): Promise<void> {
    const exists = await userRepo.findById(id)
    if (!exists) throw new NotFoundError('Pengguna tidak ditemukan.')
    const hash = await bcrypt.hash(input.newPassword, PASSWORD_POLICY.BCRYPT_COST)
    await userRepo.update(id, { passwordHash: hash })
  },

  async selfChangePassword(userId: string, input: SelfChangePasswordInput): Promise<void> {
    const user = await userRepo.findById(userId)
    if (!user) throw new NotFoundError('Pengguna tidak ditemukan.')
    const ok = await bcrypt.compare(input.currentPassword, user.passwordHash)
    if (!ok) {
      throw new ValidationError('Kata sandi saat ini tidak cocok.', {
        currentPassword: ['Kata sandi saat ini tidak cocok.'],
      })
    }
    const hash = await bcrypt.hash(input.newPassword, PASSWORD_POLICY.BCRYPT_COST)
    await userRepo.update(userId, { passwordHash: hash })
  },

  async updateOwnProfile(userId: string, input: UpdateOwnProfileInput): Promise<UserDTO> {
    const exists = await userRepo.findById(userId)
    if (!exists) throw new NotFoundError('Pengguna tidak ditemukan.')
    const updated = await userRepo.update(userId, { nama: input.nama })
    return toDTO(updated)
  },

  toDTO,
}
