import { QueryClientProvider } from '@tanstack/react-query'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '@/App'
import { setPayload, type Exercise, type ExerciseSuggestion, type WorkoutSession, type WorkoutSet } from '@/api/workouts'
import { ToastProvider } from '@/components/ui/Toast'
import { RestTimer, type RestTimerHandle } from '@/components/workout/RestTimer'
import { rpeHint } from '@/components/workout/RpePicker'
import { SetRow } from '@/components/workout/SetRow'
import { CelebrationProvider } from '@/features/celebration/Celebration'
import { localSummary, WorkoutSummaryOverlay } from '@/features/celebration/WorkoutSummary'
import { mockApi } from '@/test/utils'

import { SetLogger, validateSet } from './SetLogger'
import { useWakeLock } from './useWakeLock'
import WorkoutPage from './WorkoutPage'

const supino: Exercise = {
  id: 1,
  name: 'Supino reto com barra',
  muscle_group: 'peito',
  equipment: 'barra',
  is_bodyweight: false,
  is_custom: false,
}

const triceps: Exercise = {
  id: 2,
  name: 'Tríceps na polia',
  muscle_group: 'triceps',
  equipment: 'cabo',
  is_bodyweight: false,
  is_custom: false,
}

function makeSet(over: Partial<WorkoutSet> = {}): WorkoutSet {
  return {
    id: 10,
    exercise_id: 1,
    set_number: 1,
    reps: 10,
    weight_kg: 60,
    volume_kg: 600,
    est_1rm: 80,
    rest_seconds: null,
    notes: null,
    performed_at: '2026-11-09T20:00:00Z',
    ...over,
  }
}

function makeSession(over: Partial<WorkoutSession> = {}): WorkoutSession {
  return {
    id: 7,
    intensity: 'normal',
    split: {
      id: 3,
      letter: 'A',
      name: 'Peito e tríceps',
      description: null,
      exercises: [
        { exercise: supino, target_sets: 3, target_reps: '8-12', rest_seconds: 90 },
        { exercise: triceps, target_sets: 3, target_reps: '10-12', rest_seconds: 60 },
      ],
    },
    started_at: '2026-11-09T19:30:00Z',
    finished_at: null,
    timezone: 'America/Sao_Paulo',
    local_date: '2026-11-09',
    notes: null,
    duration_seconds: null,
    total_sets: 0,
    total_reps: 0,
    volume_kg: 0,
    exercises: [],
    records: [],
    ...over,
  }
}

const suggestionData: ExerciseSuggestion = {
  exercise_id: 1,
  based_on_session_id: 4,
  last_date: '2026-11-02',
  last_sets: [
    { reps: 12, weight_kg: 40, set_type: 'aquecimento' },
    { reps: 10, weight_kg: 60, set_type: 'normal' },
    { reps: 10, weight_kg: 60, set_type: 'normal' },
  ],
  suggestion: { weight_kg: 62.5, reps: 8, reason: 'Você fez 10+ repetições em todas as séries: suba 2,5 kg.' },
}

function renderApp(ui: React.ReactElement, route = '/treino') {
  const client = createQueryClient()
  client.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } })
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <CelebrationProvider>
          <MemoryRouter initialEntries={[route]}>
            <Routes>
              <Route path="/treino" element={ui} />
              <Route path="/historico/:id" element={<h1>Recordes neste treino</h1>} />
            </Routes>
          </MemoryRouter>
        </CelebrationProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  sessionStorage.clear()
})

describe('validação da série', () => {
  it('aceita vírgula decimal e rejeita valores inválidos', () => {
    expect(validateSet('22,5', '10')).toEqual({})
    expect(validateSet('', '10').weight).toBe('Informe a carga.')
    expect(validateSet('-1', '10').weight).toMatch(/entre 0 e 1500/)
    expect(validateSet('20,555', '10').weight).toBe('Use no máximo 2 casas decimais.')
    expect(validateSet('20', '0').reps).toBe('Informe ao menos 1 repetição.')
    expect(validateSet('20', '2,5').reps).toBe('Informe ao menos 1 repetição.')
  })
})

