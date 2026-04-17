import type { ApiErrorResponse, ApiResponse, ApiSuccess } from '@/types/api';

export class HttpError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly fields?: Record<string, string[]>,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined | null>;
};

function buildUrl(path: string, searchParams?: RequestOptions['searchParams']) {
  if (!searchParams) return path;
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(searchParams)) {
    if (v === undefined || v === null || v === '') continue;
    usp.set(k, String(v));
  }
  const qs = usp.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { body, searchParams, headers, ...rest } = opts;
  const init: RequestInit = {
    ...rest,
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  };

  const res = await fetch(buildUrl(path, searchParams), init);
  const text = await res.text();
  let parsed: ApiResponse<T> | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new HttpError('INVALID_JSON', `Server returned non-JSON (${res.status})`, res.status);
    }
  }
  if (!res.ok || !parsed || parsed.success === false) {
    const err = (parsed as ApiErrorResponse | null)?.error;
    throw new HttpError(
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Permintaan gagal (${res.status})`,
      res.status,
      err?.fields,
      err?.details,
    );
  }
  return (parsed as ApiSuccess<T>).data;
}

export async function apiFetchRaw(path: string, opts: RequestOptions = {}): Promise<Response> {
  const { body, searchParams, headers, ...rest } = opts;
  return fetch(buildUrl(path, searchParams), {
    ...rest,
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  opts: Omit<RequestOptions, 'body'> = {},
): Promise<T> {
  const { searchParams, headers, ...rest } = opts;
  const res = await fetch(buildUrl(path, searchParams), {
    method: 'POST',
    ...rest,
    headers: { ...headers },
    body: formData,
  });
  const text = await res.text();
  let parsed: ApiResponse<T> | null = null;
  if (text) {
    try {
      parsed = JSON.parse(text) as ApiResponse<T>;
    } catch {
      throw new HttpError('INVALID_JSON', `Server returned non-JSON (${res.status})`, res.status);
    }
  }
  if (!res.ok || !parsed || parsed.success === false) {
    const err = (parsed as ApiErrorResponse | null)?.error;
    throw new HttpError(
      err?.code ?? 'HTTP_ERROR',
      err?.message ?? `Permintaan gagal (${res.status})`,
      res.status,
      err?.fields,
      err?.details,
    );
  }
  return (parsed as ApiSuccess<T>).data;
}
