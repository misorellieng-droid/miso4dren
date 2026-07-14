import { describe, expect, it } from 'vitest'
import { calcularVazaoAfluente } from '../racional'

describe('calcularVazaoAfluente', () => {
  it('Q = K · i · C · largura · L, sem telhado', () => {
    const r = calcularVazaoAfluente({ larguraViaM: 20, coefC: 0.9, intensidadeMmH: 140, comprimentoM: 8 })
    expect(r.vazaoM3s).toBeCloseTo(0.005604479999999999, 12)
    expect(r.areaContribuinteM2).toBe(160)
  })

  it('com telhado ativo, pondera C por superfície (pista e cobertura entram com seus próprios C)', () => {
    const semTelhado = calcularVazaoAfluente({ larguraViaM: 20, coefC: 0.9, intensidadeMmH: 140, comprimentoM: 8 })
    const comTelhado = calcularVazaoAfluente({
      larguraViaM: 20,
      coefC: 0.9,
      larguraTelhadoM: 15,
      coefCTelhado: 0.95,
      intensidadeMmH: 140,
      comprimentoM: 8,
    })
    expect(comTelhado.vazaoM3s).toBeGreaterThan(semTelhado.vazaoM3s)
    expect(comTelhado.areaContribuinteM2).toBe(35 * 8)
  })
})
