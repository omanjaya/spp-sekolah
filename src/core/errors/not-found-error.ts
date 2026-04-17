import { ERROR_CODES, HTTP_STATUS } from '../constants'
import { AppError } from './app-error'

export class NotFoundError extends AppError {
  constructor(message = 'Data tidak ditemukan.', details?: unknown) {
    super(ERROR_CODES.NOT_FOUND, message, HTTP_STATUS.NOT_FOUND, details)
  }
}
