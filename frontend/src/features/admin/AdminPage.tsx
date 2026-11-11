import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { motion } from 'motion/react'
import { useDeferredValue, useState } from 'react'

import { adminApi, type AdminUser } from '@/api/admin'
import { ApiError } from '@/api/client'
import { queryKeys, workoutsApi } from '@/api/workouts'
import { PageHeader } from '@/components/layout/PageHeader'
import { Alert } from '@/components/ui/Alert'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { Button } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { Field } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { useExerciseMeta } from '@/components/workout/ExercisePicker'
import { formatInstantDate } from '@/lib/format'

export default function AdminPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Administração" subtitle="Visão geral do REPLOG. Os treinos de cada pessoa são privados." />
      <StatsGrid />
      <UsersSection />
      <CatalogSection />
    </div>
  )
}

function StatsGrid() {
  const stats = useQuery({ queryKey: ['admin', 'stats'], queryFn: adminApi.stats })
  if (stats.isPending) return <Spinner />
  if (stats.isError) return <Alert tone="erro">{stats.error.message}</Alert>
  const s = stats.data
  const groups: { title: string; tone: string; items: [string, number][] }[] = [
    {
      title: 'Pessoas',
      tone: 'bg-azul',
      items: [
        ['Usuários', s.users_total],
        ['E-mails confirmados', s.users_verified],
        ['Ativos em 7 dias', s.users_active_7d],
        ['Novos em 7 dias', s.new_users_7d],
      ],
    },
    {
      title: 'Treinos',
      tone: 'bg-verde',
      items: [
        ['Treinos registrados', s.workouts_total],
        ['Treinos em 7 dias', s.workouts_7d],
        ['Séries registradas', s.sets_total],
        ['Contas desativadas', s.users_inactive],
      ],
    },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((g, gi) => (
        <section key={g.title} aria-label={g.title} className="relative overflow-hidden rounded-[26px] border border-linha bg-superficie p-5">
          <span className={`absolute inset-y-0 left-0 w-1 ${g.tone}`} aria-hidden="true" />
          <h2 className="placar mb-3 text-2xl text-giz-suave">{g.title}</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
            {g.items.map(([label, value], i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 340, damping: 28, delay: gi * 0.1 + i * 0.05 }}
              >
                <dt className="text-sm text-giz-suave">{label}</dt>
                <dd className="placar text-5xl">
                  <AnimatedNumber value={value} />
                </dd>
              </motion.div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function UsersSection() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const deferred = useDeferredValue(query.trim())
  const [confirm, setConfirm] = useState<AdminUser | null>(null)

  const users = useQuery({
    queryKey: ['admin', 'users', deferred, page],
    queryFn: () => adminApi.users(deferred, page),
    placeholderData: keepPreviousData,
  })
  const toggle = useMutation({
    mutationFn: (u: AdminUser) => adminApi.setActive(u.id, !u.is_active),
    onSuccess: (u) => {
      setConfirm(null)
      queryClient.invalidateQueries({ queryKey: ['admin'] })
      toast.show({ tone: 'sucesso', title: u.is_active ? 'Conta reativada' : 'Conta desativada', body: u.email })
    },
  })
  const totalPages = users.data ? Math.max(1, Math.ceil(users.data.total / users.data.page_size)) : 1

  return (
    <section aria-labelledby="usuarios">
      <h2 id="usuarios" className="placar mb-3 text-3xl">
        Usuários
      </h2>
      <div className="relative mb-3 max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-giz-suave" aria-hidden="true" />
        <input
          type="search"
          value={query}
          maxLength={100}
          onChange={(e) => {
            setQuery(e.target.value)
            setPage(1)
          }}
          placeholder="Buscar por nome ou e-mail"
          aria-label="Buscar usuário"
          className="min-h-12 w-full rounded-2xl border border-linha bg-superficie-2/70 pl-10 pr-3 focus:border-azul focus:outline-none focus:ring-4 focus:ring-azul/25"
        />
      </div>
      {users.isPending ? (
        <Spinner />
      ) : users.isError ? (
        <Alert tone="erro">{users.error.message}</Alert>
      ) : (
        <>
          <div className="overflow-x-auto rounded-[22px] border border-linha bg-superficie">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-aco-2 text-giz-suave">
                <tr>
                  <th className="px-4 py-3 font-medium">Pessoa</th>
                  <th className="px-4 py-3 font-medium">Situação</th>
                  <th className="px-4 py-3 font-medium">Cadastro</th>
                  <th className="px-4 py-3 font-medium">Último acesso</th>
                  <th className="px-4 py-3 text-right font-medium">Treinos</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((u) => (
                  <tr key={u.id} className="border-t border-linha transition-colors hover:bg-superficie-2/50">
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {u.name}
                        {u.role === 'admin' ? <span className="ml-2 rounded-full bg-amarela/15 px-2 py-0.5 text-xs font-semibold text-amarela">admin</span> : null}
                      </p>
                      <p className="break-all text-giz-suave">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {!u.is_active ? (
                        <StatusPill tone="vermelha">Desativada</StatusPill>
                      ) : u.is_verified ? (
                        <StatusPill tone="verde">Ativa</StatusPill>
                      ) : (
                        <StatusPill tone="giz">E-mail pendente</StatusPill>
                      )}
                    </td>
                    <td className="px-4 py-3">{formatInstantDate(u.created_at)}</td>
                    <td className="px-4 py-3">{u.last_seen_at ? formatInstantDate(u.last_seen_at) : '—'}</td>
                    <td className="num px-4 py-3 text-right text-xl">{u.workouts}</td>
                    <td className="px-4 py-3 text-right">
                      {u.role !== 'admin' ? (
                        <Button variant={u.is_active ? 'fantasma' : 'secundario'} onClick={() => setConfirm(u)}>
                          {u.is_active ? 'Desativar' : 'Reativar'}
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.data.items.length === 0 ? <p className="mt-2 text-giz-suave">Nenhum usuário encontrado.</p> : null}
          {totalPages > 1 ? (
            <nav aria-label="Paginação de usuários" className="mt-3 flex items-center gap-3">
              <Button variant="secundario" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                Anterior
              </Button>
              <span className="text-sm text-giz-suave">
                Página {page} de {totalPages}
              </span>
              <Button variant="secundario" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                Próxima
              </Button>
            </nav>
          ) : null}
        </>
      )}
      <Dialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        title={confirm?.is_active ? 'Desativar conta?' : 'Reativar conta?'}
        footer={
          <div className="flex gap-2">
            <Button variant="fantasma" className="flex-1" onClick={() => setConfirm(null)}>
              Cancelar
            </Button>
            <Button
              variant={confirm?.is_active ? 'perigo' : 'primario'}
              className="flex-1"
              loading={toggle.isPending}
              onClick={() => confirm && toggle.mutate(confirm)}
            >
              {confirm?.is_active ? 'Desativar conta' : 'Reativar conta'}
            </Button>
          </div>
        }
      >
        {confirm ? (
          <p>
            {confirm.is_active
              ? `${confirm.email} não conseguirá mais entrar, e as sessões abertas serão encerradas agora. Os dados não são apagados.`
              : `${confirm.email} poderá entrar novamente.`}
          </p>
        ) : null}
        {toggle.isError ? <Alert tone="erro">{toggle.error.message}</Alert> : null}
      </Dialog>
    </section>
  )
}

function CatalogSection() {
  const queryClient = useQueryClient()
  const toast = useToast()
  const meta = useExerciseMeta()
  const [name, setName] = useState('')
  const [group, setGroup] = useState('peito')
  const [equipment, setEquipment] = useState('outro')
  const catalog = useQuery({ queryKey: queryKeys.exercises('', ''), queryFn: () => workoutsApi.exercises() })

  const create = useMutation({
    mutationFn: () => adminApi.createExercise({ name: name.trim(), muscle_group: group, equipment, is_bodyweight: equipment === 'peso_corporal' }),
    onSuccess: (ex) => {
      setName('')
      queryClient.invalidateQueries({ queryKey: ['exercises'] })
      toast.show({ tone: 'sucesso', title: 'Exercício adicionado ao catálogo', body: ex.name })
    },
  })
  const archive = useMutation({
    mutationFn: adminApi.archiveExercise,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['exercises'] }),
  })
  const fieldError = create.error instanceof ApiError ? create.error.fields.name : undefined
  const globals = (catalog.data ?? []).filter((e) => !e.is_custom)

  return (
    <section aria-labelledby="catalogo">
      <h2 id="catalogo" className="placar mb-1 text-3xl">
        Catálogo de exercícios
      </h2>
      <p className="mb-3 text-sm text-giz-suave">
        Exercícios disponíveis para todos. Arquivar esconde o exercício, mas mantém o histórico de quem já usou.
      </p>
      <form
        className="mb-4 grid gap-3 rounded-[24px] border border-linha bg-aco-2 p-4 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault()
          if (name.trim().length >= 2) create.mutate()
        }}
      >
        <Field label="Novo exercício" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} error={fieldError} />
        <label className="flex flex-col gap-1.5 text-sm font-medium text-giz-suave">
          Grupo
          <select value={group} onChange={(e) => setGroup(e.target.value)} className="min-h-13 rounded-2xl border border-linha bg-superficie-2/70 px-3 text-base text-giz">
            {Object.entries(meta.data?.muscle_groups ?? {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-giz-suave">
          Equipamento
          <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className="min-h-13 rounded-2xl border border-linha bg-superficie-2/70 px-3 text-base text-giz">
            {Object.entries(meta.data?.equipment ?? {}).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2}>
          Adicionar
        </Button>
      </form>
      {catalog.isPending ? (
        <Spinner />
      ) : (
        <ul className="grid gap-x-6 rounded-[22px] border border-linha bg-superficie px-4 py-1 sm:grid-cols-2 lg:grid-cols-3">
          {globals.map((e) => (
            <li key={e.id} className="flex min-h-12 items-center justify-between gap-2 border-b border-linha/60">
              <span className="truncate">{e.name}</span>
              <button
                type="button"
                onClick={() => archive.mutate(e.id)}
                className="min-h-9 shrink-0 rounded-full px-3 text-xs font-semibold text-giz-suave transition hover:bg-vermelha/10 hover:text-vermelha"
                aria-label={`Arquivar ${e.name}`}
              >
                Arquivar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function StatusPill({ tone, children }: { tone: 'verde' | 'vermelha' | 'giz'; children: string }) {
  const cls =
    tone === 'verde'
      ? 'bg-verde/15 text-verde'
      : tone === 'vermelha'
        ? 'bg-vermelha/15 text-vermelha'
        : 'bg-superficie-2 text-giz-suave'
  const dot = tone === 'verde' ? 'bg-verde' : tone === 'vermelha' ? 'bg-vermelha' : 'bg-giz-suave'
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}>
      <span className={`size-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {children}
    </span>
  )
}
