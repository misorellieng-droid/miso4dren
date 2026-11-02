import { describe, expect, it } from 'vitest'
import {
  calcularVazaoCapacidadeEscadaM3s,
  dimensionarDegraus,
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
  it('conforme quando largura ≥ mínimo, altura entre 30 e 100cm, e vazão de capacidade ≥ vazão de projeto', () => {
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

  it('acusa altura de fluxo fora da faixa 30-100cm', () => {
    expect(verificarEscadaHidraulica(0.8, 0.2, 0.05, null).alturaForaDaFaixa).toBe(true)
    expect(verificarEscadaHidraulica(0.8, 1.1, 0.05, null).alturaForaDaFaixa).toBe(true)
    expect(verificarEscadaHidraulica(0.8, 0.45, 0.05, null).alturaForaDaFaixa).toBe(false)
    expect(verificarEscadaHidraulica(0.8, 1.0, 0.05, null).alturaForaDaFaixa).toBe(false)
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

describe('dimensionarDegraus', () => {
  it('uma face: degraus = desnível / espelho, piso necessário e patamar que sobra', () => {
    const r = dimensionarDegraus({ espelhoM: 0.2, degrauM: 0.4, faces: [{ comprimentoM: 9, desnivelM: 6 }] })
    expect(r.degrausTotal).toBe(30)
    expect(r.faces[0].comprimentoNecessarioM).toBeCloseTo(12, 6)
    expect(r.cabe).toBe(false) // 30 degraus x 0,40 = 12 m > 9 m
    expect(r.faces[0].folgaM).toBeCloseTo(-3, 6)
    expect(r.avisos[0]).toMatch(/não cabe/)
    expect(r.avisos[0]).toMatch(/0\.30 m/) // degrau máximo 9 / 30
  })

  it('face que cabe deixa a sobra como patamar, somada às bermas', () => {
    const r = dimensionarDegraus({ espelhoM: 0.2, degrauM: 0.3, faces: [{ comprimentoM: 12, desnivelM: 3 }], bermasM: [] })
    expect(r.degrausTotal).toBe(15)
    expect(r.cabe).toBe(true)
    expect(r.faces[0].folgaM).toBeCloseTo(12 - 4.5, 6)
    expect(r.patamarTotalM).toBeCloseTo(7.5, 6)
  })

  it('várias faces: reparte os degraus pelo desnível (soma fecha) e soma as bermas no patamar', () => {
    const r = dimensionarDegraus({
      espelhoM: 0.2,
      degrauM: 0.3,
      faces: [{ comprimentoM: 10, desnivelM: 4 }, { comprimentoM: 5, desnivelM: 2 }],
      bermasM: [3],
    })
    expect(r.degrausTotal).toBe(30)
    expect(r.faces.map((f) => f.degraus)).toEqual([20, 10])
    expect(r.faces.reduce((a, f) => a + f.degraus, 0)).toBe(r.degrausTotal)
    expect(r.bermasM).toEqual([3])
    expect(r.patamarTotalM).toBeCloseTo(3 + (10 - 6) + (5 - 3), 6)
  })

  it('a soma dos degraus sempre fecha mesmo com restos desiguais', () => {
    const r = dimensionarDegraus({
      espelhoM: 0.2,
      degrauM: 0.2,
      faces: [{ comprimentoM: 20, desnivelM: 1.1 }, { comprimentoM: 20, desnivelM: 1.1 }, { comprimentoM: 20, desnivelM: 1.1 }],
    })
    expect(r.faces.reduce((a, f) => a + f.degraus, 0)).toBe(r.degrausTotal)
  })

  it('espelho real difere do nominal quando o desnível não é múltiplo: avisa acima de 10%', () => {
    const r = dimensionarDegraus({ espelhoM: 0.2, degrauM: 0.3, faces: [{ comprimentoM: 30, desnivelM: 0.9 }] })
    expect(r.degrausTotal).toBe(5) // 0,9 / 0,2 = 4,5 -> 5
    expect(r.espelhoRealMedioM).toBeCloseTo(0.18, 6)
    expect(r.avisos.some((a) => /espelho real/i.test(a))).toBe(false) // 10% exato não passa de 10%
  })

  it('entradas inválidas ou sem face não geram degraus', () => {
    expect(dimensionarDegraus({ espelhoM: 0, degrauM: 0.3, faces: [{ comprimentoM: 5, desnivelM: 1 }] }).degrausTotal).toBe(0)
    expect(dimensionarDegraus({ espelhoM: 0.2, degrauM: 0.3, faces: [] }).cabe).toBe(false)
  })
})
