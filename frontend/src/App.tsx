import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { ApiError } from '@/api/client'
import { AppShell } from '@/components/layout/AppShell'
import { PageLoader } from '@/components/ui/Spinner'
import { ToastProvider } from '@/components/ui/Toast'
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage'
import { LoginPage } from '@/features/auth/LoginPage'
import { RegisterPage } from '@/features/auth/RegisterPage'
import { ResetPasswordPage } from '@/features/auth/ResetPasswordPage'
import { ME_KEY } from '@/features/auth/useAuth'
import { VerifyEmailPage } from '@/features/auth/VerifyEmailPage'
import { CelebrationProvider } from '@/features/celebration/Celebration'
import { RequireAdmin, RequireAuth, RequireGuest } from '@/routes/guards'
import { privateRoutes } from '@/routes/privateRoutes'

const NotFoundPage = lazy(() => import('@/features/misc/NotFoundPage'))
const AdminPage = lazy(() => import('@/features/admin/AdminPage'))
const WelcomePage = lazy(() => import('@/features/onboarding/WelcomePage'))

export function createQueryClient(): QueryClient {
  const onError = (err: unknown) => {
    if (err instanceof ApiError && err.status === 401) {
      client.setQueryData(ME_KEY, null)
    }
  }
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
        refetchOnWindowFocus: false,
      },
    },
  })
  return client
}

const queryClient = createQueryClient()

export function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route element={<RequireGuest />}>
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/cadastrar" element={<RegisterPage />} />
          <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
        </Route>
        <Route path="/confirmar-email" element={<VerifyEmailPage />} />
        <Route path="/redefinir-senha" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/boas-vindas" element={<WelcomePage />} />
          <Route element={<AppShell />}>
            {privateRoutes.map(({ path, Component }) => (
              <Route key={path} path={path} element={<Component />} />
            ))}
            <Route element={<RequireAdmin />}>
              <Route path="/admin" element={<AdminPage />} />
            </Route>
          </Route>
        </Route>
        <Route path="/login" element={<Navigate to="/entrar" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <CelebrationProvider>
            <BrowserRouter>
              <AppRoutes />
            </BrowserRouter>
          </CelebrationProvider>
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  )
}
