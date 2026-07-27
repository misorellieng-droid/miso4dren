import { describe, expect, it } from 'vitest'
import { calcularCapacidadeHec22, calcularCapacidadeManningGenerica } from '../capacidade'
import { calcularGeometriaCompostaSarjetao } from '../espraiamento'

// Caso A (espraiamento avança pra pista): y_max=4,5cm, calha de 0,45m a 2%, pista a 1%.
const PARAMS = {
  yMaxM: 0.045,
  larguraSarjetaoEfetivaM: 0.45,
  sxSarjetao: 0.02,
  sxPista: 0.01,
  manningN: 0.016,
  declividadeLongitudinalMM: 0.0045,
  numeroFaces: 1 as const,
}
const PARAMS_2_FACES = { ...PARAMS, numeroFaces: 2 as const }

describe('calcularCapacidadeManningGenerica (Método 1)', () => {
  it('usa a área REAL composta (calha + via) e P=2T — não T·y_max de um plano só', () => {
    const geometria = calcularGeometriaCompostaSarjetao(PARAMS)
    const r = calcularCapacidadeManningGenerica(PARAMS)

    expect(r.areaMolhadaM2).toBeCloseTo(geometria.areaMolhadaM2, 12)
    expect(r.raioHidraulicoM).toBeCloseTo(geometria.areaMolhadaM2 / (2 * geometria.larguraEspraiamentoM), 12)

    const vazaoEsperada = (1 / PARAMS.manningN) * r.areaMolhadaM2 * Math.pow(r.raioHidraulicoM, 2 / 3) * Math.sqrt(PARAMS.declividadeLongitudinalMM)
    expect(r.vazaoCapacidadeM3s).toBeCloseTo(vazaoEsperada, 12)
    expect(r.velocidadeMs).toBeCloseTo(r.vazaoCapacidadeM3s / r.areaMolhadaM2, 12)
  })
})

describe('calcularCapacidadeHec22 (Método 2)', () => {
  it('usa área E perímetro reais (comprimento de arco) da geometria composta — Manning direto, sem fórmula fechada', () => {
    const geometria = calcularGeometriaCompostaSarjetao(PARAMS)
    const r = calcularCapacidadeHec22(PARAMS)

    expect(r.areaMolhadaM2).toBeCloseTo(geometria.areaMolhadaM2, 12)
    expect(r.raioHidraulicoM).toBeCloseTo(geometria.raioHidraulicoM, 12)

    const vazaoEsperada = (1 / PARAMS.manningN) * r.areaMolhadaM2 * Math.pow(r.raioHidraulicoM, 2 / 3) * Math.sqrt(PARAMS.declividadeLongitudinalMM)
    expect(r.vazaoCapacidadeM3s).toBeCloseTo(vazaoEsperada, 12)
  })

  it('difere do Método 1 só pelo perímetro (2T aproximado vs. arco real) — mesma área nos dois', () => {
    const m1 = calcularCapacidadeManningGenerica(PARAMS)
    const m2 = calcularCapacidadeHec22(PARAMS)
    expect(m1.areaMolhadaM2).toBeCloseTo(m2.areaMolhadaM2, 12)
    expect(m1.raioHidraulicoM).not.toBeCloseTo(m2.raioHidraulicoM, 6)
  })
})

describe('numeroFaces — seção simétrica soma a ÁREA das duas faces espelhadas, não computa só uma', () => {
  it('Método 1: área dobra com numeroFaces=2, mas o perímetro (2T) NÃO dobra — T já é medido a partir do eixo, então 2T já é a largura total do retângulo equivalente', () => {
    const umaFace = calcularCapacidadeManningGenerica(PARAMS)
    const duasFaces = calcularCapacidadeManningGenerica(PARAMS_2_FACES)
    expect(duasFaces.areaMolhadaM2).toBeCloseTo(umaFace.areaMolhadaM2 * 2, 12)
    expect(duasFaces.raioHidraulicoM).toBeCloseTo(umaFace.raioHidraulicoM * 2, 12) // P igual, A dobra -> Rh dobra
    // Q = (1/n)*A*Rh^(2/3)*sqrt(SL): A dobra e Rh dobra -> Q escala por 2 * 2^(2/3) = 2^(5/3)
    expect(duasFaces.vazaoCapacidadeM3s).toBeCloseTo(umaFace.vazaoCapacidadeM3s * Math.pow(2, 5 / 3), 9)
  })

  it('Método 2: área E perímetro reais dobram com numeroFaces=2 (duas faces físicas de verdade) — Rh fica igual, vazão dobra', () => {
    const umaFace = calcularCapacidadeHec22(PARAMS)
    const duasFaces = calcularCapacidadeHec22(PARAMS_2_FACES)
    expect(duasFaces.areaMolhadaM2).toBeCloseTo(umaFace.areaMolhadaM2 * 2, 12)
    expect(duasFaces.raioHidraulicoM).toBeCloseTo(umaFace.raioHidraulicoM, 12)
    expect(duasFaces.vazaoCapacidadeM3s).toBeCloseTo(umaFace.vazaoCapacidadeM3s * 2, 9)
  })
})
