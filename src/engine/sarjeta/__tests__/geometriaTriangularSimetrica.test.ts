import { describe, expect, it } from 'vitest'
import { calcularGeometriaTriangularSimetrica } from '../geometrias/triangularSimetrica'
import { calcularGeometriaTriangular } from '../geometrias/triangular'

describe('calcularGeometriaTriangularSimetrica', () => {
  it('calcula área, perímetro e raio hidráulico do V simétrico', () => {
    const g = calcularGeometriaTriangularSimetrica({ tipo: 'triangular_simetrica', y0M: 0.15, declividadeTransversalMM: 0.02 })
    expect(g.areaMolhadaM2).toBeCloseTo(1.125, 9)
    expect(g.perimetroMolhadoM).toBeCloseTo(15.002999700059984, 6)
    expect(g.raioHidraulicoM).toBeCloseTo(0.07498500449850053, 9)
  })

  it('tem o mesmo raio hidráulico de um lado só (Rh não depende de quantos lados alimentam a calha)', () => {
    const simetrico = calcularGeometriaTriangularSimetrica({ tipo: 'triangular_simetrica', y0M: 0.15, declividadeTransversalMM: 0.02 })
    // largura bem maior que o espraiamento pra garantir o "caso B" (triângulo simples de um lado só) na função existente
    const umLado = calcularGeometriaTriangular({
      tipo: 'triangular',
      y0M: 0.15,
      larguraSarjetaM: 100,
      declividadeTransversalViaMM: 0.02,
      declividadeTransversalSarjetaMM: 0.02,
    })
    expect(simetrico.raioHidraulicoM).toBeCloseTo(umLado.raioHidraulicoM, 12)
    expect(simetrico.areaMolhadaM2).toBeCloseTo(umLado.areaMolhadaM2 * 2, 9)
    expect(simetrico.perimetroMolhadoM).toBeCloseTo(umLado.perimetroMolhadoM * 2, 9)
  })

  it('rejeita parâmetros não positivos', () => {
    expect(() => calcularGeometriaTriangularSimetrica({ tipo: 'triangular_simetrica', y0M: 0, declividadeTransversalMM: 0.02 })).toThrow()
    expect(() => calcularGeometriaTriangularSimetrica({ tipo: 'triangular_simetrica', y0M: 0.15, declividadeTransversalMM: 0 })).toThrow()
  })
})
