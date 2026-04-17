import { ERROR_CODES, HTTP_STATUS } from '../constants'
import { AppError } from './app-error'

export class ForbiddenError extends AppError {
  constructor(message = 'Anda tidak memiliki izin untuk melakukan aksi ini.', details?: unknown) {
    super(ERROR_CODES.FORBIDDEN, message, HTTP_STATUS.FORBIDDEN, details)
  }
}
