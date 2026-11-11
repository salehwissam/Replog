import type { Achievement } from '@/api/achievements'

const a = (x: Partial<Achievement> & Pick<Achievement, 'key' | 'title' | 'description' | 'icon' | 'tier' | 'target' | 'current'>): Achievement => {
  const unlocked = x.current >= x.target
  return {
    unlocked,
    unlocked_at: unlocked ? '2026-10-20T21:10:00Z' : null,
    progress: Math.min(1, x.current / x.target),
    ...x,
  }
}

export const achievementsFixture: Achievement[] = [
  a({ key: 'primeiro-treino', title: 'Primeiro treino', description: 'Registre seu primeiro treino.', icon: 'dumbbell', tier: 'bronze', current: 1, target: 1, unlocked_at: '2026-03-02T20:41:00Z' }),
  a({ key: 'primeiro-recorde', title: 'Primeiro recorde', description: 'Supere uma marca pessoal.', icon: 'trophy', tier: 'bronze', current: 1, target: 1, unlocked_at: '2026-03-09T21:02:00Z' }),
  a({ key: 'dez-treinos', title: 'Dez treinos', description: 'Complete 10 treinos.', icon: 'calendar-check', tier: 'bronze', current: 10, target: 10, unlocked_at: '2026-04-06T20:15:00Z' }),
  a({ key: 'mil-repeticoes', title: 'Mil repetições', description: 'Some 1.000 repetições.', icon: 'repeat', tier: 'bronze', current: 1000, target: 1000, unlocked_at: '2026-04-20T19:30:00Z' }),
  a({ key: 'sequencia-4', title: 'Um mês sem falhar', description: 'Treine 4 semanas seguidas.', icon: 'flame', tier: 'prata', current: 4, target: 4, unlocked_at: '2026-11-03T22:05:00Z' }),
  a({ key: 'cinquenta-treinos', title: 'Cinquenta treinos', description: 'Complete 50 treinos.', icon: 'medal', tier: 'prata', current: 50, target: 50, unlocked_at: '2026-09-15T20:00:00Z' }),
  a({ key: 'series-100', title: 'Cem séries', description: 'Complete 100 séries de trabalho (aquecimento não conta).', icon: 'weight', tier: 'prata', current: 100, target: 100, unlocked_at: '2026-08-11T21:40:00Z' }),
  a({ key: 'dez-recordes', title: 'Colecionador', description: 'Bata 25 recordes pessoais.', icon: 'star', tier: 'prata', current: 18, target: 25 }),
  a({ key: 'cem-treinos', title: 'Cem treinos', description: 'Complete 100 treinos.', icon: 'crown', tier: 'ouro', current: 87, target: 100 }),
  a({ key: 'sequencia-12', title: 'Trimestre de ferro', description: 'Treine 12 semanas seguidas.', icon: 'calendar-range', tier: 'ouro', current: 5, target: 12 }),
  a({ key: 'series-500', title: 'Quinhentas séries', description: 'Complete 500 séries de trabalho. Constância de verdade!', icon: 'mountain', tier: 'ouro', current: 248, target: 500 }),
  a({ key: 'supino-100', title: 'Clube dos 100', description: 'Faça uma série com 100 kg ou mais.', icon: 'zap', tier: 'ouro', current: 0, target: 1 }),
]
