import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { Alert } from '@/components/ui/Alert'
import { PageLoader } from '@/components/ui/Spinner'
import { useMe } from '@/features/auth/useAuth'

export function RequireAuth() {
  const { data: user, isPending, isError } = useMe()
  const location = useLocation()

  if (isPending) return <PageLoader />
  if (isError) {
    return (
      <div className="mx-auto max-w-md p-6">
        <Alert tone="erro">Não foi possível conectar ao servidor. Recarregue a página.</Alert>
      </div>
    )
  }
  if (!user) return <Navigate to="/entrar" replace state={{ from: location.pathname }} />
  return <Outlet />
}

export function RequireAdmin() {
  const { data: user } = useMe()
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <Outlet />
}

export function RequireGuest() {
  const { data: user, isPending } = useMe()
  if (isPending) return <PageLoader />
  if (user) return <Navigate to="/" replace />
  return <Outlet />
}
