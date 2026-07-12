import { describe, expect, it } from 'vitest'
import { calcularVazao, calcularVelocidade } from '../hidraulica'

describe('calcularVelocidade', () => {
  it('aplica Manning: V = (1/n) · Rh^(2/3) · √I', () => {
    const v = calcularVelocidade(0.05588979275837248, 0.016, 0.02)
    expect(v).toBeCloseTo(1.2920619824024049, 9)
  })

  it('com valores unitários retorna 1', () => {
    expect(calcularVelocidade(1, 1, 1)).toBeCloseTo(1, 12)
  })
})

describe('calcularVazao', () => {
  it('Q = A · V', () => {
    expect(calcularVazao(0.30750000000000005, 1.2920619824024049)).toBeCloseTo(0.3973090595887396, 9)
  })
})
