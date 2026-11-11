import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Check } from 'lucide-react'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { authApi } from '@/api/auth'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { applyApiErrors, tokenFromHash } from '@/lib/forms'
import { withConfirmation } from '@/lib/validation'

import { AuthLayout, SuccessSeal } from './AuthLayout'
import { PasswordMeter } from './PasswordMeter'

const schema = withConfirmation({})
type FormData = z.infer<typeof schema>

export function ResetPasswordPage() {
  const [token] = useState(() => tokenFromHash(window.location.hash))
  const [error, setGeneralError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })
  const password = useWatch({ control, name: 'password' }) ?? ''

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const mutation = useMutation({
    mutationFn: (d: FormData) => authApi.resetPassword({ ...d, token: token ?? '' }),
    onError: (err) => setGeneralError(applyApiErrors(err, setError, ['password', 'password_confirm'])),
  })

  const footer = (
    <Link to="/entrar" className="font-semibold text-azul hover:underline">
      Ir para a tela de entrada
    </Link>
  )

  if (!token) {
    return (
      <AuthLayout title="Nova senha" footer={footer} order={-1}>
        <Alert tone="erro">
          Link inválido. Abra o link completo do e-mail ou{' '}
          <Link to="/esqueci-senha" className="underline">
            solicite um novo
          </Link>
          .
        </Alert>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Nova senha"
      subtitle="Escolha uma senha nova para sua conta."
      footer={footer}
      order={-1}
      art={
        mutation.isSuccess ? (
          <SuccessSeal>
            <Check className="size-10" strokeWidth={3} />
          </SuccessSeal>
        ) : undefined
      }
    >
      {mutation.isSuccess ? (
        <Alert tone="sucesso">{mutation.data.mensagem}</Alert>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={handleSubmit((d) => {
            setGeneralError(null)
            mutation.mutate(d)
          })}
        >
          {error ? <Alert tone="erro">{error}</Alert> : null}
          <Field
            label="Nova senha"
            type="password"
            autoComplete="new-password"
            hint={<PasswordMeter password={password} />}
            error={errors.password?.message}
            {...register('password')}
          />
          <Field
            label="Confirme a nova senha"
            type="password"
            autoComplete="new-password"
            error={errors.password_confirm?.message}
            {...register('password_confirm')}
          />
          <Button type="submit" size="lg" loading={mutation.isPending}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
