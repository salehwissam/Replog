import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AppRoutes } from '@/App'
import { fakeUser, mockApi, renderWithProviders, unauthorized } from '@/test/utils'

afterEach(() => vi.restoreAllMocks())

describe('Perfil', () => {
  it('oferece a planilha CSV ao lado do JSON', async () => {
    mockApi((url) => (url === '/api/auth/me' ? { status: 200, body: fakeUser } : undefined))
    renderWithProviders(<AppRoutes />, { route: '/perfil' })
    const csv = await screen.findByRole('link', { name: /Baixar planilha \(CSV\)/ })
    expect(csv).toHaveAttribute('href', '/api/users/me/export.csv')
    expect(csv).toHaveAttribute('download')
    expect(screen.getByRole('link', { name: /Baixar meus dados/ })).toHaveAttribute('href', '/api/users/me/export')
  })
})

describe('Força da senha no cadastro', () => {
  it('anuncia a força e marca os requisitos atendidos', async () => {
    mockApi((url) => (url === '/api/auth/me' ? unauthorized : undefined))
    renderWithProviders(<AppRoutes />, { route: '/cadastrar' })
    const senha = await screen.findByLabelText('Senha')
    await userEvent.type(senha, 'curta')
    expect(screen.getByText('Força: Curta demais')).toBeInTheDocument()
    await userEvent.clear(senha)
    await userEvent.type(senha, 'Treino-Pesado-2026')
    expect(screen.getByText('Força: Forte')).toBeInTheDocument()
    expect(screen.getByText(/Números e símbolos/)).toHaveTextContent('Números e símbolos, ok')
  })
})
