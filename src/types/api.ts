/**
 * Standard API response envelope. All `/api/v1/*` handlers return this shape.
 */

export interface ApiMeta {
  page?: number
  limit?: number
  total?: number
  totalPages?: number
}

export interface ApiSuccess<T> {
  success: true
  data: T
  meta?: ApiMeta
}

export interface ApiErrorPayload {
  code: string
  message: string
  details?: unknown
  fields?: Record<string, string[]>
}

export interface ApiErrorResponse {
  success: false
  error: ApiErrorPayload
}

export type ApiResponse<T> = ApiSuccess<T> | ApiErrorResponse
