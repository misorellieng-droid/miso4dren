import { describe, expect, it } from 'vitest'
import { calcularComprimentoCritico } from '../sarjeta'

describe('calcularComprimentoCritico', () => {
  it('calcula d com todos os parâmetros unitários', () => {
    const d = calcularComprimentoCritico({
      y0M: 1,
      z: 1,
      declividadeLongitudinal: 1,
      coefC: 1,
      intensidadeMmH: 1,
      larguraImpluvioM: 1,
      manningN: 1,
    })
    expect(d).toBeCloseTo(1348920.8633093527, 3)
  })

  it('calcula d com parâmetros de via realistas', () => {
    const d = calcularComprimentoCritico({
      y0M: 0.13,
      z: 24,
      declividadeLongitudinal: 0.02,
      coefC: 0.9,
      intensidadeMmH: 80,
      larguraImpluvioM: 10,
      manningN: 0.016,
    })
    expect(d).toBeCloseTo(1723.623890636453, 6)
  })

  it('é diretamente proporcional a Z', () => {
    const base = calcularComprimentoCritico({
      y0M: 0.13,
      z: 24,
      declividadeLongitudinal: 0.02,
      coefC: 0.9,
      intensidadeMmH: 80,
      larguraImpluvioM: 10,
      manningN: 0.016,
    })
    const dobroZ = calcularComprimentoCritico({
      y0M: 0.13,
      z: 48,
      declividadeLongitudinal: 0.02,
      coefC: 0.9,
      intensidadeMmH: 80,
      larguraImpluvioM: 10,
      manningN: 0.016,
    })
    expect(dobroZ).toBeCloseTo(base * 2, 6)
  })
})
