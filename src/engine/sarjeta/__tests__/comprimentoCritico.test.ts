import { describe, expect, it } from 'vitest'
import { calcularComprimentoCritico, calcularComprimentoCriticoComDesnivelFixo } from '../comprimentoCritico'

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

describe('calcularComprimentoCriticoComDesnivelFixo', () => {
  it('resolve d^(3/2) = A·Rh^(2/3)·√desnível / (n·K·C·i·L) — caso do sarjetão dente de serra (largura 0,90m, declividade 2% a 10%)', () => {
    const d = calcularComprimentoCriticoComDesnivelFixo(0.020250000000000004, 0.022388336779724762, 0.02, 0.036000000000000004, 0.9, 140, 20)
    expect(d).toBeCloseTo(7.7996838558205965, 6)
  })

  it('é autoconsistente: a declividade efetiva (desnível/d) reproduz exatamente a vazão usada no cálculo', () => {
    const area = 0.020250000000000004
    const rh = 0.022388336779724762
    const n = 0.02
    const desnivel = 0.036
    const c = 0.9
    const i = 140
    const l = 20
    const d = calcularComprimentoCriticoComDesnivelFixo(area, rh, n, desnivel, c, i, l)

    const declividadeEfetiva = desnivel / d
    const velocidade = (1 / n) * Math.pow(rh, 2 / 3) * Math.sqrt(declividadeEfetiva)
    const vazao = area * velocidade
    const dReconstruido = calcularComprimentoCritico(vazao, c, i, l)

    expect(dReconstruido).toBeCloseTo(d, 6)
  })
})
