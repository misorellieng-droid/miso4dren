import { describe, expect, it } from 'vitest'
import { calcularComprimentoCritico } from '../comprimentoCritico'

describe('calcularComprimentoCritico', () => {
  it('d = Q / (K · C · i · L)', () => {
    const d = calcularComprimentoCritico(0.3973090595887396, 0.9, 80, 10)
    expect(d).toBeCloseTo(1984.9573320780353, 6)
  })

  it('é diretamente proporcional à vazão', () => {
    const base = calcularComprimentoCritico(0.1, 0.9, 80, 10)
    const dobro = calcularComprimentoCritico(0.2, 0.9, 80, 10)
    expect(dobro).toBeCloseTo(base * 2, 9)
  })

  it('é inversamente proporcional à largura do impluvio', () => {
    const base = calcularComprimentoCritico(0.1, 0.9, 80, 10)
    const dobroL = calcularComprimentoCritico(0.1, 0.9, 80, 20)
    expect(dobroL).toBeCloseTo(base / 2, 9)
  })
})
