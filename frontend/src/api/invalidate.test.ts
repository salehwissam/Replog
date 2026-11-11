import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'

import { achievementKeys } from './achievements'
import { analyticsKeys } from './analytics'
import { invalidateTrainingData } from './invalidate'
import { queryKeys } from './workouts'

const stale = (client: QueryClient, key: readonly unknown[]) => client.getQueryState(key)?.isInvalidated

describe('invalidateTrainingData', () => {
  it('desatualiza tudo que é calculado a partir dos treinos', async () => {
    const client = new QueryClient()
    const derived = [
      queryKeys.dashboard,
      queryKeys.history({ page: 1 }),
      queryKeys.records,
      queryKeys.recentRecords,
      queryKeys.progress(3),
      queryKeys.exerciseRecords(3),
      queryKeys.volume('semana', 8),
      queryKeys.suggestion(3, '8-10'),
      queryKeys.sessionSummary(7),
      analyticsKeys.summary,
      analyticsKeys.heatmap(182),
      analyticsKeys.muscles(4),
      achievementKeys.list,
    ]
    const untouched = [queryKeys.splits, queryKeys.programs, queryKeys.active, queryKeys.session(9)]
    for (const key of [...derived, ...untouched, queryKeys.session(7)]) client.setQueryData(key, {})

    await invalidateTrainingData(client, 7)

    for (const key of derived) expect(stale(client, key), JSON.stringify(key)).toBe(true)
    expect(stale(client, queryKeys.session(7))).toBe(true)
    for (const key of untouched) expect(stale(client, key), JSON.stringify(key)).toBe(false)
  })
})
