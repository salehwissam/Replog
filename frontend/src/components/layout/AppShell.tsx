import { useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import {
  ChartLine,
  Medal,
  History,
  House,
  LayoutList,
  Library,
  LogOut,
  Menu,
  ShieldCheck,
  Trophy,
  UserRound,
} from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, type Variants } from 'motion/react'
import { Suspense, useEffect, useState } from 'react'
import { Link, NavLink, useLocation, useOutlet } from 'react-router-dom'

import { authApi } from '@/api/auth'
import { BarbellMark } from '@/components/brand/BarbellMark'
import { Plate } from '@/components/brand/Plate'
import { PageLoader } from '@/components/ui/Spinner'
import { ME_KEY, useCurrentUser, useLogout } from '@/features/auth/useAuth'
import { molaAnilha, molaPagina, molaToque, vibrar, VIBRACOES } from '@/lib/motion'
import { detectTimezone } from '@/lib/timezone'

interface NavItem {
  to: string
  label: string
  Icon: typeof House
  end?: boolean
  primary?: boolean
  mobileOnly?: boolean
}

const mainNav: NavItem[] = [
  { to: '/', label: 'Início', Icon: House, end: true },
  { to: '/historico', label: 'Histórico', Icon: History },
  { to: '/treino', label: 'Treinar', Icon: House, primary: true },
  { to: '/recordes', label: 'Recordes', Icon: Trophy },
  { to: '/mais', label: 'Mais', Icon: Menu, mobileOnly: true },
]

const secondaryNav: NavItem[] = [
  { to: '/programas', label: 'Programas prontos', Icon: Library },
  { to: '/divisoes', label: 'Divisões de treino', Icon: LayoutList },
  { to: '/estatisticas', label: 'Estatísticas', Icon: ChartLine },
  { to: '/conquistas', label: 'Conquistas', Icon: Medal },
  { to: '/perfil', label: 'Perfil', Icon: UserRound },
]

const adminNav: NavItem = { to: '/admin', label: 'Administração', Icon: ShieldCheck }

export function useSecondaryNav(): NavItem[] {
  const user = useCurrentUser()
  return user.role === 'admin' ? [...secondaryNav, adminNav] : secondaryNav
}

function useTimezoneSync() {
  const user = useCurrentUser()
  const queryClient = useQueryClient()
  useEffect(() => {
    const tz = detectTimezone()
    if (user.id !== 0 && tz && tz !== user.timezone) {
      authApi
        .updateProfile({ timezone: tz })
        .then((updated) => queryClient.setQueryData(ME_KEY, updated))
        .catch(() => undefined)
    }
  }, [user.id, user.timezone, queryClient])
}

function FrozenOutlet() {
  const outlet = useOutlet()
  const [frozen] = useState(outlet)
  return frozen
}

function isActive(pathname: string, item: NavItem): boolean {
  return item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)
}

const ORDER = [
  '/',
  '/historico',
  '/treino',
  '/recordes',
  '/mais',
  '/programas',
  '/divisoes',
  '/estatisticas',
  '/conquistas',
  '/perfil',
  '/admin',
]

function sectionRank(path: string): number {
  return ORDER.findIndex((p) => (p === '/' ? path === '/' : path === p || path.startsWith(`${p}/`)))
}

function directionBetween(from: string, to: string): number {
  const a = sectionRank(from)
  const b = sectionRank(to)
  if (a === -1 || b === -1) return 0
  if (a === b) {
    const depth = (p: string) => p.split('/').filter(Boolean).length
    return Math.sign(depth(to) - depth(from))
  }
  return Math.sign(b - a)
}

function usePageDirection(pathname: string): number {
  const [state, setState] = useState({ path: pathname, dir: 0 })
  if (state.path !== pathname) {
    const dir = directionBetween(state.path, pathname)
    setState({ path: pathname, dir })
    return dir
  }
  return state.dir
}

const pageVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 40, y: dir === 0 ? 18 : 0, scale: dir === 0 ? 0.985 : 1 }),
  center: { opacity: 1, x: 0, y: 0, scale: 1, transition: molaPagina },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir * -28,
    y: dir === 0 ? -8 : 0,
    transition: { duration: 0.15, ease: [0.4, 0, 1, 1] },
  }),
}

function SideLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(pathname, item)
  const Icon = item.Icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={clsx(
        'group relative flex min-h-12 items-center gap-3 rounded-2xl px-3.5 font-medium transition-colors',
        active ? 'text-giz' : 'text-giz-suave hover:bg-superficie/60 hover:text-giz',
      )}
    >
      {active ? (
        <motion.span
          layoutId="lateral-ativo"
          className="absolute inset-0 rounded-2xl border border-linha bg-superficie shadow-[inset_0_1px_0_var(--realce),0_8px_20px_-14px_rgb(0_0_0/0.6)]"
          transition={molaToque}
        >
          <span className="absolute inset-y-2.5 left-0 w-1 rounded-r-full bg-azul" />
        </motion.span>
      ) : null}
      <span className="relative flex size-6 items-center justify-center">
        {item.primary ? (
          <Plate
            color="var(--anilha-azul)"
            grip
            className="size-6 transition-transform duration-500 ease-out group-hover:rotate-[120deg]"
          />
        ) : (
          <Icon className={clsx('size-5 transition-colors', active && 'text-azul')} aria-hidden="true" />
        )}
      </span>
      <span className="relative">{item.label}</span>
    </NavLink>
  )
}

function Sidebar({ pathname }: { pathname: string }) {
  const user = useCurrentUser()
  const logout = useLogout()
  const extraNav = useSecondaryNav()
  const primary = mainNav.filter((i) => !i.mobileOnly)
  const initial = user.name.trim().charAt(0).toUpperCase() || 'R'

  return (
    <aside className="sticky top-0 hidden h-dvh w-72 shrink-0 flex-col border-r border-linha bg-aco-2 px-4 pb-5 pt-7 lg:flex">
      <span
        className="knurl pointer-events-none absolute inset-x-0 top-0 h-64"
        style={{ maskImage: 'linear-gradient(to bottom, black, transparent)' }}
        aria-hidden="true"
      />
      <Link to="/" className="relative mb-9 flex items-center gap-3 self-start rounded-xl px-3 py-1" aria-label="REPLOG — página inicial">
        <BarbellMark className="h-8 w-auto" />
        <span className="placar text-4xl tracking-[0.01em]">REPLOG</span>
      </Link>

      <LayoutGroup id="lateral">
        <nav aria-label="Navegação principal" className="relative flex flex-1 flex-col gap-1 overflow-y-auto">
          {primary.map((item) => (
            <SideLink key={item.to} item={item} pathname={pathname} />
          ))}
          <span className="mx-3.5 my-3 flex items-center gap-1" aria-hidden="true">
            <span className="h-2.5 w-1 rounded-[1px] bg-linha-forte" />
            <span className="h-px flex-1 bg-linha" />
            <span className="h-2.5 w-1 rounded-[1px] bg-linha-forte" />
          </span>
          {extraNav.map((item) => (
            <SideLink key={item.to} item={item} pathname={pathname} />
          ))}
        </nav>
      </LayoutGroup>

      <div className="relative mt-4 rounded-[22px] border border-linha bg-superficie/70 p-2 shadow-[inset_0_1px_0_var(--realce)]">
        <div className="flex items-center gap-3 px-1.5 py-1">
          <Plate color="var(--anilha-azul)" letter={initial} className="size-10 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{user.name}</p>
            <p className="truncate text-xs text-giz-suave">{user.email}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => logout.mutate()}
          className="mt-1.5 flex min-h-10 w-full items-center gap-2.5 rounded-xl px-2.5 text-sm text-giz-suave transition hover:bg-vermelha/10 hover:text-vermelha active:scale-[0.98]"
        >
          <LogOut className="size-4" aria-hidden="true" />
          Sair
        </button>
      </div>
    </aside>
  )
}

