export const LARGURA_MINIMA_ESCADA_M = 0.6
export const ALTURA_FLUXO_MINIMA_M = 0.3
export const ALTURA_FLUXO_MAXIMA_M = 0.6

/**
 * Vazão de capacidade de uma escada hidráulica (dissipador em degraus), fórmula empírica
 * fornecida pelo engenheiro: Q = 2,07 × B^0,90 × H^1,60, com B (largura útil) e H (altura do
 * fluxo) em metros e Q em m³/s. Não é a hidráulica de Manning de um tubo circular -- a escada é
 * um degrau em queda livre/ressalto, fenômeno físico diferente, por isso fica fora do solver e
 * da checagem de conformidade "de tubo" (ver executarCalculoRede em RedePluvialPage.tsx).
 */
export function calcularVazaoCapacidadeEscadaM3s(larguraM: number, alturaFluxoM: number): number {
  return 2.07 * Math.pow(larguraM, 0.9) * Math.pow(alturaFluxoM, 1.6)
}

/**
 * Largura útil mínima admissível pra escada: 600 mm, ou o diâmetro EXTERNO do tubo de chegada
 * (o que for maior) -- a escada não pode ser mais estreita que o tubo que desemboca nela.
 */
export function larguraMinimaEscadaM(diametroExternoTuboChegadaM: number | null): number {
  return Math.max(LARGURA_MINIMA_ESCADA_M, diametroExternoTuboChegadaM ?? 0)
}

export interface VerificacaoEscadaHidraulica {
  vazaoCapacidadeM3s: number
  larguraMinimaM: number
  /** true quando B está abaixo do mínimo admissível (600mm ou diâmetro externo do tubo de chegada). */
  larguraAbaixoDoMinimo: boolean
  /** true quando H está fora da faixa 30–60 cm adotada pro dimensionamento. */
  alturaForaDaFaixa: boolean
  /** true quando a vazão de capacidade não atende a vazão de projeto que chega na escada. */
  vazaoInsuficiente: boolean
  conforme: boolean
}

/**
 * Verifica se uma escada dimensionada (B, H) atende a vazão de projeto que chega nela, dentro
 * dos limites adotados (B ≥ mínimo admissível, H entre 30 e 60 cm).
 */
export function verificarEscadaHidraulica(
  larguraM: number,
  alturaFluxoM: number,
  vazaoProjetoM3s: number,
  diametroExternoTuboChegadaM: number | null
): VerificacaoEscadaHidraulica {
  const larguraMinimaM = larguraMinimaEscadaM(diametroExternoTuboChegadaM)
  const larguraAbaixoDoMinimo = larguraM < larguraMinimaM
  const alturaForaDaFaixa = alturaFluxoM < ALTURA_FLUXO_MINIMA_M || alturaFluxoM > ALTURA_FLUXO_MAXIMA_M
  const vazaoCapacidadeM3s = calcularVazaoCapacidadeEscadaM3s(larguraM, alturaFluxoM)
  const vazaoInsuficiente = vazaoCapacidadeM3s < vazaoProjetoM3s
  return {
    vazaoCapacidadeM3s,
    larguraMinimaM,
    larguraAbaixoDoMinimo,
    alturaForaDaFaixa,
    vazaoInsuficiente,
    conforme: !larguraAbaixoDoMinimo && !alturaForaDaFaixa && !vazaoInsuficiente,
  }
}
