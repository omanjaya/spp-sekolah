/**
 * DTO types yang di-serialize aman untuk client (Decimal → number, Date → ISO string).
 * Services return shape ini, bukan raw Prisma models.
 */

export type Gender = 'L' | 'P'
export type StatusSiswa = 'AKTIF' | 'PINDAH' | 'LULUS' | 'DO' | 'CUTI'
export type Grade = 'X' | 'XI' | 'XII'
export type Role = 'SUPER_ADMIN' | 'BENDAHARA' | 'TU' | 'VIEWER'

export interface SiswaDTO {
  id: string
  nis: string
  nama: string
  jenisKelamin: Gender | null
  angkatan: number
  statusSiswa: StatusSiswa
  alamat: string | null
  kontakOrtu: string | null
  catatan: string | null
  createdAt: string
  updatedAt: string
  enrollmentAktif?: EnrollmentDTO | null
}

export interface TahunAjaranDTO {
  id: string
  kode: string
  tahunMulai: number
  tahunAkhir: number
  tanggalMulai: string
  tanggalAkhir: string
  isActive: boolean
  nominalSppDefault: number
  createdAt: string
}

export interface RombelDTO {
  id: string
  tahunAjaranId: string
  tahunAjaran?: TahunAjaranDTO | null
  grade: Grade
  nomor: number
  kode: string
  waliKelas: string | null
  createdAt: string
  jumlahSiswa?: number
}

export interface EnrollmentDTO {
  id: string
  siswaId: string
  rombelId: string
  tahunAjaranId: string
  noAbsen: number | null
  createdAt: string
  siswa?: SiswaDTO | null
  rombel?: RombelDTO | null
  tahunAjaran?: TahunAjaranDTO | null
}

export interface UserDTO {
  id: string
  email: string
  nama: string
  role: Role
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
  updatedAt: string
}

export interface SettingDTO {
  key: string
  value: unknown
  description: string | null
  updatedAt: string
}

export interface BulkResult {
  total: number
  created: number
  updated: number
  skipped: number
  errors: Array<{ row: number; message: string; data?: unknown }>
}
