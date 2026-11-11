import type { QueryClient } from '@tanstack/react-query'

const DERIVED_ROOTS = new Set<unknown>([
  'dashboard',
  'history',
  'calendar',
  'records',
  'progress',
  'exercise-records',
  'volume',
  'suggestion',
  'session-summary',
  'analytics',
  'achievements',
])

export function invalidateTrainingData(queryClient: QueryClient, sessionId?: number): Promise<void> {
  return queryClient.invalidateQueries({
    predicate: ({ queryKey }) =>
      DERIVED_ROOTS.has(queryKey[0]) ||
      (sessionId != null && queryKey[0] === 'workout' && queryKey[1] === sessionId),
  })
}
