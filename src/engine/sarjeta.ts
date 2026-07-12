export interface ComprimentoCriticoParams {
  y0M: number // altura d'água limite na sarjeta (m)
  z: number // recíproca da declividade transversal
  declividadeLongitudinal: number // m/m
  coefC: number // coeficiente de escoamento da bacia
  intensidadeMmH: number // intensidade de chuva de projeto (mm/h)
  larguraImpluvioM: number // largura do impluvio (m)
  manningN: number // rugosidade de Manning da sarjeta
}

/**
 * Comprimento crítico de sarjeta (m) → espaçamento entre bocas de lobo.
 * Fórmula fechada (sem iteração):
 * d = (0.375 × Y0^(8/3) × Z × √I) / (2.78×10⁻⁷ × C × i × L × n)
 */
export function calcularComprimentoCritico(params: ComprimentoCriticoParams): number {
  const { y0M, z, declividadeLongitudinal, coefC, intensidadeMmH, larguraImpluvioM, manningN } = params

  const numerador = 0.375 * Math.pow(y0M, 8 / 3) * z * Math.sqrt(declividadeLongitudinal)
  const denominador = 2.78e-7 * coefC * intensidadeMmH * larguraImpluvioM * manningN

  return numerador / denominador
}