function DockPlate({ active }: { active: boolean }) {
  return (
    <span className="relative block size-[66px]">
      <AnimatePresence>
        {active ? (
          <motion.span
            key="halo"
            className="absolute inset-0 rounded-full border-2 border-azul"
            initial={{ scale: 0.9, opacity: 0.7 }}
            animate={{ scale: 1.45, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
          />
        ) : null}
      </AnimatePresence>
      <motion.span
        className={clsx(
          'relative block size-full rounded-full bg-aco p-[5px] ring-1 ring-linha transition-shadow duration-300',
          active
            ? 'shadow-[0_10px_30px_-6px_var(--anilha-azul),inset_0_1px_0_var(--realce)]'
            : 'shadow-[0_10px_24px_-10px_var(--anilha-azul),inset_0_1px_0_var(--realce)]',
        )}
        animate={{ rotate: active ? 180 : 0 }}
        whileTap={{ scale: 0.9, rotate: active ? 240 : 60 }}
        transition={{ type: 'spring', stiffness: 170, damping: 15, mass: 1.2 }}
      >
        <Plate color="var(--anilha-azul)" grip className="size-full" />
      </motion.span>
    </span>
  )
}

function Dock({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 lg:hidden"
    >
      <LayoutGroup id="doca">
        <ul className="mx-auto grid max-w-md grid-cols-5 items-end rounded-[26px] border border-linha bg-superficie/85 px-1.5 py-1.5 shadow-[var(--sombra-doca)] backdrop-blur-xl backdrop-saturate-150">
          {mainNav.map((item) => {
            const active = isActive(pathname, item)
            const Icon = item.Icon
            if (item.primary) {
              return (
                <li key={item.to} className="flex justify-center">
                  <NavLink
                    to={item.to}
                    aria-label={item.label}
                    onClick={() => vibrar(VIBRACOES.toque)}
                    className="-mt-9 flex flex-col items-center gap-0.5 rounded-full"
                  >
                    <DockPlate active={active} />
                    <span
                      className={clsx(
                        'text-[11px] font-semibold leading-none transition-colors',
                        active ? 'text-giz' : 'text-giz-suave',
                      )}
                      aria-hidden="true"
                    >
                      {item.label}
                    </span>
                  </NavLink>
                </li>
              )
            }
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={() => vibrar(VIBRACOES.passo)}
                  className={clsx(
                    'relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[20px] text-[11px] font-medium transition-colors',
                    active ? 'text-giz' : 'text-giz-suave',
                  )}
                >
                  {active ? (
                    <motion.span
                      layoutId="doca-ativo"
                      className="absolute inset-0 rounded-[20px] bg-superficie-2 shadow-[inset_0_1px_0_var(--realce)]"
                      transition={molaToque}
                    >
                      <span className="absolute left-1/2 top-1 h-[3px] w-5 -translate-x-1/2 rounded-full bg-azul" />
                    </motion.span>
                  ) : null}
                  <motion.span
                    className="relative"
                    animate={{ y: active ? -1 : 0, scale: active ? 1.1 : 1 }}
                    transition={molaAnilha}
                  >
                    <Icon className={clsx('size-5', active && 'text-azul')} aria-hidden="true" />
                  </motion.span>
                  <span className="relative leading-none">{item.label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </LayoutGroup>
    </nav>
  )
}

export function AppShell() {
  useTimezoneSync()
  const location = useLocation()
  const dir = usePageDirection(location.pathname)

  useEffect(() => {
    document.scrollingElement?.scrollTo?.({ top: 0, left: 0 })
  }, [location.pathname])

  return (
    <div className="min-h-dvh lg:flex">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-azul-forte focus:px-3 focus:py-2 focus:text-white"
      >
        Pular para o conteúdo
      </a>

      <Sidebar pathname={location.pathname} />

      <main id="conteudo" className="mx-auto w-full min-w-0 max-w-5xl flex-1 px-4 pb-36 pt-5 sm:px-6 lg:pb-14 lg:pt-10">
        <AnimatePresence mode="popLayout" initial={false} custom={dir}>
          <motion.div
            key={location.pathname}
            custom={dir}
            variants={pageVariants}
            initial="enter"
            animate="center"
            exit="exit"
          >
            <Suspense fallback={<PageLoader variant="pagina" />}>
              <FrozenOutlet />
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      <Dock pathname={location.pathname} />
    </div>
  )
}
