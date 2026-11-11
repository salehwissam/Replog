import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import { heatTiers } from '@/components/charts/PlateHeatmap'
import { mockApi, renderWithProviders } from '@/test/utils'

import { heatmapFixture, musclesFixture } from './fixtures'
import StatsPage from './StatsPage'

const ok = (body: unknown) => ({ status: 200, body })
const buckets = Array.from({ length: 12 }, (_, i) => ({
  start: `2026-0${(i % 9) + 1}-01`,
  label: `S${i + 1}`,
  volume_kg: 3000 + i * 250,
  workouts: 3 + (i % 2),
  sets: 40 + i,
}))

function baseApi(url: string) {
  if (url.startsWith('/api/stats/volume')) return ok(buckets)
  if (url.startsWith('/api/records/per-month')) return ok(buckets)
  if (url === '/api/records') return ok([])
  return undefined
}

describe('estatísticas', () => {
  it('mostra o mapa de treinos e os grupos musculares (B3)', async () => {
    const { calls } = mockApi((url) => {
      if (url.startsWith('/api/analytics/heatmap')) return ok(heatmapFixture())
      if (url.startsWith('/api/analytics/muscles')) return ok(musclesFixture)
      return baseApi(url)
    })
    renderWithProviders(<StatsPage />)

    expect(await screen.findByRole('heading', { name: 'Mapa de treinos' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Grupos musculares' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Séries por semana' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Desempenho por exercício' })).toBeInTheDocument()
    expect(screen.getAllByText('Peito').length).toBeGreaterThan(0)
    expect(calls.some((c) => c.url === '/api/analytics/heatmap?days=182')).toBe(true)
    expect(calls.some((c) => c.url === '/api/analytics/muscles?weeks=4')).toBe(true)

    await userEvent.click(screen.getByRole('radio', { name: '3 meses' }))
    await waitFor(() => expect(calls.some((c) => c.url === '/api/analytics/muscles?weeks=12')).toBe(true))
    expect(screen.getByRole('radio', { name: '3 meses' })).toHaveAttribute('aria-checked', 'true')
  })

  it('percorre os dias do mapa pelo teclado', async () => {
    mockApi((url) => {
      if (url.startsWith('/api/analytics/heatmap')) return ok(heatmapFixture())
      return baseApi(url)
    })
    renderWithProviders(<StatsPage />)
    const map = await screen.findByRole('group', { name: /Mapa de treinos dos últimos 6 meses/ })
    map.focus()
    fireEvent.keyDown(map, { key: 'End' })
    expect(map).toHaveAccessibleDescription(/: (sem treino|1 treino, \d+ séries?)$/)
    fireEvent.keyDown(map, { key: 'ArrowLeft' })
    expect(map).toHaveAccessibleDescription(/: (sem treino|1 treino, \d+ séries?)$/)
  })

  it('esconde as análises em silêncio quando as rotas não existem (404)', async () => {
    mockApi(baseApi)
    renderWithProviders(<StatsPage />)
    expect(await screen.findByRole('heading', { name: 'Séries por semana' })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('heading', { name: 'Mapa de treinos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Grupos musculares' })).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('degraus do mapa de calor', () => {
  it('usa os quartis das séries dos dias treinados', () => {
    const days = [0, 6, 12, 18, 24].map((n, i) => ({ date: `2026-11-0${i + 1}`, volume_kg: 0, workouts: n ? 1 : 0, sets: n }))
    const tier = heatTiers(days)
    expect(days.map(tier)).toEqual([0, 1, 2, 3, 4])
  })

  it('treino sem séries de trabalho ainda vira anilha', () => {
    const days = [{ date: '2026-11-01', volume_kg: 0, workouts: 1, sets: 0 }]
    expect(heatTiers(days)(days[0]!)).toBe(1)
  })
})
