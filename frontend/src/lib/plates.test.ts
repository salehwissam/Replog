import { describe, expect, it } from 'vitest'

import { plateLoad } from './plates'

const kgs = (total: number) => plateLoad(total).perSide.map((p) => p.kg)

describe('calculadora de anilhas', () => {
  it('monta a barra com as maiores anilhas primeiro', () => {
    expect(kgs(100)).toEqual([25, 15])
    expect(kgs(60)).toEqual([20])
    expect(kgs(102.5)).toEqual([25, 15, 1.25])
  })

  it('barra vazia não tem anilhas', () => {
    expect(kgs(20)).toEqual([])
  })

  it('avisa quando a carga é menor que a barra', () => {
    expect(plateLoad(10).belowBar).toBe(true)
  })

  it('informa o que sobra quando não fecha com as anilhas', () => {
    const load = plateLoad(21)
    expect(load.perSide).toEqual([])
    expect(load.remainder).toBe(0.5)
  })
})
