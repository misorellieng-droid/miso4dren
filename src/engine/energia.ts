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
  diametroM: number
}

export interface CotaPorEnergia {
  cotaFundoMontante: number
  cotaFundoJusante: number
}

const TOLERANCIA_DIAMETRO_ENERGIA_M = 0.001

/**
 * Percorre a rede em ordem de fluxo (Kahn) calculando a cota de fundo de cada trecho:
 * - Cabeceira (sem trecho de entrada na caixa montante): preserva a cota de fundo montante
 *   ATUAL do próprio trecho (âncora de projeto — não inventa uma cota nova do nada).
 * - Sem mudança de diâmetro entre entrada(s) e saída: o cálculo de energia NÃO entra em jogo
 *   — é só continuação simples da cota de fundo (degrau zero), usando a mais restritiva
 *   (menor) cota de fundo jusante entre as entradas quando há mais de uma, pra não afogar
 *   nenhum ramo. O ajuste por EGL só faz sentido pra resolver a transição de diâmetro —
 *   aplicá-lo sempre introduziria ruído (a lâmina/velocidade variam um pouco de trecho a
 *   trecho só pela vazão acumulada, mesmo sem trocar de diâmetro).
 * - Com mudança de diâmetro (pelo menos uma entrada com diâmetro diferente do da saída): usa
 *   a linha de energia (EGL — cota de fundo + lâmina + carga cinética V²/2g) pra calcular a
 *   cota de fundo montante da saída. Quando há mais de uma entrada, usa a entrada de MENOR
 *   energia (menor EGL) como referência pro cálculo — é o ramo que "sobra" menos energia,
 *   então é o que rege a transição.
 * - Nunca deixa a cota subir acima da cota de fundo jusante da entrada usada como referência:
 *   mesmo que a conservação de energia "peça" um degrau pra cima (quando a saída tem menos
 *   carga cinética que a entrada), isso deixaria água represada na caixa até encher até a
 *   nova cota em vez de escoar — fisicamente indesejável numa rede de drenagem. Nesse caso o
 *   ganho de energia é ignorado e a cota só continua a da entrada (degrau zero).
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
    const entradas = (entradasPorCaixa.get(caixaId) ?? []).filter((e) => cotaFundoJusantePorTrecho.has(e.id))

    let cotaFundoMontante: number
    if (entradas.length === 0) {
      cotaFundoMontante = cotaFundoMontanteAtualPorTrecho.get(saida.id) ?? 0
    } else {
      const houveMudancaDiametro = entradas.some((e) => Math.abs(e.diametroM - saida.diametroM) > TOLERANCIA_DIAMETRO_ENERGIA_M)

      if (!houveMudancaDiametro) {
        cotaFundoMontante = Math.min(...entradas.map((e) => cotaFundoJusantePorTrecho.get(e.id)!))
      } else {
        let entradaMenorEnergia = entradas[0]
        let menorEgl = Infinity
        for (const e of entradas) {
          const cotaJusanteE = cotaFundoJusantePorTrecho.get(e.id)!
          const egl = calcularLinhaEnergia(cotaJusanteE, laminaPorTrecho.get(e.id) ?? 0, velocidadePorTrecho.get(e.id) ?? 0)
          if (egl < menorEgl) {
            menorEgl = egl
            entradaMenorEnergia = e
          }
        }
        const cotaJusanteEscolhida = cotaFundoJusantePorTrecho.get(entradaMenorEnergia.id)!
        const candidatoEnergia = calcularCotaMontantePorEnergia(
          cotaJusanteEscolhida,
          laminaPorTrecho.get(entradaMenorEnergia.id) ?? 0,
          velocidadePorTrecho.get(entradaMenorEnergia.id) ?? 0,
          laminaSaida,
          velocidadeSaida
        )
        cotaFundoMontante = Math.min(candidatoEnergia, cotaJusanteEscolhida)
      }
    }

    const cotaFundoJusante = cotaFundoMontante - saida.declividadeMM * saida.comprimentoM
    resultado.set(saida.id, { cotaFundoMontante, cotaFundoJusante })
    cotaFundoJusantePorTrecho.set(saida.id, cotaFundoJusante)
  }

  return resultado
}
