import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, ApiError } from './client'

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('cliente da API', () => {
  afterEach(() => vi.restoreAllMocks())

  it('envia o token CSRF do cookie em requisições que alteram dados', async () => {
    document.cookie = 'replog_csrf=abc123; path=/'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, { ok: 1 }))

    await api('/treinos', { method: 'POST', body: { a: 1 } })

    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/treinos')
    expect((init!.headers as Record<string, string>)['X-CSRF-Token']).toBe('abc123')
    expect(init!.credentials).toBe('same-origin')
  })

  it('busca o cookie CSRF antes do primeiro POST quando ele não existe', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementationOnce(async () => {
        document.cookie = 'replog_csrf=novo; path=/'
        return jsonResponse(200, { ok: true })
      })
      .mockResolvedValue(jsonResponse(201, { id: 1 }))

    await api('/auth/login', { method: 'POST', body: {} })

    expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/csrf')
    const init = fetchMock.mock.calls[1]![1]!
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('novo')
  })

  it('não envia CSRF em GET e monta a query string', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(jsonResponse(200, []))
    await api('/historico', { query: { pagina: 2, vazio: '', nulo: null } })
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/historico?pagina=2')
    expect((init!.headers as Record<string, string>)['X-CSRF-Token']).toBeUndefined()
  })

  it('converte erros da API em ApiError com a mensagem em português', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse(422, {
        erro: {
          codigo: 'dados_invalidos',
          mensagem: 'Verifique os dados informados.',
          campos: { email: 'E-mail inválido.' },
        },
      }),
    )
    await expect(api('/x')).rejects.toMatchObject({
      status: 422,
      message: 'Verifique os dados informados.',
      fields: { email: 'E-mail inválido.' },
    })
  })

  it('mostra mensagem amigável quando não há conexão', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'))
    const err = await api('/x').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).message).toMatch(/Sem conexão/)
  })
})
