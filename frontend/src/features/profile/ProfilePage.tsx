import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  Check,
  Database,
  DoorOpen,
  FileJson,
  FileSpreadsheet,
  LogOut,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { motion } from 'motion/react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'

import { authApi } from '@/api/auth'
import { ApiError } from '@/api/client'
import { Plate } from '@/components/brand/Plate'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { useToast } from '@/components/ui/Toast'
import { ME_KEY, useCurrentUser, useLogout } from '@/features/auth/useAuth'
import { applyApiErrors } from '@/lib/forms'
import { getStoredTheme, setTheme, type Theme } from '@/lib/theme'
import { withConfirmation } from '@/lib/validation'

function Section({
  title,
  icon: Icon,
  description,
  tone = 'normal',
  children,
  id,
}: {
  title: string
  icon: LucideIcon
  description?: string
  tone?: 'normal' | 'perigo'
  children: React.ReactNode
  id: string
}) {
  return (
    <motion.section
      aria-labelledby={id}
      className={clsx(
        'rounded-[28px] border p-5',
        tone === 'perigo' ? 'border-vermelha/35 bg-vermelha/5' : 'border-linha bg-superficie',
      )}
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 30 }}
    >
      <div className="mb-4 flex items-start gap-3">
        <span
          className={clsx(
            'flex size-10 shrink-0 items-center justify-center rounded-full',
            tone === 'perigo' ? 'bg-vermelha/15 text-vermelha' : 'bg-superficie-2 text-azul',
          )}
          aria-hidden="true"
        >
          <Icon className="size-5" />
        </span>
        <div>
          <h2 id={id} className="placar text-[1.9rem]">
            {title}
          </h2>
          {description ? <p className="text-sm text-giz-suave">{description}</p> : null}
        </div>
      </div>
      <div className="flex flex-col gap-5">{children}</div>
    </motion.section>
  )
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-linha/70 pt-4 first:border-t-0 first:pt-0">
      <h3 className="mb-3 font-semibold">{title}</h3>
      {children}
    </div>
  )
}

const downloadClass =
  'flex min-h-14 items-center gap-3 rounded-2xl border border-linha bg-superficie-2/60 px-4 py-2 transition hover:border-azul/60 active:scale-[0.98]'

export default function ProfilePage() {
  const user = useCurrentUser()
  const logout = useLogout()
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const initial = (user.name.trim().charAt(0) || '?').toUpperCase()
  const since = user.created_at
    ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(user.created_at))
    : null

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <PageHeader title="Perfil" subtitle={user.email} />

      <div className="-mt-3 flex items-center gap-4">
        <motion.span
          className="relative block size-20 shrink-0"
          initial={{ scale: 0, rotate: -160 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 16 }}
          aria-hidden="true"
        >
          <Plate color="var(--anilha-azul)" letter={initial} className="size-full" />
        </motion.span>
        <div className="min-w-0">
          <p className="placar truncate text-4xl">{user.name}</p>
          <p className="text-sm text-giz-suave">
            {since ? `Registrando desde ${since}` : null}
            {user.role === 'admin' ? (
              <span className="ml-2 rounded-full bg-amarela/15 px-2 py-0.5 text-xs font-semibold text-amarela">Administrador</span>
            ) : null}
          </p>
        </div>
      </div>

      <Section id="sec-conta" title="Conta" icon={UserRound} description="Como o REPLOG chama você e em que horário seus treinos são datados.">
        <NameForm />
        <Block title="Fuso horário">
          <p className="text-giz-suave">
            <span className="font-medium text-giz">{user.timezone}</span>, detectado pelo aparelho que você está usando. As
            datas dos treinos seguem esse fuso.
          </p>
        </Block>
      </Section>

      <Section id="sec-aparencia" title="Aparência" icon={Palette}>
        <div role="radiogroup" aria-label="Tema" className="grid grid-cols-2 gap-3">
          {(
            [
              ['escuro', 'Escuro', Moon, 'Plataforma à noite'],
              ['claro', 'Claro', Sun, 'Academia de dia'],
            ] as const
          ).map(([value, label, Icon, hint]) => {
            const active = theme === value
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => {
                  setTheme(value)
                  setThemeState(value)
                }}
                className={clsx(
                  'relative flex flex-col items-start gap-2 overflow-hidden rounded-2xl border p-3 text-left transition active:scale-[0.98]',
                  active ? 'border-azul' : 'border-linha hover:border-azul/50',
                )}
              >
                <span
                  className={clsx(
                    'block h-14 w-full rounded-xl border pt-2',
                    value === 'escuro' ? 'border-[#2a3557] bg-[#0b1020]' : 'border-[#d3d9e6] bg-[#eef1f6]',
                  )}
                  aria-hidden="true"
                >
                  <span className="mx-2 block h-2 w-1/2 rounded-full bg-[#3b74ff]" />
                  <span className={clsx('mx-2 mt-1.5 block h-1.5 w-1/3 rounded-full', value === 'escuro' ? 'bg-[#9aa6c2]' : 'bg-[#55607a]')} />
                </span>
                <span className="flex w-full items-center gap-2 font-semibold">
                  <Icon className="size-4" aria-hidden="true" /> {label}
                  {active ? <Check className="ml-auto size-4 text-azul" aria-hidden="true" /> : null}
                </span>
                <span className="-mt-1 text-xs text-giz-suave">{hint}</span>
              </button>
            )
          })}
        </div>
      </Section>

      <Section id="sec-seguranca" title="Segurança" icon={ShieldCheck} description="Senha e aparelhos conectados à sua conta.">
        <ChangePasswordForm />
        <SessionsSection />
      </Section>

      <Section id="sec-dados" title="Seus dados" icon={Database} description="Uma cópia de todos os seus treinos, séries e recordes. Os dados são seus.">
        <div className="grid gap-2 sm:grid-cols-2">
          <a href="/api/users/me/export.csv" download className={downloadClass}>
            <FileSpreadsheet className="size-6 shrink-0 text-verde" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-semibold">Baixar planilha (CSV)</span>
              <span className="block text-xs text-giz-suave">Abre no Excel e no Google Planilhas</span>
            </span>
          </a>
          <a href="/api/users/me/export" download className={downloadClass}>
            <FileJson className="size-6 shrink-0 text-azul" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-semibold">Baixar meus dados</span>
              <span className="block text-xs text-giz-suave">Arquivo JSON completo</span>
            </span>
          </a>
        </div>
      </Section>

      <Section id="sec-saida" title="Sair e excluir" icon={DoorOpen} tone="perigo">
        <Block title="Sair">
          <Button variant="secundario" icon={<LogOut className="size-4" />} loading={logout.isPending} onClick={() => logout.mutate()}>
            Sair desta conta
          </Button>
        </Block>
        <DeleteAccountSection />
      </Section>
    </div>
  )
}

