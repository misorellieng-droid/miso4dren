import { describe, expect, it } from 'vitest'
import { calcularIntensidadeIdf } from '../idf'

describe('calcularIntensidadeIdf', () => {
  it('aplica i = k × Tr^a / (b + Tc)^c com números redondos', () => {
    const i = calcularIntensidadeIdf({ k: 100, a: 1, b: 0, c: 1 }, 2, 3)
    expect(i).toBeCloseTo(66.66666666666667, 9)
  })

  it('calcula a intensidade para a equação de referência semeada (Tr=10, Tc=10)', () => {
    const i = calcularIntensidadeIdf({ k: 4003.518, a: 0.203, b: 49.996, c: 0.931 }, 10, 10)
    expect(i).toBeCloseTo(141.25698339276093, 6)
  })
})
