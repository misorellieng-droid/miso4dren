export interface ArestaGrafo {
  id: string
  montanteId: string
  jusanteId: string
}

/**
 * Ordena os nós das cabeceiras até a saída (Kahn). Lança erro se o grafo
 * tiver ciclo — uma rede de drenagem é sempre um DAG (tipicamente uma árvore).
 */
export function ordenarTopologicamente(noIds: string[], arestas: ArestaGrafo[]): string[] {
  const grauEntrada = new Map<string, number>(noIds.map((id) => [id, 0]))
  const saidas = new Map<string, string[]>(noIds.map((id) => [id, []]))

  for (const { montanteId, jusanteId } of arestas) {
    saidas.get(montanteId)?.push(jusanteId)
    grauEntrada.set(jusanteId, (grauEntrada.get(jusanteId) ?? 0) + 1)
  }

  const fila = noIds.filter((id) => (grauEntrada.get(id) ?? 0) === 0)
  const ordem: string[] = []

  while (fila.length > 0) {
    const atual = fila.shift()!
    ordem.push(atual)
    for (const vizinho of saidas.get(atual) ?? []) {
      const grau = (grauEntrada.get(vizinho) ?? 0) - 1
      grauEntrada.set(vizinho, grau)
      if (grau === 0) fila.push(vizinho)
    }
  }

  if (ordem.length !== noIds.length) {
    throw new Error('Grafo da rede possui ciclo — verifique os vínculos montante/jusante dos trechos.')
  }

  return ordem
}

/**
 * Vazão de entrada de uma bacia pelo método racional:
 * Q_entrada = 2.78×10⁻⁷ × C × i × area_m2
 */
export function calcularQEntradaBacia(coefC: number, intensidadeMmH: number, areaM2: number): number {
  return 2.78e-7 * coefC * intensidadeMmH * areaM2
}

export interface TrechoGrafo extends ArestaGrafo {
  // alias semântico: montanteId = caixaMontanteId, jusanteId = caixaJusanteId
}

/**
 * Passo 1 — acumula a vazão de projeto ao longo do grafo, dos nós de
 * cabeceira até a saída. Para cada nó: Q(nó) = soma de Q_projeto de todos os
 * trechos de entrada + Q_entrada de bacias que desaguam diretamente nele.
 * Cada trecho de saída de um nó recebe o Q total acumulado nesse nó.
 */
export function acumularVazao(
  caixaIds: string[],
  trechos: TrechoGrafo[],
  qEntradaPorCaixa: Map<string, number>
): Map<string, number> {
  const ordem = ordenarTopologicamente(caixaIds, trechos)

  const trechosEntrada = new Map<string, TrechoGrafo[]>(caixaIds.map((id) => [id, []]))
  const trechosSaida = new Map<string, TrechoGrafo[]>(caixaIds.map((id) => [id, []]))
  for (const t of trechos) {
    trechosEntrada.get(t.jusanteId)?.push(t)
    trechosSaida.get(t.montanteId)?.push(t)
  }

  const qProjetoPorTrecho = new Map<string, number>()
  const qNo = new Map<string, number>()

  for (const caixaId of ordem) {
    const somaEntrada = (trechosEntrada.get(caixaId) ?? []).reduce(
      (acc, t) => acc + (qProjetoPorTrecho.get(t.id) ?? 0),
      0
    )
    const qBacias = qEntradaPorCaixa.get(caixaId) ?? 0
    const total = somaEntrada + qBacias
    qNo.set(caixaId, total)

    for (const saida of trechosSaida.get(caixaId) ?? []) {
      qProjetoPorTrecho.set(saida.id, total)
    }
  }

  return qProjetoPorTrecho
}

/**
 * Passo 2 — tempo de concentração do sistema por nó. Em nós de cabeceira
 * (sem trecho de entrada) usa o Tc inicial informado (ex.: da bacia
 * diretamente vinculada). Ao longo de um trecho, Tc(jusante) = Tc(montante)
 * + Tp, Tp = comprimento / velocidade / 60 (min). Em confluências, adota o
 * maior Tc entre os ramos que convergem (caminho crítico define o pico).
 */
export function calcularTcSistema(
  caixaIds: string[],
  trechos: (TrechoGrafo & { comprimentoM: number })[],
  velocidadePorTrecho: Map<string, number>,
  tcInicialPorCaixa: Map<string, number>
): Map<string, number> {
  const ordem = ordenarTopologicamente(caixaIds, trechos)
  const trechosEntrada = new Map<string, (TrechoGrafo & { comprimentoM: number })[]>(
    caixaIds.map((id) => [id, []])
  )
  for (const t of trechos) trechosEntrada.get(t.jusanteId)?.push(t)

  const tcPorCaixa = new Map<string, number>()

  for (const caixaId of ordem) {
    const entradas = trechosEntrada.get(caixaId) ?? []
    if (entradas.length === 0) {
      tcPorCaixa.set(caixaId, tcInicialPorCaixa.get(caixaId) ?? 0)
      continue
    }

    let maiorTc = -Infinity
    for (const t of entradas) {
      const tcMontante = tcPorCaixa.get(t.montanteId) ?? tcInicialPorCaixa.get(t.montanteId) ?? 0
      const velocidade = velocidadePorTrecho.get(t.id)
      const tp = velocidade && velocidade > 0 ? t.comprimentoM / velocidade / 60 : 0
      maiorTc = Math.max(maiorTc, tcMontante + tp)
    }
    tcPorCaixa.set(caixaId, maiorTc)
  }

  return tcPorCaixa
}
