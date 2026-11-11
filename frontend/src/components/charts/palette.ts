export const dataVars = [
  '[--calor-1:#2f4f9e] [--calor-2:#3b6ae6] [--calor-3:#6f97ff] [--calor-4:#b4cbff]',
  '[:root[data-theme=claro]_&]:[--calor-1:#9db6f5] [:root[data-theme=claro]_&]:[--calor-2:#5f88ee]',
  '[:root[data-theme=claro]_&]:[--calor-3:#2a5ee6] [:root[data-theme=claro]_&]:[--calor-4:#173e9e]',
  '[--metal-bronze:#b06a36] [--metal-prata:#8590a6] [--metal-ouro:#e0aa1e]',
  '[:root[data-theme=claro]_&]:[--metal-bronze:#94562a] [:root[data-theme=claro]_&]:[--metal-prata:#6f7d96]',
  '[:root[data-theme=claro]_&]:[--metal-ouro:#c79200]',
].join(' ')

export const HEAT_STEPS = ['var(--calor-1)', 'var(--calor-2)', 'var(--calor-3)', 'var(--calor-4)'] as const

export const METAL = {
  bronze: 'var(--metal-bronze)',
  prata: 'var(--metal-prata)',
  ouro: 'var(--metal-ouro)',
} as const
