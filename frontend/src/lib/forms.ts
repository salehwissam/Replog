import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'

import { ApiError } from '@/api/client'

export function applyApiErrors<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string {
  if (!(err instanceof ApiError)) return 'Não foi possível concluir. Tente novamente.'
  let general = err.message
  for (const [key, message] of Object.entries(err.fields)) {
    if ((fields as readonly string[]).includes(key)) {
      setError(key as Path<T>, { type: 'server', message })
    } else if (key === 'requisicao' || key === '') {
      general = message
    }
  }
  return general
}

export function tokenFromHash(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const token = params.get('token')
  return token && /^[A-Za-z0-9_-]{20,128}$/.test(token) ? token : null
}
