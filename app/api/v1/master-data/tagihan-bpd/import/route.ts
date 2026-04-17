import type { NextRequest } from 'next/server'

import { apiHandler, requireRole } from '@/lib/api-handler'
import { ROLES } from '@/core/constants'
import { ValidationError } from '@/core/errors'
import { parseTagihanBpd } from '@/lib/excel/tagihan-bpd-parser'
import { importTagihanBpd } from '@/services/tagihan-bpd.service'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024

export const POST = apiHandler(async (req: NextRequest) => {
  const actor = await requireRole([ROLES.SUPER_ADMIN, ROLES.BENDAHARA])

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ValidationError('Gagal membaca form data. Pastikan file dikirim sebagai multipart/form-data.')
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    throw new ValidationError('Field "file" wajib diisi dengan file Excel.')
  }

  if (file.size === 0) throw new ValidationError('File kosong.')
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError(
      `Ukuran file melebihi batas (${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)} MB).`,
    )
  }

  const name = file.name.toLowerCase()
  if (!name.endsWith('.xlsx') && !name.endsWith('.xls')) {
    throw new ValidationError('Hanya file .xlsx atau .xls yang didukung.')
  }

  const buf = new Uint8Array(await file.arrayBuffer())
  const parsed = await parseTagihanBpd(buf, file.name)

  if (parsed.rows.length === 0) {
    throw new ValidationError(
      `Tidak ada data yang berhasil diparsing. ${parsed.errors[0] ?? ''}`.trim(),
    )
  }

  const result = await importTagihanBpd(
    parsed,
    file.name,
    file.size,
    { id: actor.userId, nama: actor.nama },
  )

  return {
    ...result,
    parseErrors: parsed.errors,
  }
})
