import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/App'
import { fakeUser, mockApi, renderWithProviders, unauthorized } from '@/test/utils'

afterEach(() => vi.restoreAllMocks())

describe('Tela de entrada', () => {
  it('valida os campos em português antes de chamar a API', async () => {
    const { calls } = mockApi((url) => (url === '/api/auth/me' ? unauthorized : undefined))
    renderWithProviders(<AppRoutes />, { route: '/entrar' })

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Informe seu e-mail.')).toBeInTheDocument()
    expect(screen.getByText('Informe sua senha.')).toBeInTheDocument()
    expect(calls.some((c) => c.url === '/api/auth/login')).toBe(false)
  })

  it('mostra a mensagem genérica de credenciais inválidas', async () => {
    mockApi((url) => {
      if (url === '/api/auth/me') return unauthorized
      if (url === '/api/auth/login')
        return {
          status: 401,
          body: { erro: { codigo: 'credenciais_invalidas', mensagem: 'E-mail ou senha incorretos.' } },
        }
    })
    renderWithProviders(<AppRoutes />, { route: '/entrar' })

    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@exemplo.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'errada-errada')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha incorretos.')
  })

  it('envia o fuso do aparelho e o token CSRF no login', async () => {
    const { calls, spy } = mockApi((url) => {
      if (url === '/api/auth/me') return unauthorized
      if (url === '/api/auth/login') return { status: 200, body: fakeUser }
      if (url === '/api/stats/dashboard')
        return {
          status: 200,
          body: {
            week_workouts: 0, week_volume_kg: 0, week_sets: 0, total_workouts: 0, streak_weeks: 0,
            last_session: null, active_session_id: null, recent_records: [], weekly: [],
          },
        }
    })
    renderWithProviders(<AppRoutes />, { route: '/entrar' })

    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@exemplo.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Treino-Pesado-2026')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => expect(calls.some((c) => c.url === '/api/auth/login')).toBe(true))
    const login = calls.find((c) => c.url === '/api/auth/login')!
    expect(login.body).toMatchObject({ email: 'ana@exemplo.com', timezone: fakeUser.timezone })
    const init = spy.mock.calls.find(([u]) => u === '/api/auth/login')![1]!
    expect((init.headers as Record<string, string>)['X-CSRF-Token']).toBe('teste-csrf')
    expect(await screen.findByText(/Ana$/)).toBeInTheDocument()
  })

  it('oferece reenviar a confirmação quando o e-mail não foi confirmado', async () => {
    mockApi((url) => {
      if (url === '/api/auth/me') return unauthorized
      if (url === '/api/auth/login')
        return {
          status: 403,
          body: { erro: { codigo: 'email_nao_confirmado', mensagem: 'Confirme seu e-mail antes de entrar.' } },
        }
    })
    renderWithProviders(<AppRoutes />, { route: '/entrar' })
    await userEvent.type(await screen.findByLabelText('E-mail'), 'ana@exemplo.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Treino-Pesado-2026')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('button', { name: 'Reenviar e-mail de confirmação' })).toBeInTheDocument()
  })
})

describe('Cadastro', () => {
  it('exige senha forte e confirmação igual', async () => {
    mockApi((url) => (url === '/api/auth/me' ? unauthorized : undefined))
    renderWithProviders(<AppRoutes />, { route: '/cadastrar' })

    await userEvent.type(await screen.findByLabelText('Nome'), 'Ana')
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'curta')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'diferente')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))

    expect(await screen.findByText('A senha deve ter pelo menos 10 caracteres.')).toBeInTheDocument()
  })

  it('mostra a confirmação de envio após cadastrar', async () => {
    mockApi((url) => {
      if (url === '/api/auth/me') return unauthorized
      if (url === '/api/auth/register') return { status: 202, body: { mensagem: 'ok' } }
    })
    renderWithProviders(<AppRoutes />, { route: '/cadastrar' })
    await userEvent.type(await screen.findByLabelText('Nome'), 'Ana Souza')
    await userEvent.type(screen.getByLabelText('E-mail'), 'ana@exemplo.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'Treino-Pesado-2026')
    await userEvent.type(screen.getByLabelText('Confirme a senha'), 'Treino-Pesado-2026')
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }))
    expect(await screen.findByRole('heading', { name: 'Confira seu e-mail' })).toBeInTheDocument()
    expect(screen.getByText('ana@exemplo.com')).toBeInTheDocument()
  })
})

describe('Rotas protegidas', () => {
  it('manda para a tela de entrada quando não há sessão', async () => {
    mockApi((url) => (url === '/api/auth/me' ? unauthorized : undefined))
    renderWithProviders(<AppRoutes />, { route: '/historico' })
    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
  })

  it('mostra o dashboard vazio com orientação para começar', async () => {
    mockApi((url) => {
      if (url === '/api/auth/me') return { status: 200, body: fakeUser }
      if (url === '/api/stats/dashboard')
        return {
          status: 200,
          body: {
            week_workouts: 0, week_volume_kg: 0, week_sets: 0, total_workouts: 0, streak_weeks: 0,
            last_session: null, active_session_id: null, recent_records: [],
            weekly: [{ start: '2026-11-02', label: '02/11', volume_kg: 0, workouts: 0, sets: 0 }],
          },
        }
    })
    renderWithProviders(<AppRoutes />, { route: '/' })
    expect(await screen.findByText('Começar treino')).toBeInTheDocument()
    expect(screen.getByText('Nenhum treino registrado ainda. Que tal começar hoje?')).toBeInTheDocument()
  })

  it('página inexistente mostra 404 em português', async () => {
    mockApi(() => undefined)
    renderWithProviders(<AppRoutes />, { route: '/qualquer-coisa' })
    expect(await screen.findByText('Página não encontrada')).toBeInTheDocument()
  })
})

describe('Confirmação de e-mail', () => {
  it('pede a senha e confirma com o token do link', async () => {
    window.history.replaceState(null, '', '/confirmar-email#token=abcdefghijklmnopqrstuvwxyz0123456789')
    const { calls } = mockApi((url) => {
      if (url === '/api/auth/me') return unauthorized
      if (url === '/api/auth/verify-email') return { status: 200, body: { mensagem: 'E-mail confirmado!' } }
    })
    renderWithProviders(<AppRoutes />, { route: '/confirmar-email' })
    await userEvent.type(await screen.findByLabelText('Senha do cadastro'), 'Treino-Pesado-2026')
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar e-mail' }))
    expect(await screen.findByText('E-mail confirmado!')).toBeInTheDocument()
    expect(calls.find((c) => c.url === '/api/auth/verify-email')!.body).toEqual({
      token: 'abcdefghijklmnopqrstuvwxyz0123456789',
      password: 'Treino-Pesado-2026',
    })
    expect(window.location.hash).toBe('')
  })
})
