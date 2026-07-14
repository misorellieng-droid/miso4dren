import type { ResultadoCapacidade } from './types'

/**
 * Método 1 — Manning genérico, seção retangular equivalente:
 * A = T·y_max, P ≈ 2T (y_max ≪ T), Rh = A/P, Q = (1/n)·A·Rh^(2/3)·SL^(1/2).
 */
export interface CapacidadeManningGenericaParams {
  larguraEspraiamentoM: number // T
  laminaMaxM: number // y_max
  manningN: number
  declividadeLongitudinalMM: number // SL, derivada de Δh/L
}

export function calcularCapacidadeManningGenerica(params: CapacidadeManningGenericaParams): ResultadoCapacidade {
  const { larguraEspraiamentoM: T, laminaMaxM: y, manningN, declividadeLongitudinalMM: SL } = params
  const areaMolhadaM2 = T * y
  const perimetroMolhadoM = 2 * T
  const raioHidraulicoM = areaMolhadaM2 / perimetroMolhadoM
  const vazaoCapacidadeM3s = (1 / manningN) * areaMolhadaM2 * Math.pow(raioHidraulicoM, 2 / 3) * Math.sqrt(SL)
  return { areaMolhadaM2, raioHidraulicoM, velocidadeMs: vazaoCapacidadeM3s / areaMolhadaM2, vazaoCapacidadeM3s }
}

/**
 * Método 2 — HEC-22/FHWA, seção triangular integrada:
 * Q = (0,375/n)·Sx^(5/3)·SL^(1/2)·T^(8/3).
 *
 * Atenção: o Sx aqui é o da PISTA fora do sarjetão (retroanalisado de
 * y_max/T), não o Sx do próprio sarjetão — são geometrias diferentes (ver
 * types.ts). A fórmula é fechada e não decompõe em área/perímetro/Rh; pra
 * reportar lâmina/velocidade de forma comparável ao Método 1 (e alimentar o
 * mesmo loop de tempo de percurso), usa-se a área triangular equivalente
 * T·y_max/2 só pra essa finalidade — não entra no cálculo de Q em si.
 */
export interface CapacidadeHec22Params {
  sxPista: number
  larguraEspraiamentoM: number // T
  laminaMaxM: number // y_max, só pra estimar a área triangular equivalente
  manningN: number
  declividadeLongitudinalMM: number // SL
}

export function calcularCapacidadeHec22(params: CapacidadeHec22Params): ResultadoCapacidade {
  const { sxPista, larguraEspraiamentoM: T, laminaMaxM: y, manningN, declividadeLongitudinalMM: SL } = params
  const vazaoCapacidadeM3s = (0.375 / manningN) * Math.pow(sxPista, 5 / 3) * Math.sqrt(SL) * Math.pow(T, 8 / 3)
  const areaMolhadaM2 = (T * y) / 2
  return { areaMolhadaM2, raioHidraulicoM: null, velocidadeMs: vazaoCapacidadeM3s / areaMolhadaM2, vazaoCapacidadeM3s }
}
