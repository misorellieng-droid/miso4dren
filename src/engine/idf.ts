import type { EquacaoIdf } from './types'

/**
 * Intensidade de chuva de projeto (mm/h), equação IDF: i = k × Tr^a / (b + Tc)^c
 */
export function calcularIntensidadeIdf(equacao: EquacaoIdf, tempoRetornoAnos: number, tcMin: number): number {
  const { k, a, b, c } = equacao
  return (k * Math.pow(tempoRetornoAnos, a)) / Math.pow(b + tcMin, c)
}
