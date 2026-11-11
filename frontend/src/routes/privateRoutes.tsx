import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

export const privateRoutes: { path: string; Component: LazyExoticComponent<ComponentType> }[] = [
  { path: '/', Component: lazy(() => import('@/routes/HomeRoute')) },
  { path: '/treino', Component: lazy(() => import('@/features/workout/WorkoutPage')) },
  { path: '/historico', Component: lazy(() => import('@/features/history/HistoryPage')) },
  { path: '/historico/:id', Component: lazy(() => import('@/features/history/SessionDetailPage')) },
  { path: '/recordes', Component: lazy(() => import('@/features/records/RecordsPage')) },
  { path: '/exercicios/:id', Component: lazy(() => import('@/features/records/ExercisePage')) },
  { path: '/estatisticas', Component: lazy(() => import('@/features/stats/StatsPage')) },
  { path: '/divisoes', Component: lazy(() => import('@/features/splits/SplitsPage')) },
  { path: '/programas', Component: lazy(() => import('@/features/programs/ProgramsPage')) },
  { path: '/perfil', Component: lazy(() => import('@/features/profile/ProfilePage')) },
  { path: '/mais', Component: lazy(() => import('@/features/misc/MorePage')) },
  { path: '/conquistas', Component: lazy(() => import('@/features/achievements/AchievementsPage')) },
]
