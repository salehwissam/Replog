import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { Program } from '@/api/workouts'
import { parseDays, weekPattern } from '@/features/programs/programUtils'
import { fakeUser, mockApi, renderWithProviders } from '@/test/utils'

import { recommendProgram, welcomeSeen } from './recommend'
import WelcomePage from './WelcomePage'

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

const ex = (name: string, muscle_group: string) => ({
  exercise_id: 1, name, muscle_group, target_sets: 3, target_reps: '8-12', rest_seconds: 90,
})

function program(key: string, name: string, level: string, days: string, letters: string[]): Program {
  return {
    key, name, level, days_per_week: days, goal: `Objetivo de ${name}`, description: `Descrição de ${name}`,
    splits: letters.map((l) => ({
      letter: l as Program['splits'][number]['letter'],
      name: `${name} ${l}`,
      exercises: [ex('Supino reto com barra', 'peito'), ex('Agachamento livre', 'quadriceps')],
    })),
  }
}

const PROGRAMS: Program[] = [
  program('corpo-inteiro', 'Corpo inteiro', 'iniciante', '3 dias', ['A', 'B']),
  program('abc', 'ABC clássico', 'intermediário', '3 a 6 dias', ['A', 'B', 'C']),
  program('empurrar-puxar-pernas', 'Empurrar, puxar e pernas', 'intermediário', '3 ou 6 dias', ['A', 'B', 'C']),
  program('superior-inferior', 'Superior e inferior', 'intermediário', '4 dias', ['A', 'B', 'C', 'D']),
  program('abcde', 'ABCDE', 'avançado', '5 dias', ['A', 'B', 'C', 'D', 'E']),
]

describe('Recomendação de programa', () => {
  it('escolhe pelo objetivo e pelos dias', () => {
    expect(recommendProgram(PROGRAMS, 'iniciante', 3)?.key).toBe('corpo-inteiro')
    expect(recommendProgram(PROGRAMS, 'hipertrofia', 3)?.key).toBe('abc')
    expect(recommendProgram(PROGRAMS, 'hipertrofia', 5)?.key).toBe('abcde')
    expect(recommendProgram(PROGRAMS, 'forca', 4)?.key).toBe('superior-inferior')
    expect(recommendProgram(PROGRAMS, 'forca', 6)?.key).toBe('empurrar-puxar-pernas')
  })

  it('cai para um programa compatível quando o preferido não existe', () => {
    const semAbcde = PROGRAMS.filter((p) => p.key !== 'abcde' && p.key !== 'abc')
    expect(recommendProgram(semAbcde, 'hipertrofia', 5)).not.toBeNull()
    expect(recommendProgram([], 'forca', 3)).toBeNull()
  })

  it('entende os textos de dias por semana', () => {
    expect(parseDays('3 dias')).toEqual([3])
    expect(parseDays('3 a 6 dias')).toEqual([3, 4, 5, 6])
    expect(parseDays('3 ou 6 dias')).toEqual([3, 6])
    expect(weekPattern(3)).toEqual([0, 2, 4])
    expect(weekPattern(0)).toEqual([])
  })
})

describe('Boas-vindas', () => {
  it('pergunta objetivo e dias, recomenda e aplica o programa com um toque', async () => {
    const { calls } = mockApi((url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: fakeUser }
      if (url === '/api/programs') return { status: 200, body: PROGRAMS }
      if (url === '/api/programs/abc/apply' && init.method === 'POST') return { status: 200, body: [] }
    })
    renderWithProviders(<WelcomePage />, { route: '/boas-vindas' })

    expect(await screen.findByRole('heading', { name: 'Boas-vindas, Ana.' })).toBeInTheDocument()
    const continuar = screen.getByRole('button', { name: 'Continuar' })
    expect(continuar).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: /Ganhar massa muscular/ }))
    await userEvent.click(continuar)

    expect(await screen.findByRole('heading', { name: 'Quantos dias por semana?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '3 dias' }))
    expect(screen.getByText(/segunda, quarta e sexta/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ver meu programa' }))

    expect(await screen.findByRole('heading', { name: 'ABC clássico' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Montar sozinho/ })).toHaveAttribute('href', '/divisoes')
    await userEvent.click(screen.getByRole('button', { name: 'Usar este programa' }))

    await waitFor(() => expect(calls.some((c) => c.url === '/api/programs/abc/apply')).toBe(true))
    expect(calls.find((c) => c.url === '/api/programs/abc/apply')!.body).toEqual({ replace_existing: false })
    expect(welcomeSeen(fakeUser.id)).toBe(true)
  })

  it('pede confirmação antes de substituir divisões existentes', async () => {
    const { calls } = mockApi((url, init) => {
      if (url === '/api/auth/me') return { status: 200, body: fakeUser }
      if (url === '/api/programs') return { status: 200, body: PROGRAMS }
      if (url === '/api/programs/corpo-inteiro/apply' && init.method === 'POST') {
        const body = JSON.parse(String(init.body)) as { replace_existing: boolean }
        return body.replace_existing
          ? { status: 200, body: [] }
          : { status: 409, body: { erro: { codigo: 'divisoes_existentes', mensagem: 'Você já tem divisões.' } } }
      }
    })
    renderWithProviders(<WelcomePage />, { route: '/boas-vindas' })

    await userEvent.click(await screen.findByRole('radio', { name: /Começar do zero/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    await userEvent.click(await screen.findByRole('radio', { name: '2 dias' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ver meu programa' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Usar este programa' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Substituir divisões' }))

    await waitFor(() =>
      expect(calls.filter((c) => c.url === '/api/programs/corpo-inteiro/apply').map((c) => c.body)).toEqual([
        { replace_existing: false },
        { replace_existing: true },
      ]),
    )
  })
})
