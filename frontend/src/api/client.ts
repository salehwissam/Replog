export const CSRF_COOKIE = 'replog_csrf'
const CSRF_COOKIE_NAMES = [`__Host-${CSRF_COOKIE}`, CSRF_COOKIE]

function readCsrf(): string | null {
  for (const name of CSRF_COOKIE_NAMES) {
    const value = readCookie(name)
    if (value) return value
  }
  return null
}

export interface ApiErrorBody {
  erro: { codigo: string; mensagem: string; campos?: Record<string, string> }
}

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields: Record<string, string>

  constructor(status: number, code: string, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

export function readCookie(name: string): string | null {
  for (const part of document.cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
let csrfPromise: Promise<void> | null = null

async function ensureCsrf(): Promise<void> {
  if (readCsrf()) return
  csrfPromise ??= fetch('/api/auth/csrf', { credentials: 'same-origin' })
    .then(() => undefined)
    .finally(() => {
      csrfPromise = null
    })
  await csrfPromise
}

type Query = Record<string, string | number | boolean | undefined | null>

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Query
  signal?: AbortSignal
}

function buildUrl(path: string, query?: Query): string {
  if (!query) return `/api${path}`
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return `/api${path}${qs ? `?${qs}` : ''}`
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? 'GET'
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (UNSAFE.has(method)) {
    await ensureCsrf()
    const token = readCsrf()
    if (token) headers['X-CSRF-Token'] = token
  }
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method,
      headers,
      credentials: 'same-origin',
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err
    throw new ApiError(0, 'sem_conexao', 'Sem conexão com o servidor. Verifique sua internet.')
  }

  if (response.status === 204) return undefined as T

  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const body = data as Partial<ApiErrorBody> | null
    throw new ApiError(
      response.status,
      body?.erro?.codigo ?? 'erro_desconhecido',
      body?.erro?.mensagem ?? 'Não foi possível concluir. Tente novamente.',
      body?.erro?.campos ?? {},
    )
  }
  return data as T
}
