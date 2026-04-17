/**
 * Base domain error. Every thrown error in the app layer extends this so that
 * `api-handler` can format it into the standard response envelope.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = this.constructor.name
    // Preserve the stack where available (V8-only API, hence the cast).
    const capture = (Error as unknown as {
      captureStackTrace?: (target: object, ctor: (...args: never[]) => unknown) => void
    }).captureStackTrace
    if (typeof capture === 'function') {
      capture(this, this.constructor as (...args: never[]) => unknown)
    }
  }
}
