import { describe, expect, it } from 'vitest'
import { calcularGeometriaTriangular } from '../geometrias/triangular'

describe('calcularGeometriaTriangular', () => {
  it('caso A — espraiamento avança sobre a via (Sw > Sx)', () => {
    const g = calcularGeometriaTriangular({
      tipo: 'triangular',
      y0M: 0.13,
      larguraSarjetaM: 0.5,
      declividadeTransversalViaMM: 0.02,
      declividadeTransversalSarjetaMM: 0.06,
    })
    expect(g.areaMolhadaM2).toBeCloseTo(0.30750000000000005, 9)
    expect(g.perimetroMolhadoM).toBeCloseTo(5.501899091474723, 9)
    expect(g.raioHidraulicoM).toBeCloseTo(0.05588979275837248, 9)
  })

  it('caso B — espraiamento contido na largura da sarjeta (sarjeta funda o suficiente)', () => {
    const g = calcularGeometriaTriangular({
      tipo: 'triangular',
      y0M: 0.13,
      larguraSarjetaM: 5,
      declividadeTransversalViaMM: 0.02,
      declividadeTransversalSarjetaMM: 0.5,
    })
    expect(g.areaMolhadaM2).toBeCloseTo(0.016900000000000002, 9)
    expect(g.perimetroMolhadoM).toBeCloseTo(0.2906888370749727, 9)
    expect(g.raioHidraulicoM).toBeCloseTo(0.05813776741499454, 9)
  })

  it('degenera na sarjeta triangular simples quando Sw = Sx (área = Y0²/(2·Sx))', () => {
    const y0 = 0.13
    const sx = 0.02
    const g = calcularGeometriaTriangular({
      tipo: 'triangular',
      y0M: y0,
      larguraSarjetaM: 0.5,
      declividadeTransversalViaMM: sx,
      declividadeTransversalSarjetaMM: sx,
    })
    expect(g.areaMolhadaM2).toBeCloseTo((y0 * y0) / (2 * sx), 9)
  })

  it('rejeita parâmetros não positivos', () => {
    expect(() =>
      calcularGeometriaTriangular({
        tipo: 'triangular',
        y0M: 0,
        larguraSarjetaM: 0.5,
        declividadeTransversalViaMM: 0.02,
        declividadeTransversalSarjetaMM: 0.06,
      })
    ).toThrow()
    expect(() =>
      calcularGeometriaTriangular({
        tipo: 'triangular',
        y0M: 0.13,
        larguraSarjetaM: 0.5,
        declividadeTransversalViaMM: 0,
        declividadeTransversalSarjetaMM: 0.06,
      })
    ).toThrow()
  })
})
