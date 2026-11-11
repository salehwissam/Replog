import { ChevronRight, LogOut } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { Plate } from '@/components/brand/Plate'
import { useSecondaryNav } from '@/components/layout/AppShell'
import { PageHeader } from '@/components/layout/PageHeader'
import { Spinner } from '@/components/ui/Spinner'
import { useCurrentUser, useLogout } from '@/features/auth/useAuth'

const DESCRIPTIONS: Record<string, string> = {
  '/programas': 'Treinos montados por objetivo e dias',
  '/divisoes': 'Seus treinos A a E e exercícios',
  '/estatisticas': 'Séries, frequência e evolução',
  '/conquistas': 'Marcas que você já desbloqueou',
  '/perfil': 'Conta, tema, senha e seus dados',
  '/admin': 'Pessoas e catálogo de exercícios',
}

export default function MorePage() {
  const logout = useLogout()
  const user = useCurrentUser()
  const secondaryNav = useSecondaryNav()
  const initial = (user.name.trim().charAt(0) || '?').toUpperCase()

  return (
    <div className="max-w-2xl">
      <PageHeader title="Mais" />

      <Link
        to="/perfil"
        className="knurl mb-5 flex items-center gap-4 rounded-[26px] border border-linha bg-aco-2 p-4 transition hover:border-azul/60 active:scale-[0.99]"
      >
        <motion.span
          className="block size-16 shrink-0"
          initial={{ scale: 0, rotate: -150 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 280, damping: 16 }}
          aria-hidden="true"
        >
          <Plate color="var(--anilha-azul)" letter={initial} className="size-full" />
        </motion.span>
        <span className="min-w-0 flex-1">
          <span className="placar block truncate text-3xl">{user.name}</span>
          <span className="block truncate text-sm text-giz-suave">{user.email}</span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-giz-suave" aria-hidden="true" />
      </Link>

      <ul className="overflow-hidden rounded-[26px] border border-linha bg-superficie">
        {secondaryNav.map(({ to, label, Icon }, i) => (
          <motion.li
            key={to}
            className="border-b border-linha/70 last:border-b-0"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ type: 'spring', stiffness: 360, damping: 28, delay: 0.05 + i * 0.05 }}
          >
            <Link to={to} className="group flex min-h-[4.5rem] items-center gap-4 px-4 transition hover:bg-superficie-2 active:bg-superficie-2">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-superficie-2 transition group-hover:bg-azul group-hover:text-white">
                <Icon className="size-5 text-azul transition group-hover:text-white" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{label}</span>
                {DESCRIPTIONS[to] ? <span className="block truncate text-sm text-giz-suave">{DESCRIPTIONS[to]}</span> : null}
              </span>
              <ChevronRight className="size-5 shrink-0 text-giz-suave transition group-hover:translate-x-0.5" aria-hidden="true" />
            </Link>
          </motion.li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="mt-5 flex min-h-16 w-full items-center gap-4 rounded-[22px] border border-linha px-4 text-left text-giz-suave transition hover:border-vermelha/50 hover:text-vermelha active:scale-[0.98]"
      >
        <span className="flex size-11 items-center justify-center rounded-full bg-superficie-2" aria-hidden="true">
          {logout.isPending ? <Spinner className="size-5" /> : <LogOut className="size-5" />}
        </span>
        <span className="flex-1 font-semibold">Sair</span>
      </button>
    </div>
  )
}
