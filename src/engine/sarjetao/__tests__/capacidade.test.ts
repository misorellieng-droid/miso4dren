import { describe, expect, it } from 'vitest'
import { calcularCapacidadeHec22, calcularCapacidadeManningGenerica } from '../capacidade'

describe('calcularCapacidadeManningGenerica (Método 1)', () => {
  it('A=T·y, P=2T, Rh=A/P, Q=(1/n)·A·Rh^(2/3)·SL^(1/2)', () => {
    const r = calcularCapacidadeManningGenerica({ larguraEspraiamentoM: 2.5, laminaMaxM: 0.05, manningN: 0.016, declividadeLongitudinalMM: 0.0045 })
    expect(r.areaMolhadaM2).toBeCloseTo(0.125, 9)
    expect(r.raioHidraulicoM).toBeCloseTo(0.025, 9)
    expect(r.vazaoCapacidadeM3s).toBeCloseTo(0.04480807566396856, 9)
    expect(r.velocidadeMs).toBeCloseTo(0.3584646053117485, 9)
  })
})

describe('calcularCapacidadeHec22 (Método 2)', () => {
  it('Q=(0,375/n)·Sx^(5/3)·SL^(1/2)·T^(8/3), usa Sx da pista (não do sarjetão)', () => {
    const r = calcularCapacidadeHec22({
      sxPista: 0.02,
      larguraEspraiamentoM: 2.5,
      laminaMaxM: 0.05,
      manningN: 0.016,
      declividadeLongitudinalMM: 0.0045,
    })
    expect(r.vazaoCapacidadeM3s).toBeCloseTo(0.026673144917120375, 9)
    expect(r.raioHidraulicoM).toBeNull()
    expect(r.areaMolhadaM2).toBeCloseTo(0.0625, 9)
    expect(r.velocidadeMs).toBeCloseTo(0.426770318673926, 9)
  })
})
