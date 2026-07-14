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

/**
 * Comprimento crítico quando a declividade longitudinal não é um valor
 * fixo, mas decorre de um desnível fixo dividido pelo próprio comprimento
 * (declividade = desnível / d) — caso do sarjetão em "dente de serra" feito
 * variando a declividade transversal ao longo do comprimento (via sem
 * declividade longitudinal: a borda superior da calha fica sempre no
 * mesmo nível, só a profundidade no centro varia entre um mínimo, no ponto
 * alto, e um máximo, no ponto baixo/caixa — o desnível é essa diferença).
 *
 * Como a declividade depende de d, e Q (logo d) depende da declividade,
 * a equação de comprimento crítico fica com d nos dois lados:
 *   d = A·V/(K·C·i·L), V = (1/n)·Rh^(2/3)·√(desnível/d)
 * Rearranjando (sem iteração):
 *   d^(3/2) = A·Rh^(2/3)·√desnível / (n·K·C·i·L)
 *
 * `areaMolhadaM2` e `raioHidraulicoM` devem ser os da seção no ponto baixo
 * (declividade transversal máxima) — é a condição crítica de projeto.
 */
export function calcularComprimentoCriticoComDesnivelFixo(
  areaMolhadaM2: number,
  raioHidraulicoM: number,
  manningN: number,
  desnivelM: number,
  coefC: number,
  intensidadeMmH: number,
  larguraImpluvioM: number
): number {
  const base =
    (areaMolhadaM2 * Math.pow(raioHidraulicoM, 2 / 3) * Math.sqrt(desnivelM)) /
    (manningN * RATIONAL_METHOD_K * coefC * intensidadeMmH * larguraImpluvioM)
  return Math.pow(base, 2 / 3)
}
