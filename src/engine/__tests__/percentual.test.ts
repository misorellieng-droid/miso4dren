import { describe, expect, it } from 'vitest'
import { dividirPercentualIgualmente, situacaoDaSoma } from '../percentual'

describe('dividirPercentualIgualmente', () => {
  it('divide em partes iguais quando dá exato', () => {
    expect(dividirPercentualIgualmente(4)).toEqual([25, 25, 25, 25])
  })

  it('soma exatamente 100 mesmo quando não divide exato (dízima)', () => {
    const partes = dividirPercentualIgualmente(3)
    expect(partes.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 10)
    expect(partes[0]).toBe(33.33)
    expect(partes[2]).toBe(33.34) // resto vai pra última
  })

  it('soma exatamente 100 pra um número grande de partes (caso real: bacia com 7 candidatas)', () => {
    const partes = dividirPercentualIgualmente(7)
    const soma = partes.reduce((a, b) => a + b, 0)
    expect(Math.round(soma * 100) / 100).toBe(100)
  })

  it('retorna [100] pra n=1', () => {
    expect(dividirPercentualIgualmente(1)).toEqual([100])
  })

  it('retorna array vazio pra n=0', () => {
    expect(dividirPercentualIgualmente(0)).toEqual([])
  })
})

describe('situacaoDaSoma', () => {
  it('99,99999999999997 (resto de ponto flutuante) conta como 100% fechado', () => {
    expect(situacaoDaSoma(99.99999999999997)).toBe('fechou')
    expect(situacaoDaSoma(100)).toBe('fechou')
    expect(situacaoDaSoma(100.00000000000004)).toBe('fechou')
    // a soma real de 15 partes de 6,66 + resto, como no print
    const partes = Array.from({ length: 15 }, () => 100 / 15)
    expect(situacaoDaSoma(partes.reduce((a, b) => a + b, 0))).toBe('fechou')
  })

  it('abaixo e acima de verdade continuam sendo apontados', () => {
    expect(situacaoDaSoma(99.5)).toBe('abaixo')
    expect(situacaoDaSoma(0)).toBe('abaixo')
    expect(situacaoDaSoma(100.5)).toBe('acima')
  })
})
