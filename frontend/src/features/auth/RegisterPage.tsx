import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Check, MailCheck } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'

import { authApi } from '@/api/auth'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { applyApiErrors } from '@/lib/forms'
import { emailSchema, withConfirmation } from '@/lib/validation'

import { AuthLayout, SuccessSeal } from './AuthLayout'
import { PasswordMeter } from './PasswordMeter'

const schema = withConfirmation({
  name: z.string().trim().min(2, 'Informe seu nome.').max(80, 'Nome muito longo.'),
  email: emailSchema,
})
type FormData = z.infer<typeof schema>

export function RegisterPage() {
  const [error, setGeneralError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<FormData>({ resolver: zodResolver(schema) })
  const password = useWatch({ control, name: 'password' }) ?? ''
  const confirm = useWatch({ control, name: 'password_confirm' }) ?? ''
  const matches = confirm.length > 0 && confirm === password

  const mutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: (_, vars) => setSentTo(vars.email),
    onError: (err) =>
      setGeneralError(
        applyApiErrors(err, setError, ['name', 'email', 'password', 'password_confirm']),
      ),
  })

  if (sentTo) {
    return (
      <AuthLayout
        title="Confira seu e-mail"
        order={1}
        art={
          <SuccessSeal tone="azul">
            <MailCheck className="size-9" />
          </SuccessSeal>
        }
      >
        <div className="flex flex-col gap-4">
          <p>
            Enviamos um link de confirmação para <strong className="break-all">{sentTo}</strong>.
            Abra o link para ativar sua conta.
          </p>
          <ol className="flex flex-col gap-2 rounded-[22px] border border-linha bg-superficie p-4 text-sm">
            {['Abra o e-mail do REPLOG', 'Toque em "Confirmar e-mail"', 'Digite a senha que você acabou de criar'].map(
              (step, i) => (
                <motion.li
                  key={step}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28, delay: 0.45 + i * 0.1 }}
                >
                  <span className="placar flex size-8 shrink-0 items-center justify-center rounded-full bg-superficie-2 text-lg text-azul">
                    {i + 1}
                  </span>
                  {step}
                </motion.li>
              ),
            )}
          </ol>
          <p className="text-sm text-giz-suave">
            Não chegou? Verifique a caixa de spam. O link vale por 24 horas.
          </p>
          <Link to="/entrar" className="font-semibold text-azul hover:underline">
            Ir para a tela de entrada
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Comece a registrar cada série e acompanhe sua evolução."
      tabs="cadastrar"
      order={1}
    >
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={handleSubmit((data) => {
          setGeneralError(null)
          mutation.mutate(data)
        })}
      >
        {error ? <Alert tone="erro">{error}</Alert> : null}
        <Field label="Nome" autoComplete="name" error={errors.name?.message} {...register('name')} />
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
          autoComplete="new-password"
          error={errors.password?.message}
          hint={<PasswordMeter password={password} />}
          {...register('password')}
        />
        <Field
          label="Confirme a senha"
          type="password"
          autoComplete="new-password"
          error={errors.password_confirm?.message}
          hint={
            <AnimatePresence initial={false}>
              {matches ? (
                <motion.span
                  key="ok"
                  className="flex items-center gap-1.5 text-verde"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <Check className="size-4" aria-hidden="true" /> As senhas conferem
                </motion.span>
              ) : null}
            </AnimatePresence>
          }
          {...register('password_confirm')}
        />
        <Button type="submit" size="lg" loading={mutation.isPending}>
          Criar conta
        </Button>
        <p className="text-center text-xs text-giz-suave">
          Seus treinos são privados: só você vê o que registra.
        </p>
      </form>
    </AuthLayout>
  )
}
