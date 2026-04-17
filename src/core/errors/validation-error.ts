import { ERROR_CODES, HTTP_STATUS } from '../constants'
import { AppError } from './app-error'

/**
 * Thrown when input validation fails. `fields` carries field-level messages
 * keyed by dot-path (matches what clients typically render inline).
 */
export class ValidationError extends AppError {
  constructor(
    message = 'Data yang dikirim tidak valid.',
    public readonly fields?: Record<string, string[]>,
    details?: unknown,
  ) {
    super(ERROR_CODES.VALIDATION_ERROR, message, HTTP_STATUS.BAD_REQUEST, details)
  }
}
