import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { KeyRound, MailCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { authApi } from '@/api/auth'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { emailSchema } from '@/lib/validation'

import { AuthLayout, SuccessSeal } from './AuthLayout'

const schema = z.object({ email: emailSchema })
type FormData = z.infer<typeof schema>

export function ForgotPasswordPage() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })
  const mutation = useMutation({ mutationFn: (d: FormData) => authApi.forgotPassword(d.email) })

  return (
    <AuthLayout
      title="Esqueci minha senha"
      subtitle="Informe seu e-mail e enviaremos um link para criar uma nova senha."
      order={-1}
      art={
        mutation.isSuccess ? (
          <SuccessSeal tone="azul">
            <MailCheck className="size-9" />
          </SuccessSeal>
        ) : (
          <span className="flex size-14 items-center justify-center rounded-full border border-linha bg-superficie text-amarela" aria-hidden="true">
            <KeyRound className="size-7" />
          </span>
        )
      }
      footer={
        <Link to="/entrar" className="font-semibold text-azul hover:underline">
          Lembrei a senha, voltar para a entrada
        </Link>
      }
    >
      {mutation.isSuccess ? (
        <Alert tone="sucesso">{mutation.data.mensagem}</Alert>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-5"
          onSubmit={handleSubmit((d) => mutation.mutate(d))}
        >
          {mutation.isError ? <Alert tone="erro">{mutation.error.message}</Alert> : null}
          <Field
            label="E-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" size="lg" loading={mutation.isPending}>
            Enviar link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
