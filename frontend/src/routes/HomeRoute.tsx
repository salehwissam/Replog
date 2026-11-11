import { useQuery } from '@tanstack/react-query'
import { lazy } from 'react'
import { Navigate } from 'react-router-dom'

import { queryKeys, workoutsApi } from '@/api/workouts'
import { PageLoader } from '@/components/ui/Spinner'
import { useCurrentUser } from '@/features/auth/useAuth'
import { welcomeSeen } from '@/features/onboarding/recommend'

const DashboardPage = lazy(() => import('@/features/dashboard/DashboardPage'))

export default function HomeRoute() {
  const user = useCurrentUser()
  const seen = user.id === 0 || welcomeSeen(user.id)
  const splits = useQuery({ queryKey: queryKeys.splits, queryFn: workoutsApi.splits, enabled: !seen })
  const dash = useQuery({ queryKey: queryKeys.dashboard, queryFn: workoutsApi.dashboard, enabled: !seen })

  if (!seen) {
    if (!splits.isFetched || !dash.isFetched) return <PageLoader variant="pagina" />
    if (splits.data?.length === 0 && dash.data?.total_workouts === 0) {
      return <Navigate to="/boas-vindas" replace />
    }
  }
  return <DashboardPage />
}
