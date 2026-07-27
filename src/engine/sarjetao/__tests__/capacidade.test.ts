import { describe, expect, it } from 'vitest'
import { calcularCapacidadeHec22 } from '../capacidade'
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

describe('calcularCapacidadeHec22 (único método)', () => {
  it('usa área E perímetro reais (comprimento de arco) da geometria composta — Manning direto, sem fórmula fechada', () => {
    const geometria = calcularGeometriaCompostaSarjetao(PARAMS)
    const r = calcularCapacidadeHec22(PARAMS)

    expect(r.areaMolhadaM2).toBeCloseTo(geometria.areaMolhadaM2, 12)
    expect(r.raioHidraulicoM).toBeCloseTo(geometria.raioHidraulicoM, 12)

    const vazaoEsperada = (1 / PARAMS.manningN) * r.areaMolhadaM2 * Math.pow(r.raioHidraulicoM, 2 / 3) * Math.sqrt(PARAMS.declividadeLongitudinalMM)
    expect(r.vazaoCapacidadeM3s).toBeCloseTo(vazaoEsperada, 12)
    expect(r.velocidadeMs).toBeCloseTo(r.vazaoCapacidadeM3s / r.areaMolhadaM2, 12)
  })

  it('numeroFaces=2 (simétrico): área E perímetro reais dobram (duas faces físicas de verdade) — Rh fica igual, vazão dobra', () => {
    const umaFace = calcularCapacidadeHec22(PARAMS)
    const duasFaces = calcularCapacidadeHec22(PARAMS_2_FACES)
    expect(duasFaces.areaMolhadaM2).toBeCloseTo(umaFace.areaMolhadaM2 * 2, 12)
    expect(duasFaces.raioHidraulicoM).toBeCloseTo(umaFace.raioHidraulicoM, 12)
    expect(duasFaces.vazaoCapacidadeM3s).toBeCloseTo(umaFace.vazaoCapacidadeM3s * 2, 9)
  })
})
