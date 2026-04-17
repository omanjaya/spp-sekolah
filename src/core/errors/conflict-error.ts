import { ERROR_CODES, HTTP_STATUS } from '../constants'
import { AppError } from './app-error'

export class ConflictError extends AppError {
  constructor(message = 'Data sudah ada atau konflik dengan kondisi saat ini.', details?: unknown) {
    super(ERROR_CODES.CONFLICT, message, HTTP_STATUS.CONFLICT, details)
  }
}
