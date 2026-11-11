import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Check, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'

import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { tokenFromHash } from '@/lib/forms'

import { AuthLayout, SuccessSeal } from './AuthLayout'

export function VerifyEmailPage() {
  const [token] = useState(() => tokenFromHash(window.location.hash))
  const [password, setPassword] = useState('')
  const mutation = useMutation({
    mutationFn: () => authApi.verifyEmail(token ?? '', password),
  })

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }, [])

  const fieldError = mutation.error instanceof ApiError ? mutation.error.fields.password : undefined
  const footer = (
    <Link to="/entrar" className="font-semibold text-azul hover:underline">
      Ir para a tela de entrada
    </Link>
  )

  if (!token) {
    return (
      <AuthLayout title="Confirmação de e-mail" footer={footer}>
        <Alert tone="erro">Link inválido. Abra o link completo que enviamos por e-mail.</Alert>
      </AuthLayout>
    )
  }

  if (mutation.isSuccess) {
    return (
      <AuthLayout
        title="E-mail confirmado"
        art={
          <SuccessSeal>
            <Check className="size-10" strokeWidth={3} />
          </SuccessSeal>
        }
      >
        <div className="flex flex-col gap-5">
          <Alert tone="sucesso">{mutation.data.mensagem}</Alert>
          <Link
            to="/entrar"
            className="inline-flex min-h-15 items-center justify-center rounded-2xl bg-azul px-6 text-lg font-semibold text-white shadow-[0_10px_30px_-12px_var(--anilha-azul)] transition hover:bg-azul-forte active:scale-[0.97]"
          >
            Entrar e montar meu treino
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Confirme seu e-mail"
      subtitle="Por segurança, digite a senha que você escolheu no cadastro."
      footer={footer}
      art={
        <span className="flex size-14 items-center justify-center rounded-full border border-linha bg-superficie text-azul" aria-hidden="true">
          <ShieldCheck className="size-7" />
        </span>
      }
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (password) mutation.mutate()
        }}
      >
        {mutation.isError && !fieldError ? <Alert tone="erro">{mutation.error.message}</Alert> : null}
        <Field
          label="Senha do cadastro"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldError}
        />
        <Button type="submit" size="lg" loading={mutation.isPending} disabled={!password}>
          Confirmar e-mail
        </Button>
      </form>
    </AuthLayout>
  )
}
