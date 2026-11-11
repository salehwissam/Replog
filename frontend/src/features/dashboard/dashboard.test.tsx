import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { achievementsFixture } from '@/features/achievements/fixtures'
import { heatmapFixture, summaryFixture } from '@/features/stats/fixtures'
import { fakeUser, mockApi, renderWithProviders } from '@/test/utils'

import DashboardPage from './DashboardPage'

const ok = (body: unknown) => ({ status: 200, body })
const emptyDash = {
  week_workouts: 0,
  week_volume_kg: 0,
  week_sets: 0,
  total_workouts: 0,
  streak_weeks: 0,
  last_session: null,
  active_session_id: null,
  recent_records: [],
  weekly: [],
  week_sessions: [],
}

function base(url: string) {
  if (url === '/api/auth/me') return ok(fakeUser)
  if (url === '/api/stats/dashboard') return ok(emptyDash)
  if (url === '/api/splits') return ok([])
  return undefined
}

describe('início', () => {
  it('funciona sem as análises e conquistas (rotas ainda inexistentes)', async () => {
    mockApi(base)
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByRole('heading', { level: 1, name: /, Ana$/ })).toBeInTheDocument()
    expect(await screen.findByText('Começar treino')).toBeInTheDocument()
    expect(screen.getByText('Nenhum treino registrado ainda. Que tal começar hoje?')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Séries por semana' })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('heading', { name: 'Conquistas' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Sua carreira na barra' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('mostra o resumo geral e as conquistas quando disponíveis', async () => {
    mockApi((url) => {
      if (url === '/api/analytics/summary') return ok(summaryFixture)
      if (url.startsWith('/api/analytics/heatmap')) return ok(heatmapFixture())
      if (url === '/api/achievements') return ok(achievementsFixture)
      return base(url)
    })
    renderWithProviders(<DashboardPage />)
    expect(await screen.findByRole('heading', { name: 'Sua carreira na barra' })).toBeInTheDocument()
    expect(screen.getByText('Desde 02/03/2026')).toBeInTheDocument()
    expect(screen.getByText('Maior carga')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Maior carga.*Agachamento livre/ })).toHaveAttribute('href', '/exercicios/2')
    expect(screen.queryByText(/toneladas|Volume/)).not.toBeInTheDocument()
    expect(screen.queryByText(/anilhas de 20 kg/)).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Supino reto com barra/ })).toHaveAttribute('href', '/exercicios/1')
    expect(await screen.findByRole('heading', { name: 'Conquistas' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Ver todas/ })).toHaveAttribute('href', '/conquistas')
  })
})
