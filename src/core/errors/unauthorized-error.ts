import { ERROR_CODES, HTTP_STATUS } from '../constants'
import { AppError } from './app-error'

export class UnauthorizedError extends AppError {
  constructor(message = 'Anda harus masuk untuk mengakses sumber daya ini.', details?: unknown) {
    super(ERROR_CODES.UNAUTHORIZED, message, HTTP_STATUS.UNAUTHORIZED, details)
  }
}
