/**
 * Divide 100% em N partes iguais (2 casas decimais), jogando o resto do
 * arredondamento na última parte pra garantir que a soma bate exatamente em
 * 100 — a trigger do banco (bacia_dispositivo) rejeita qualquer soma que
 * ultrapasse 100% mesmo por erro de ponto flutuante (ex.: 33.333... × 3).
 */
export function dividirPercentualIgualmente(n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor((100 / n) * 100) / 100
  const partes = new Array(n).fill(base)
  const resto = Math.round((100 - base * n) * 100) / 100
  partes[n - 1] = Math.round((partes[n - 1] + resto) * 100) / 100
  return partes
}

/** Tolerância (em pontos percentuais) para dizer que a soma da captação de uma bacia "fechou" em 100%: soma em ponto flutuante raramente dá 100 exato. */
export const TOLERANCIA_SOMA_PERCENTUAL = 0.01

/**
 * Situação da soma dos percentuais de captação de uma bacia: 'fechou' (100%, dentro da tolerância), 'acima' (passa de 100) ou
 * 'abaixo' (falta vazão sem dispositivo, a ser declarada). Compara com tolerância: 99,99999999999997 conta como 100.
 */
export function situacaoDaSoma(soma: number): 'fechou' | 'acima' | 'abaixo' {
  if (soma > 100 + TOLERANCIA_SOMA_PERCENTUAL) return 'acima'
  if (soma < 100 - TOLERANCIA_SOMA_PERCENTUAL) return 'abaixo'
  return 'fechou'
}