function NameForm() {
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState(user.name)
  const mutation = useMutation({
    mutationFn: () => authApi.updateProfile({ name: name.trim() }),
    onSuccess: (u) => {
      queryClient.setQueryData(ME_KEY, u)
      toast.show({ tone: 'sucesso', title: 'Nome atualizado' })
    },
  })
  const error = mutation.error instanceof ApiError ? (mutation.error.fields.name ?? mutation.error.message) : undefined
  return (
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <Field className="flex-1" label="Nome" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={error} />
      <Button type="submit" variant="secundario" loading={mutation.isPending} disabled={name.trim() === user.name || name.trim().length < 2}>
        Salvar nome
      </Button>
    </form>
  )
}

const passwordSchema = withConfirmation({ current_password: z.string().min(1, 'Informe a senha atual.') })
type PasswordForm = z.infer<typeof passwordSchema>

function ChangePasswordForm() {
  const toast = useToast()
  const [general, setGeneral] = useState<string | null>(null)
  const { register, handleSubmit, setError, reset, formState: { errors } } = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
  })
  const mutation = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: (data) => {
      reset()
      setGeneral(null)
      toast.show({ tone: 'sucesso', title: 'Senha alterada', body: data.mensagem })
    },
    onError: (err) => setGeneral(applyApiErrors(err, setError, ['current_password', 'password', 'password_confirm'])),
  })
  return (
    <Block title="Trocar senha">
      <form noValidate className="flex flex-col gap-4" onSubmit={handleSubmit((d) => mutation.mutate(d))}>
        {general && mutation.isError ? <Alert tone="erro">{general}</Alert> : null}
        <Field label="Senha atual" type="password" autoComplete="current-password" error={errors.current_password?.message} {...register('current_password')} />
        <Field label="Nova senha" type="password" autoComplete="new-password" error={errors.password?.message} {...register('password')} />
        <Field label="Confirme a nova senha" type="password" autoComplete="new-password" error={errors.password_confirm?.message} {...register('password_confirm')} />
        <Button type="submit" variant="secundario" className="self-start" loading={mutation.isPending}>
          Trocar senha
        </Button>
      </form>
    </Block>
  )
}

function SessionsSection() {
  const toast = useToast()
  const mutation = useMutation({
    mutationFn: authApi.logoutOthers,
    onSuccess: (d) => toast.show({ tone: 'sucesso', title: 'Sessões encerradas', body: d.mensagem }),
  })
  return (
    <Block title="Outros aparelhos">
      <p className="mb-3 text-giz-suave">Saia da conta em todos os outros celulares e computadores, mantendo este.</p>
      <Button variant="secundario" loading={mutation.isPending} onClick={() => mutation.mutate()}>
        Encerrar outras sessões
      </Button>
      {mutation.isError ? <div className="mt-3"><Alert tone="erro">{mutation.error.message}</Alert></div> : null}
    </Block>
  )
}

function DeleteAccountSection() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const mutation = useMutation({
    mutationFn: () => authApi.deleteAccount(password),
    onSuccess: () => {
      queryClient.clear()
      queryClient.setQueryData(ME_KEY, null)
      navigate('/entrar', { replace: true })
    },
  })
  const fieldError = mutation.error instanceof ApiError ? mutation.error.fields.password : undefined
  return (
    <Block title="Excluir conta">
      <p className="mb-3 text-giz-suave">Apaga sua conta e todos os treinos, séries e recordes. Não é possível desfazer.</p>
      <Button variant="perigo" onClick={() => setOpen(true)}>
        Excluir minha conta
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Excluir conta?"
        footer={
          <div className="flex gap-2">
            <Button variant="fantasma" className="flex-1" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button variant="perigo" className="flex-1" loading={mutation.isPending} disabled={!password} onClick={() => mutation.mutate()}>
              Excluir definitivamente
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p>Todos os seus dados serão apagados para sempre. Digite sua senha para confirmar.</p>
          {mutation.isError && !fieldError ? <Alert tone="erro">{mutation.error.message}</Alert> : null}
          <Field label="Senha" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fieldError} />
        </div>
      </Dialog>
    </Block>
  )
}
