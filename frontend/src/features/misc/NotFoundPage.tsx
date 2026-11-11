import { motion } from 'motion/react'
import { Link } from 'react-router-dom'

import { Barbell } from '@/components/brand/Barbell'

export default function NotFoundPage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5">
      <motion.div
        initial={{ rotate: -8, y: -30, opacity: 0 }}
        animate={{ rotate: -3, y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 180, damping: 12 }}
      >
        <Barbell plates={[]} height={70} />
      </motion.div>
      <p className="placar mt-4 text-[7rem] text-giz-suave">404</p>
      <h1 className="placar mt-1 text-4xl">Página não encontrada</h1>
      <p className="mt-2 text-giz-suave">O endereço pode ter mudado ou não existe.</p>
      <Link
        to="/"
        className="mt-6 inline-flex min-h-12 items-center justify-center self-start rounded-2xl bg-azul px-5 font-semibold text-white transition hover:bg-azul-forte active:scale-[0.97]"
      >
        Voltar para o início
      </Link>
    </div>
  )
}
