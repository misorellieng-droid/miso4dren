import { RATIONAL_METHOD_K } from './constants'

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
  return RATIONAL_METHOD_K * coefC * intensidadeMmH * areaM2
}

/**
 * Vazão de projeto de um trecho a partir do ΣC×A acumulado até ele e da
 * intensidade no Tc do sistema (caminho crítico) naquele ponto — método
 * padrão de dimensionamento de rede pluvial: uma única duração de chuva
 * (o Tc até ali) aplicada sobre toda a área acumulada, em vez de somar
 * vazões de pico já prontas de cada bacia com Tc's diferentes entre si.
 */
export function calcularQProjeto(caAcumulado: number, intensidadeMmH: number): number {
  return RATIONAL_METHOD_K * caAcumulado * intensidadeMmH
}

export interface TrechoGrafo extends ArestaGrafo {
  // alias semântico: montanteId = caixaMontanteId, jusanteId = caixaJusanteId
}

export interface TrechoOrdenavel extends ArestaGrafo {
  nome: string
}

/**
 * Ordena os trechos por posição no fluxo da rede pra exibição em tabela.
 * "Nível" de um trecho = maior distância (em nº de trechos) até ele partindo
 * de qualquer cabeceira (camadas de Kahn) — garante que nenhum trecho apareça
 * antes de qualquer trecho que esteja a montante dele, mesmo quando um ramo
 * curto (poucos hops até a cabeceira) confluí numa caixa alimentada por um
 * ramo bem mais longo vindo de outra cabeceira. Empate no mesmo nível é
 * resolvido pelo nome do trecho, pra manter a ordem estável.
 */
export function ordenarTrechosPorFluxo(caixaIds: string[], trechos: TrechoOrdenavel[]): Map<string, number> {
  const grauEntrada = new Map<string, number>(caixaIds.map((id) => [id, 0]))
  const saidas = new Map<string, TrechoOrdenavel[]>(caixaIds.map((id) => [id, []]))
  for (const t of trechos) {
    grauEntrada.set(t.jusanteId, (grauEntrada.get(t.jusanteId) ?? 0) + 1)
    saidas.get(t.montanteId)?.push(t)
  }
  for (const lista of saidas.values()) lista.sort((a, b) => a.nome.localeCompare(b.nome))

  const nivelCaixa = new Map<string, number>()
  const fila: string[] = caixaIds.filter((id) => (grauEntrada.get(id) ?? 0) === 0)
  for (const id of fila) nivelCaixa.set(id, 0)
  const grauRestante = new Map(grauEntrada)

  const resultado: { id: string; nivel: number; nome: string }[] = []
  for (let i = 0; i < fila.length; i++) {
    const caixaId = fila[i]
    const nivel = nivelCaixa.get(caixaId) ?? 0
    for (const t of saidas.get(caixaId) ?? []) {
      resultado.push({ id: t.id, nivel, nome: t.nome })
      const grau = (grauRestante.get(t.jusanteId) ?? 0) - 1
      grauRestante.set(t.jusanteId, grau)
      nivelCaixa.set(t.jusanteId, Math.max(nivelCaixa.get(t.jusanteId) ?? 0, nivel + 1))
      if (grau === 0) fila.push(t.jusanteId)
    }
  }

  // sobra (grafo com ciclo ou desconexo de qualquer cabeceira) vai no fim, sem travar a tela
  const processados = new Set(resultado.map((r) => r.id))
  for (const t of trechos) if (!processados.has(t.id)) resultado.push({ id: t.id, nivel: Infinity, nome: t.nome })

  resultado.sort((a, b) => a.nivel - b.nivel || a.nome.localeCompare(b.nome))
  return new Map(resultado.map((r, idx) => [r.id, idx]))
}

/**
 * Acumula uma grandeza aditiva ao longo do grafo, dos nós de cabeceira até
 * a saída — genérico o bastante pra somar tanto vazão pronta quanto C×A.
 * Para cada nó: total(nó) = soma dos totais de todos os trechos de entrada +
 * a entrada direta desse nó. Cada trecho de saída de um nó recebe o total
 * acumulado nesse nó.
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
