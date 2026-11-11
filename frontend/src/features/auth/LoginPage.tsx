import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { applyApiErrors } from '@/lib/forms'
import { emailSchema } from '@/lib/validation'

import { AuthLayout } from './AuthLayout'
import { ME_KEY } from './useAuth'

const schema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Informe sua senha.'),
})
type FormData = z.infer<typeof schema>

function safeNext(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//')
    ? value
    : '/'
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const [error, setGeneralError] = useState<string | null>(null)
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resent, setResent] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (user) => {
      queryClient.setQueryData(ME_KEY, user)
      navigate(safeNext((location.state as { from?: string } | null)?.from), { replace: true })
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'email_nao_confirmado') {
        setUnverifiedEmail(getValues('email'))
      }
      setGeneralError(applyApiErrors(err, setError, ['email', 'password']))
    },
  })

  const resend = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: (data) => setResent(data.mensagem),
  })

  return (
    <AuthLayout title="Entrar" subtitle="Bom te ver de novo. A barra está montada." tabs="entrar" order={0}>
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={handleSubmit((data) => {
          setGeneralError(null)
          setUnverifiedEmail(null)
          setResent(null)
          login.mutate(data)
        })}
      >
        {error ? (
          <Alert tone="erro">
            <p>{error}</p>
            {unverifiedEmail ? (
              <button
                type="button"
                className="mt-2 font-semibold text-azul underline"
                onClick={() => resend.mutate(unverifiedEmail)}
                disabled={resend.isPending}
              >
                Reenviar e-mail de confirmação
              </button>
            ) : null}
          </Alert>
        ) : null}
        {resent ? <Alert tone="sucesso">{resent}</Alert> : null}

        <Field
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...register('email')}
        />
        <Field
          label="Senha"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Link to="/esqueci-senha" className="-mt-2 self-end text-sm text-azul hover:underline">
          Esqueci minha senha
        </Link>
        <Button type="submit" size="lg" loading={login.isPending}>
          Entrar
        </Button>
      </form>
    </AuthLayout>
  )
}
