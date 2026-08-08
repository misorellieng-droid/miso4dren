import { describe, expect, it } from 'vitest'
import {
  calcularVazaoCapacidadeEscadaM3s,
  larguraMinimaEscadaM,
  verificarEscadaHidraulica,
} from '../escadaHidraulica'

describe('calcularVazaoCapacidadeEscadaM3s', () => {
  it('aplica Q = 2,07 x B^0,90 x H^1,60', () => {
    const B = 0.8
    const H = 0.45
    const esperado = 2.07 * Math.pow(B, 0.9) * Math.pow(H, 1.6)
    expect(calcularVazaoCapacidadeEscadaM3s(B, H)).toBeCloseTo(esperado, 8)
  })

  it('vazão cresce com B e com H (monotônico)', () => {
    const base = calcularVazaoCapacidadeEscadaM3s(0.6, 0.3)
    expect(calcularVazaoCapacidadeEscadaM3s(0.8, 0.3)).toBeGreaterThan(base)
    expect(calcularVazaoCapacidadeEscadaM3s(0.6, 0.5)).toBeGreaterThan(base)
  })
})

describe('larguraMinimaEscadaM', () => {
  it('usa 600mm quando o tubo de chegada é menor (ou não informado)', () => {
    expect(larguraMinimaEscadaM(0.4)).toBeCloseTo(0.6)
    expect(larguraMinimaEscadaM(null)).toBeCloseTo(0.6)
  })

  it('usa o diâmetro externo do tubo de chegada quando maior que 600mm', () => {
    expect(larguraMinimaEscadaM(0.8)).toBeCloseTo(0.8)
  })
})

describe('verificarEscadaHidraulica', () => {
  it('conforme quando largura ≥ mínimo, altura entre 30 e 60cm, e vazão de capacidade ≥ vazão de projeto', () => {
    const B = 0.8
    const H = 0.5
    const vazaoProjeto = calcularVazaoCapacidadeEscadaM3s(B, H) * 0.8 // deixa margem
    const r = verificarEscadaHidraulica(B, H, vazaoProjeto, 0.6)
    expect(r.conforme).toBe(true)
    expect(r.larguraAbaixoDoMinimo).toBe(false)
    expect(r.alturaForaDaFaixa).toBe(false)
    expect(r.vazaoInsuficiente).toBe(false)
  })

  it('acusa largura abaixo do mínimo admissível (tubo de chegada maior que 600mm)', () => {
    const r = verificarEscadaHidraulica(0.6, 0.45, 0.1, 0.8) // B=0.6 mas tubo de chegada é 0.8
    expect(r.larguraAbaixoDoMinimo).toBe(true)
    expect(r.larguraMinimaM).toBeCloseTo(0.8)
    expect(r.conforme).toBe(false)
  })

  it('acusa altura de fluxo fora da faixa 30-60cm', () => {
    expect(verificarEscadaHidraulica(0.8, 0.2, 0.05, null).alturaForaDaFaixa).toBe(true)
    expect(verificarEscadaHidraulica(0.8, 0.7, 0.05, null).alturaForaDaFaixa).toBe(true)
    expect(verificarEscadaHidraulica(0.8, 0.45, 0.05, null).alturaForaDaFaixa).toBe(false)
  })

  it('acusa vazão insuficiente quando a capacidade não atende a vazão de projeto', () => {
    const B = 0.6
    const H = 0.3
    const capacidade = calcularVazaoCapacidadeEscadaM3s(B, H)
    const r = verificarEscadaHidraulica(B, H, capacidade * 1.5, null) // projeto exige mais do que a escada dá
    expect(r.vazaoInsuficiente).toBe(true)
    expect(r.conforme).toBe(false)
  })
})
