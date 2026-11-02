export const LARGURA_MINIMA_ESCADA_M = 0.6
export const ALTURA_FLUXO_MINIMA_M = 0.3
export const ALTURA_FLUXO_MAXIMA_M = 1.0

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
  /** true quando H está fora da faixa 30–100 cm adotada pro dimensionamento. */
  alturaForaDaFaixa: boolean
  /** true quando a vazão de capacidade não atende a vazão de projeto que chega na escada. */
  vazaoInsuficiente: boolean
  conforme: boolean
}

/**
 * Verifica se uma escada dimensionada (B, H) atende a vazão de projeto que chega nela, dentro
 * dos limites adotados (B ≥ mínimo admissível, H entre 30 e 100 cm).
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

/** Uma face de talude vista de lado: comprimento horizontal e desnível (queda vertical) dela, em metros. */
export interface FaceEscada {
  comprimentoM: number
  desnivelM: number
}

export interface EntradaDegraus {
  /** Espelho nominal (altura de cada degrau). O número de degraus é arredondado, então o espelho real pode variar um pouco. */
  espelhoM: number
  /** Piso nominal (largura horizontal de cada degrau). */
  degrauM: number
  /** Faces de talude, da crista para o pé. Uma só quando não há bermas. */
  faces: FaceEscada[]
  /** Comprimento plano de cada berma entre faces (faces - 1 valores); a escada passa reta por elas, como patamar. */
  bermasM?: number[]
}

export interface FaceDimensionada {
  comprimentoDisponivelM: number
  desnivelM: number
  degraus: number
  /** Espelho que realmente resulta: desnível da face dividido pelo número de degraus (0 se a face não tem degrau). */
  espelhoRealM: number
  comprimentoNecessarioM: number
  /** Piso que sobra (positivo, vira patamar) ou falta (negativo) na face. */
  folgaM: number
  cabe: boolean
}

export interface DimensionamentoDegraus {
  degrausTotal: number
  desnivelTotalM: number
  espelhoRealMedioM: number
  faces: FaceDimensionada[]
  bermasM: number[]
  /** Patamar total: bermas mais a sobra de piso nas faces. */
  patamarTotalM: number
  cabe: boolean
  avisos: string[]
}

/**
 * Número de degraus e patamares de uma escada hidráulica a partir do desnível, do espelho e do degrau escolhidos pelo engenheiro:
 * degraus = desnível / espelho (arredondado, mínimo 1), repartidos entre as faces de talude proporcionalmente ao desnível de cada uma
 * (maior resto); cada face precisa de degraus × degrau de comprimento horizontal, e o que sobra vira patamar reto. As bermas
 * são patamares planos entre faces. Não faz hidráulica (isso é verificarEscadaHidraulica): só a geometria que o plugin desenha.
 */
export function dimensionarDegraus(entrada: EntradaDegraus): DimensionamentoDegraus {
  const { espelhoM, degrauM } = entrada
  const faces = entrada.faces.filter((f) => f.desnivelM > 0 && f.comprimentoM > 0)
  const avisos: string[] = []
  const bermasM = entrada.bermasM ?? []
  if (!(espelhoM > 0) || !(degrauM > 0) || faces.length === 0) {
    return { degrausTotal: 0, desnivelTotalM: 0, espelhoRealMedioM: 0, faces: [], bermasM, patamarTotalM: bermasM.reduce((a, b) => a + b, 0), cabe: false,
      avisos: [faces.length === 0 ? 'Sem face de talude com desnível: não há como contar degraus.' : 'Informe espelho e degrau maiores que zero.'] }
  }
  const desnivelTotalM = faces.reduce((a, f) => a + f.desnivelM, 0)
  const total = Math.max(1, Math.round(desnivelTotalM / espelhoM))

  // repartição pelo maior resto: soma sempre fecha em `total`
  const ideais = faces.map((f) => (total * f.desnivelM) / desnivelTotalM)
  const base = ideais.map((x) => Math.floor(x))
  let faltam = total - base.reduce((a, b) => a + b, 0)
  const ordemResto = ideais.map((x, i) => ({ i, resto: x - Math.floor(x) })).sort((a, b) => b.resto - a.resto)
  for (const { i } of ordemResto) {
    if (faltam <= 0) break
    base[i]++
    faltam--
  }

  const dimensionadas: FaceDimensionada[] = faces.map((f, i) => {
    const degraus = base[i]
    const comprimentoNecessarioM = degraus * degrauM
    const folgaM = f.comprimentoM - comprimentoNecessarioM
    const cabe = folgaM >= -1e-9
    if (!cabe) {
      avisos.push(
        `Face ${i + 1}: o piso não cabe (faltam ${(-folgaM).toFixed(2)} m). Use degrau até ${(f.comprimentoM / degraus).toFixed(2)} m ou espelho maior.`
      )
    }
    return {
      comprimentoDisponivelM: f.comprimentoM,
      desnivelM: f.desnivelM,
      degraus,
      espelhoRealM: degraus > 0 ? f.desnivelM / degraus : 0,
      comprimentoNecessarioM,
      folgaM,
      cabe,
    }
  })

  const espelhoRealMedioM = desnivelTotalM / total
  if (Math.abs(espelhoRealMedioM - espelhoM) / espelhoM > 0.1 + 1e-9) {
    avisos.push(`O espelho real médio (${espelhoRealMedioM.toFixed(3)} m) difere mais de 10% do informado (${espelhoM.toFixed(3)} m): o número de degraus é inteiro.`)
  }
  const patamarTotalM = bermasM.reduce((a, b) => a + b, 0) + dimensionadas.reduce((a, f) => a + Math.max(0, f.folgaM), 0)
  return { degrausTotal: total, desnivelTotalM, espelhoRealMedioM, faces: dimensionadas, bermasM, patamarTotalM, cabe: dimensionadas.every((f) => f.cabe), avisos }
}
