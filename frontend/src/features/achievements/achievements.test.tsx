import { screen, within } from '@testing-library/react'
import { Medal as MedalIcon } from 'lucide-react'
import { afterEach, describe, expect, it } from 'vitest'

import { mockApi, renderWithProviders } from '@/test/utils'

import AchievementsPage from './AchievementsPage'
import { AchievementsStrip } from './AchievementsStrip'
import { achievementsFixture } from './fixtures'
import { achievementIcon } from './icons'
import { nextUp, recentUnlocked } from './model'

afterEach(() => localStorage.clear())

const ok = (body: unknown) => ({ status: 200, body })

describe('página de conquistas', () => {
  it('mostra as medalhas por nível, o placar e o progresso das bloqueadas', async () => {
    mockApi((url) => (url === '/api/achievements' ? ok(achievementsFixture) : undefined))
    renderWithProviders(<AchievementsPage />)

    expect(await screen.findByRole('heading', { name: 'Bronze' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Prata' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Ouro' })).toBeInTheDocument()
    expect(screen.getByText('de 12 conquistadas')).toBeInTheDocument()

    const ouro = screen.getByRole('heading', { name: 'Ouro' }).closest('section')!
    expect(within(ouro).getByText('87 de 100')).toBeInTheDocument()
    expect(within(ouro).getByText(/Ouro, bloqueada, 87 de 100/)).toBeInTheDocument()
    expect(screen.getAllByText(/Prata, conquistada em/, { selector: '.sr-only' }).length).toBe(3)
  })

  it('anuncia as conquistas novas só na primeira vez que aparecem', async () => {
    mockApi((url) => (url === '/api/achievements' ? ok(achievementsFixture) : undefined))
    const first = renderWithProviders(<AchievementsPage />)
    expect(await screen.findByText(/Novas conquistas: .*Primeiro treino/)).toBeInTheDocument()
    first.unmount()

    renderWithProviders(<AchievementsPage />)
    await screen.findByRole('heading', { name: 'Bronze' })
    expect(screen.queryByText(/Novas conquistas/)).not.toBeInTheDocument()
  })

  it('explica quando as conquistas ainda não estão disponíveis (404)', async () => {
    mockApi(() => undefined)
    renderWithProviders(<AchievementsPage />)
    expect(await screen.findByText('As medalhas estão sendo cunhadas')).toBeInTheDocument()
  })
})

describe('bloco de conquistas no início', () => {
  it('mostra as recentes, a próxima e o link para /conquistas', async () => {
    mockApi((url) => (url === '/api/achievements' ? ok(achievementsFixture) : undefined))
    renderWithProviders(<AchievementsStrip />)

    expect(await screen.findByRole('heading', { name: 'Conquistas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver todas/ })).toHaveAttribute('href', '/conquistas')
    expect(screen.getByText('Um mês sem falhar')).toBeInTheDocument()
    expect(screen.getByText('Próxima conquista')).toBeInTheDocument()
    expect(screen.getByText('Cem treinos')).toBeInTheDocument()
    expect(screen.getByText('7 de 12 medalhas cunhadas')).toBeInTheDocument()
  })

  it('some em silêncio se a rota não existir', async () => {
    const { calls } = mockApi(() => undefined)
    renderWithProviders(<AchievementsStrip />)
    await new Promise((r) => setTimeout(r, 50))
    expect(calls.some((c) => c.url === '/api/achievements')).toBe(true)
    expect(screen.queryByRole('heading', { name: 'Conquistas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

describe('regras das conquistas', () => {
  it('ordena recentes por data e próximas por progresso', () => {
    expect(recentUnlocked(achievementsFixture)[0]!.key).toBe('sequencia-4')
    expect(nextUp(achievementsFixture).map((a) => a.key).slice(0, 2)).toEqual(['cem-treinos', 'dez-recordes'])
  })

  it('cai na medalha genérica com ícone desconhecido', () => {
    expect(achievementIcon('icone-que-nao-existe')).toBe(MedalIcon)
    expect(achievementIcon('dumbbell')).not.toBe(MedalIcon)
  })
})
