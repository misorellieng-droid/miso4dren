import { RATIONAL_METHOD_K } from '../constants'

/**
 * Comprimento crítico de sarjeta (m) → espaçamento máximo entre bocas de
 * lobo: a distância de via necessária para que a bacia de contribuição
 * (comprimento crítico × largura do impluvio) gere, pelo método racional, a
 * mesma vazão que a sarjeta já consegue escoar (Q, calculada via Manning).
 *
 * d = Q / (K · C · i · L), onde K é a constante do método racional
 * (Q_m3s = K · C · i_mmh · área_m2) — a mesma usada em rede.ts, pra manter
 * as duas pontas do app com a mesma conversão de unidades.
 */
export function calcularComprimentoCritico(
  vazaoM3s: number,
  coefC: number,
  intensidadeMmH: number,
  larguraImpluvioM: number
): number {
  return vazaoM3s / (RATIONAL_METHOD_K * coefC * intensidadeMmH * larguraImpluvioM)
}
