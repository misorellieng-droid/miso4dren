import { describe, expect, it } from 'vitest'
import { dividirPercentualIgualmente } from '../percentual'

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
