import { useQuery } from '@tanstack/react-query'

import { queryKeys, workoutsApi } from '@/api/workouts'
import { Alert } from '@/components/ui/Alert'
import { PageLoader } from '@/components/ui/Spinner'

import { ActiveWorkout } from './ActiveWorkout'
import { StartWorkout } from './StartWorkout'

export default function WorkoutPage() {
  const active = useQuery({ queryKey: queryKeys.active, queryFn: workoutsApi.active })

  if (active.isPending) return <PageLoader label="Carregando treino…" />
  if (active.isError) return <Alert tone="erro">{active.error.message}</Alert>
  return active.data ? <ActiveWorkout session={active.data} /> : <StartWorkout />
}
