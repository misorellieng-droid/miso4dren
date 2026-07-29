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
