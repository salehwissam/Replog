import { QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'

import { createQueryClient } from '@/App'
import { ToastProvider } from '@/components/ui/Toast'

export function renderWithProviders(ui: ReactElement, { route = '/' }: { route?: string } = {}) {
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    ),
  }
}

type Handler = (url: string, init: RequestInit) => { status: number; body?: unknown } | undefined

export function mockApi(handler: Handler) {
  const calls: { url: string; method: string; body: unknown }[] = []
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init = {}) => {
    const url = String(input)
    const method = init.method ?? 'GET'
    calls.push({ url, method, body: init.body ? JSON.parse(String(init.body)) : undefined })
    if (url === '/api/auth/csrf') {
      document.cookie = 'replog_csrf=teste-csrf; path=/'
      return new Response(null, { status: 204 })
    }
    const res = handler(url, init) ?? {
      status: 404,
      body: { erro: { codigo: 'nao_encontrado', mensagem: 'Recurso não encontrado.' } },
    }
    if (res.status === 204) return new Response(null, { status: 204 })
    return new Response(JSON.stringify(res.body ?? null), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { spy, calls }
}

export const unauthorized = {
  status: 401,
  body: { erro: { codigo: 'nao_autenticado', mensagem: 'Você precisa entrar na sua conta.' } },
}

export const fakeUser = {
  id: 1,
  name: 'Ana Souza',
  email: 'ana@exemplo.com',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  role: 'user',
  created_at: '2026-01-01T00:00:00Z',
}
