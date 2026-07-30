import { ordenarTopologicamente, type ArestaGrafo } from './rede'

const G = 9.81 // aceleração da gravidade (m/s²)

/** Linha de energia (EGL) num ponto do trecho: cota de fundo + lâmina + carga cinética V²/2g. */
export function calcularLinhaEnergia(cotaFundoM: number, laminaM: number, velocidadeMs: number): number {
  return cotaFundoM + laminaM + (velocidadeMs * velocidadeMs) / (2 * G)
}

/**
 * Cota de fundo montante do trecho JUSANTE que alinha a linha de energia (EGL — cota de
 * fundo + lâmina + carga cinética V²/2g) com a saída do trecho MONTANTE, em vez de só
 * continuar a cota de fundo diretamente (degrau zero). Necessário sempre que a lâmina ou
 * a velocidade mudam de um trecho pro outro (tipicamente quando o diâmetro muda numa
 * confluência) — sem isso, a energia "sobra" ou "falta" na transição, description que não
 * reflete o comportamento hidráulico real do escoamento (ressalto, afogamento etc.).
 */
export function calcularCotaMontantePorEnergia(
  cotaFundoJusanteMontante: number,
  laminaMontanteM: number,
  velocidadeMontanteMs: number,
  laminaJusanteM: number,
  velocidadeJusanteMs: number
): number {
  const eglMontante = cotaFundoJusanteMontante + laminaMontanteM + (velocidadeMontanteMs * velocidadeMontanteMs) / (2 * G)
  return eglMontante - laminaJusanteM - (velocidadeJusanteMs * velocidadeJusanteMs) / (2 * G)
}

export interface TrechoEnergia extends ArestaGrafo {
  comprimentoM: number
  declividadeMM: number
}

export interface CotaPorEnergia {
  cotaFundoMontante: number
  cotaFundoJusante: number
}

/**
 * Percorre a rede em ordem de fluxo (Kahn) calculando a cota de fundo de cada trecho pela
 * linha de energia, em vez de simplesmente continuar a cota do trecho anterior:
 * - Cabeceira (sem trecho de entrada na caixa montante): preserva a cota de fundo montante
 *   ATUAL do próprio trecho (âncora de projeto — não inventa uma cota nova do nada).
 * - Confluência (2+ trechos de entrada): calcula a cota exigida por CADA ramo que chega e
 *   usa a mais restritiva (menor) — garante que nenhum ramo de entrada fica afogado pela
 *   caixa, mesmo que isso dê um degrau maior que o estritamente necessário pro ramo
 *   dominante.
 * - Nunca deixa a cota subir acima da cota de fundo jusante de nenhum ramo que entra: mesmo
 *   que a conservação de energia "permita" (ou peça) um degrau pra cima quando o trecho de
 *   saída tem menos carga cinética que o de entrada, isso deixaria a água represada na caixa
 *   até encher até a nova cota em vez de escoar — fisicamente indesejável numa rede de
 *   drenagem. Nesse caso o ganho de energia é ignorado e a cota apenas continua a do ramo de
 *   entrada (degrau zero pra aquele ramo).
 * Assume no máximo 1 trecho de saída por caixa (topologia normal de rede de drenagem —
 * bifurcação de vazão não é modelada).
 */
export function calcularCotasPorEnergia(
  caixaIds: string[],
  trechos: TrechoEnergia[],
  cotaFundoMontanteAtualPorTrecho: Map<string, number>,
  laminaPorTrecho: Map<string, number>,
  velocidadePorTrecho: Map<string, number>
): Map<string, CotaPorEnergia> {
  const ordem = ordenarTopologicamente(caixaIds, trechos)
  const entradasPorCaixa = new Map<string, TrechoEnergia[]>(caixaIds.map((id) => [id, []]))
  const saidaPorCaixa = new Map<string, TrechoEnergia>()
  for (const t of trechos) {
    entradasPorCaixa.get(t.jusanteId)?.push(t)
    saidaPorCaixa.set(t.montanteId, t)
  }

  const resultado = new Map<string, CotaPorEnergia>()
  const cotaFundoJusantePorTrecho = new Map<string, number>()

  for (const caixaId of ordem) {
    const saida = saidaPorCaixa.get(caixaId)
    if (!saida) continue // saída da rede — não há trecho a jusante pra calcular

    const laminaSaida = laminaPorTrecho.get(saida.id) ?? 0
    const velocidadeSaida = velocidadePorTrecho.get(saida.id) ?? 0
    const entradas = entradasPorCaixa.get(caixaId) ?? []

    let cotaFundoMontante: number
    if (entradas.length === 0) {
      cotaFundoMontante = cotaFundoMontanteAtualPorTrecho.get(saida.id) ?? 0
    } else {
      const candidatos: number[] = []
      for (const entrada of entradas) {
        const cotaFundoJusanteEntrada = cotaFundoJusantePorTrecho.get(entrada.id)
        if (cotaFundoJusanteEntrada == null) continue
        const candidatoEnergia = calcularCotaMontantePorEnergia(
          cotaFundoJusanteEntrada,
          laminaPorTrecho.get(entrada.id) ?? 0,
          velocidadePorTrecho.get(entrada.id) ?? 0,
          laminaSaida,
          velocidadeSaida
        )
        candidatos.push(Math.min(candidatoEnergia, cotaFundoJusanteEntrada))
      }
      cotaFundoMontante = candidatos.length > 0 ? Math.min(...candidatos) : (cotaFundoMontanteAtualPorTrecho.get(saida.id) ?? 0)
    }

    const cotaFundoJusante = cotaFundoMontante - saida.declividadeMM * saida.comprimentoM
    resultado.set(saida.id, { cotaFundoMontante, cotaFundoJusante })
    cotaFundoJusantePorTrecho.set(saida.id, cotaFundoJusante)
  }

  return resultado
}