describe('corpo da série (B1)', () => {
  it('só envia tipo e RPE quando diferem do padrão, a menos que a API já os conheça', () => {
    const base = { reps: 8, weight_kg: 60, notes: null }
    expect(setPayload({ ...base, set_type: 'normal', rpe: null })).toEqual(base)
    expect(setPayload({ ...base, set_type: 'aquecimento', rpe: 7.5 })).toEqual({ ...base, set_type: 'aquecimento', rpe: 7.5 })
    expect(setPayload({ ...base, set_type: 'normal', rpe: null }, true)).toEqual({ ...base, set_type: 'normal', rpe: null })
  })

  it('explica o RPE em repetições na reserva', () => {
    expect(rpeHint(10)).toMatch(/nenhuma/)
    expect(rpeHint(8)).toBe('Sobravam 2 repetições.')
    expect(rpeHint(5)).toMatch(/4 ou mais/)
  })
})

describe('registro de série', () => {
  it('envia carga e repetições com os botões + e −', async () => {
    const onSubmit = vi.fn()
    render(<SetLogger exercise={supino} defaultReps={10} defaultWeight={60} pending={false} error={null} onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('button', { name: 'Aumentar carga em 2,5' }))
    await userEvent.click(screen.getByRole('button', { name: 'Diminuir repetições em 1' }))
    await userEvent.click(screen.getByRole('button', { name: 'Registrar série' }))

    expect(onSubmit).toHaveBeenCalledWith({ reps: 9, weight_kg: 62.5, notes: null, set_type: 'normal', rpe: null })
  })

  it('escolhe o tipo da série e o RPE (tocar de novo desmarca)', async () => {
    const onSubmit = vi.fn()
    render(<SetLogger exercise={supino} defaultReps={12} defaultWeight={40} pending={false} error={null} onSubmit={onSubmit} />)

    await userEvent.click(screen.getByRole('radio', { name: 'Aquecimento' }))
    expect(screen.getByRole('radio', { name: 'Aquecimento' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByText(/não conta para recordes nem para as séries/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'RPE 9' }))
    await userEvent.click(screen.getByRole('button', { name: 'RPE 9' }))
    expect(screen.getByRole('button', { name: 'RPE 9' })).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(screen.getByRole('button', { name: 'RPE 7,5' }))
    expect(screen.getByText('Sobravam 2,5 repetições.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Registrar série' }))
    expect(onSubmit).toHaveBeenCalledWith({ reps: 12, weight_kg: 40, notes: null, set_type: 'aquecimento', rpe: 7.5 })
  })

  it('o tipo de série responde às setas do teclado', async () => {
    render(<SetLogger exercise={supino} defaultReps={10} defaultWeight={60} pending={false} error={null} onSubmit={vi.fn()} />)
    screen.getByRole('radio', { name: 'Normal' }).focus()
    await userEvent.keyboard('{ArrowRight}{ArrowRight}')
    expect(screen.getByRole('radio', { name: 'Drop' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('radio', { name: 'Drop' })).toHaveFocus()
  })

  it('repete a última série com um toque', async () => {
    const onSubmit = vi.fn()
    render(
      <SetLogger
        exercise={supino}
        defaultReps={8}
        defaultWeight={70}
        pending={false}
        error={null}
        lastSet={{ reps: 8, weight_kg: 70, set_type: 'falha' }}
        onSubmit={onSubmit}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Repetir última série: 8 × 70 kg/ }))
    expect(onSubmit).toHaveBeenCalledWith({ reps: 8, weight_kg: 70, notes: null, set_type: 'falha', rpe: null })
  })

  it('mostra a última vez e aplica a sugestão de carga (B2)', async () => {
    render(
      <SetLogger exercise={supino} defaultReps={10} defaultWeight={60} pending={false} error={null} suggestion={suggestionData} onSubmit={vi.fn()} />,
    )
    expect(screen.getByText(/Última vez, em 02\/11/)).toBeInTheDocument()
    expect(screen.getByText('62,5 kg × 8')).toBeInTheDocument()
    expect(screen.getByText(/suba 2,5 kg/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Usar sugestão' }))
    expect(screen.getByLabelText('Carga')).toHaveValue('62,5')
    expect(screen.getByLabelText('Repetições')).toHaveValue('8')
    expect(await screen.findByRole('button', { name: 'Aplicada' })).toBeInTheDocument()
  })

  it('sem sugestão (sem histórico) a área não aparece', () => {
    render(
      <SetLogger
        exercise={supino}
        defaultReps={10}
        defaultWeight={60}
        pending={false}
        error={null}
        suggestion={{ ...suggestionData, last_sets: [], suggestion: null, last_date: null, based_on_session_id: null }}
        onSubmit={vi.fn()}
      />,
    )
    expect(screen.queryByText(/Última vez/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Usar sugestão' })).not.toBeInTheDocument()
  })

  it('mostra as anilhas por lado para exercícios com barra', () => {
    render(<SetLogger exercise={supino} defaultReps={10} defaultWeight={100} pending={false} error={null} onSubmit={vi.fn()} />)
    expect(screen.getByRole('img', { name: 'Por lado: 25 + 15 kg' })).toBeInTheDocument()
  })

  it('bloqueia o envio com carga inválida', async () => {
    const onSubmit = vi.fn()
    render(<SetLogger exercise={supino} defaultReps={10} defaultWeight={60} pending={false} error={null} onSubmit={onSubmit} />)
    const input = screen.getByLabelText('Carga')
    await userEvent.clear(input)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar série' }))
    expect(await screen.findByText('Informe a carga.')).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('linha da série', () => {
  it('mostra tipo, RPE e mantém o rótulo "Série N" e os botões', () => {
    const onEdit = vi.fn()
    render(
      <ul>
        <SetRow set={makeSet({ set_type: 'aquecimento', rpe: 6.5, set_number: 2 })} timeZone="UTC" onEdit={onEdit} onDelete={vi.fn()} />
      </ul>,
    )
    expect(screen.getByLabelText('Série 2')).toBeInTheDocument()
    expect(screen.getByText('Aquecimento')).toBeInTheDocument()
    expect(screen.getByText('RPE 6,5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar série 2' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apagar série 2' })).toBeInTheDocument()
  })

  it('série normal de API antiga (sem set_type) não ganha etiqueta', () => {
    render(
      <ul>
        <SetRow set={makeSet()} timeZone="UTC" />
      </ul>,
    )
    expect(screen.queryByText('Normal')).not.toBeInTheDocument()
  })
})

describe('tela de treino', () => {
  it('degrada em silêncio sem a rota de sugestão (404) e envia a série sem campos novos', async () => {
    const session = makeSession()
    const { calls } = mockApi((url, init) => {
      if (url === '/api/workouts/active') return { status: 200, body: session }
      if (url === '/api/exercises/1/progress') return { status: 200, body: [] }
      if (url === '/api/workouts/7/sets' && init.method === 'POST') {
        return { status: 201, body: { set: makeSet(), new_records: [] } }
      }
      return undefined
    })
    renderApp(<WorkoutPage />)

    expect(await screen.findByText('Treino em andamento')).toBeInTheDocument()
    await waitFor(() => expect(calls.some((c) => c.url === '/api/exercises/1/suggestion?target_reps=8-12')).toBe(true))
    expect(screen.queryByText(/Sugestão/)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('img', { name: '0 de 3 séries-alvo feitas' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Depois: Tríceps na polia/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Registrar série' }))
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true))
    const post = calls.find((c) => c.method === 'POST' && c.url === '/api/workouts/7/sets')!
    expect(post.body).toEqual({ exercise_id: 1, reps: 8, weight_kg: 0, notes: null, rest_seconds: null })
  })

  it('muda a intensidade do treino e refaz a sugestão para ela', async () => {
    let suggestions = 0
    const { calls } = mockApi((url, init) => {
      if (url === '/api/workouts/active') return { status: 200, body: makeSession() }
      if (url === '/api/exercises/1/progress') return { status: 200, body: [] }
      if (url.startsWith('/api/exercises/1/suggestion')) {
        suggestions += 1
        return { status: 200, body: suggestionData }
      }
      if (url === '/api/workouts/7' && init.method === 'PATCH') {
        return { status: 200, body: makeSession({ intensity: 'leve' }) }
      }
      return undefined
    })
    renderApp(<WorkoutPage />)
    const group = await screen.findByRole('radiogroup', { name: 'Intensidade do treino' })
    expect(within(group).getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(suggestions).toBe(1))

    await userEvent.click(within(group).getByRole('radio', { name: 'Leve' }))
    await waitFor(() => expect(within(group).getByRole('radio', { name: 'Leve' })).toHaveAttribute('aria-checked', 'true'))
    const patch = calls.find((c) => c.method === 'PATCH')!
    expect(patch.body).toEqual({ intensity: 'leve' })
    expect(screen.getByText(/Descarga: cerca de 60% da carga/)).toBeInTheDocument()
    await waitFor(() => expect(suggestions).toBe(2))
  })

  it('com a sugestão (B2), "Usar sugestão" preenche carga e repetições', async () => {
    mockApi((url) => {
      if (url === '/api/workouts/active') return { status: 200, body: makeSession() }
      if (url === '/api/exercises/1/progress') return { status: 200, body: [] }
      if (url.startsWith('/api/exercises/1/suggestion')) return { status: 200, body: suggestionData }
      return undefined
    })
    renderApp(<WorkoutPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Usar sugestão' }))
    expect(screen.getByLabelText('Carga')).toHaveValue('62,5')
    expect(screen.getByLabelText('Repetições')).toHaveValue('8')
  })

  it('ao bater a meta, aponta o próximo exercício', async () => {
    const sets = [1, 2, 3].map((n) => makeSet({ id: n, set_number: n }))
    const session = makeSession({
      total_sets: 3,
      exercises: [
        {
          exercise: supino,
          sets,
          summary: { sets: 3, total_reps: 30, top_weight_kg: 60, volume_kg: 1800, best_est_1rm: 80 },
          comparison: null,
        },
      ],
    })
    mockApi((url) => {
      if (url === '/api/workouts/active') return { status: 200, body: session }
      if (url === '/api/exercises/1/progress') return { status: 200, body: [] }
      return undefined
    })
    renderApp(<WorkoutPage />)
    const next = await screen.findByRole('button', { name: /Meta batida\. Próximo exercício: Tríceps na polia/ })
    expect(screen.getByRole('button', { name: /Repetir última série: 10 × 60 kg/ })).toBeInTheDocument()
    await userEvent.click(next)
    expect(await screen.findByRole('heading', { name: 'Tríceps na polia' })).toBeInTheDocument()
  })

  it('ao finalizar, vai para o detalhe e mostra a tela de vitória por cima', async () => {
    const session = makeSession({ total_sets: 1, total_reps: 10, volume_kg: 600, exercises: [{ exercise: supino, sets: [makeSet()], summary: { sets: 1, total_reps: 10, top_weight_kg: 60, volume_kg: 600, best_est_1rm: 80 }, comparison: null }] })
    mockApi((url) => {
      if (url === '/api/workouts/active') return { status: 200, body: session }
      if (url === '/api/exercises/1/progress') return { status: 200, body: [] }
      if (url === '/api/workouts/7/finish') {
        return { status: 200, body: { ...session, finished_at: '2026-11-09T20:30:00Z', duration_seconds: 3600 } }
      }
      return undefined
    })
    renderApp(<WorkoutPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Finalizar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Finalizar treino' }))

    expect(await screen.findByRole('heading', { name: 'Recordes neste treino' })).toBeInTheDocument()
    const dialog = await screen.findByRole('dialog', { name: 'Treino concluído' })
    expect(within(dialog).getByText('1h00')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Ver detalhes do treino' }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Treino concluído' })).not.toBeInTheDocument())
  })
})

describe('tela de vitória (B3)', () => {
  const finished = makeSession({
    finished_at: '2026-11-09T20:20:00Z',
    duration_seconds: 3000,
    total_sets: 4,
    total_reps: 40,
    volume_kg: 1800,
    exercises: [
      {
        exercise: supino,
        sets: [makeSet({ set_type: 'aquecimento' }), makeSet({ id: 2 }), makeSet({ id: 3 })],
        summary: { sets: 3, total_reps: 30, top_weight_kg: 60, volume_kg: 1200, best_est_1rm: 80 },
        comparison: null,
      },
      {
        exercise: triceps,
        sets: [makeSet({ id: 4, exercise_id: 2 })],
        summary: { sets: 1, total_reps: 10, top_weight_kg: 60, volume_kg: 600, best_est_1rm: 80 },
        comparison: null,
      },
    ],
  })

  it('o cálculo local ignora aquecimento nos grupos musculares', () => {
    const s = localSummary(finished, { peito: 'Peito', triceps: 'Tríceps' })
    expect(s.muscle_groups).toEqual([
      { muscle_group: 'peito', label: 'Peito', sets: 2 },
      { muscle_group: 'triceps', label: 'Tríceps', sets: 1 },
    ])
    expect(s.duration_seconds).toBe(3000)
  })

  it('usa o resumo da API com a comparação ao último treino da divisão', async () => {
    mockApi((url) => {
      if (url === '/api/analytics/sessions/7/summary') {
        return {
          status: 200,
          body: {
            session_id: 7,
            volume_kg: 1080,
            sets: 7,
            reps: 54,
            duration_seconds: 3200,
            records_beaten: 2,
            muscle_groups: [{ muscle_group: 'peito', label: 'Peito', sets: 4 }],
            previous_same_split: { session_id: 3, local_date: '2026-11-02', volume_kg: 980, sets: 5 },
            delta_volume_kg: 100,
          },
        }
      }
      return undefined
    })
    const client = createQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })
    const onClose = vi.fn()
    render(
      <QueryClientProvider client={client}>
        <WorkoutSummaryOverlay session={finished} onClose={onClose} />
      </QueryClientProvider>,
    )
    expect(await screen.findByText('recordes batidos hoje')).toBeInTheDocument()
    expect(screen.getByText('+2 séries')).toBeInTheDocument()
    expect(screen.queryByText(/ kg$/)).not.toBeInTheDocument()
    expect(screen.getByText(/Contra o último Treino A/)).toBeInTheDocument()
    expect(screen.getByText('54')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalled()
  })

  it('fecha sozinho depois de alguns segundos se ninguém tocar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    mockApi(() => undefined)
    const client = createQueryClient()
    client.setDefaultOptions({ queries: { retry: false } })
    const onClose = vi.fn()
    render(
      <QueryClientProvider client={client}>
        <WorkoutSummaryOverlay session={finished} onClose={onClose} />
      </QueryClientProvider>,
    )
    await act(async () => {
      vi.advanceTimersByTime(9100)
    })
    expect(onClose).toHaveBeenCalled()
  })
})

describe('tela acesa', () => {
  function Probe() {
    useWakeLock()
    return null
  }

  it('pede a trava de tela e solta ao sair', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockResolvedValue({ release, addEventListener: vi.fn() })
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    const { unmount } = render(<Probe />)
    await waitFor(() => expect(request).toHaveBeenCalledWith('screen'))
    await act(async () => {})
    unmount()
    expect(release).toHaveBeenCalled()
    Object.defineProperty(navigator, 'wakeLock', { value: undefined, configurable: true })
  })

  it('sem suporte, não quebra', () => {
    expect(() => render(<Probe />)).not.toThrow()
  })
})

describe('cronômetro de descanso', () => {
  it('conta regressivamente e avisa ao terminar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false })
    const vibrate = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    const ref = createRef<RestTimerHandle>()
    render(<RestTimer ref={ref} />)

    act(() => ref.current!.start(3))
    expect(screen.getByText('0:03')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(1100)
    })
    expect(screen.getByText('0:02')).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2500)
    })
    expect(screen.getByText('Descanso finalizado')).toBeInTheDocument()
    expect(vibrate).toHaveBeenCalled()
  })

  it('permite reiniciar e fechar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
    const ref = createRef<RestTimerHandle>()
    render(<RestTimer ref={ref} />)
    await userEvent.click(screen.getByRole('button', { name: '1:30' }))
    expect(screen.getByText('Descansando')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reiniciar' }))
    expect(screen.getByText('1:30')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Fechar cronômetro' }))
    expect(screen.getByText('Descanso:')).toBeInTheDocument()
  })

  it('tira e adiciona 15 segundos', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-10T12:00:00Z'))
    const ref = createRef<RestTimerHandle>()
    render(<RestTimer ref={ref} />)
    act(() => ref.current!.start(60))
    await userEvent.click(screen.getByRole('button', { name: 'Tirar 15 segundos' }))
    expect(screen.getByText('0:45')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Adicionar 15 segundos' }))
    expect(screen.getByText('1:00')).toBeInTheDocument()
  })
})
