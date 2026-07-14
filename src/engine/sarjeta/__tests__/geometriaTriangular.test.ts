import { describe, expect, it } from 'vitest'
import { calcularGeometriaTriangular, pontosPerfilTriangular } from '../geometrias/triangular'

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

describe('pontosPerfilTriangular', () => {
  it('caso A — três pontos: meio-fio, borda da sarjeta, borda do espraiamento sobre a via', () => {
    const pontos = pontosPerfilTriangular({
      tipo: 'triangular',
      y0M: 0.13,
      larguraSarjetaM: 0.5,
      declividadeTransversalViaMM: 0.02,
      declividadeTransversalSarjetaMM: 0.06,
    })
    expect(pontos).toHaveLength(3)
    expect(pontos[0]).toEqual({ x: 0, y: 0.13 })
    expect(pontos[1].x).toBeCloseTo(0.5, 9)
    expect(pontos[1].y).toBeCloseTo(0.1, 9)
    expect(pontos[2].x).toBeCloseTo(5.5, 9)
    expect(pontos[2].y).toBeCloseTo(0, 9)
  })

  it('caso B — dois pontos: meio-fio e borda do espraiamento, contido na sarjeta', () => {
    const pontos = pontosPerfilTriangular({
      tipo: 'triangular',
      y0M: 0.13,
      larguraSarjetaM: 5,
      declividadeTransversalViaMM: 0.02,
      declividadeTransversalSarjetaMM: 0.5,
    })
    expect(pontos).toHaveLength(2)
    expect(pontos[0]).toEqual({ x: 0, y: 0.13 })
    expect(pontos[1].x).toBeCloseTo(0.26, 9)
    expect(pontos[1].y).toBeCloseTo(0, 9)
  })

  it('a área sob a polilinha bate com calcularGeometriaTriangular (integração trapezoidal)', () => {
    const params = {
      tipo: 'triangular' as const,
      y0M: 0.13,
      larguraSarjetaM: 0.5,
      declividadeTransversalViaMM: 0.02,
      declividadeTransversalSarjetaMM: 0.06,
    }
    const pontos = pontosPerfilTriangular(params)
    let area = 0
    for (let i = 0; i < pontos.length - 1; i++) {
      const a = pontos[i]
      const b = pontos[i + 1]
      area += ((a.y + b.y) / 2) * (b.x - a.x)
    }
    const geometria = calcularGeometriaTriangular(params)
    expect(area).toBeCloseTo(geometria.areaMolhadaM2, 9)
  })
})
