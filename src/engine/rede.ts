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
  diametroM: number
}

export interface CaixaOrdenavel {
  id: string
  nome: string
}

/** Civil 3D representa um tubo emendando direto no outro (sem estrutura real no meio) como
 * um par StartNullStructN / EndNullStructN com o mesmo N — fisicamente é o mesmo ponto. */
function chaveNullStruct(nome: string): string | null {
  const m = /^(?:start|end)nullstruct(\d+)$/i.exec(nome.trim())
  return m ? m[1] : null
}

/**
 * Monta a estrutura compartilhada por ordenarTrechosPorFluxo e identificarTroncoRede:
 * funde pares StartNullStructN/EndNullStructN (mesmo N — jeito do Civil 3D representar
 * um tubo emendando direto no outro, sem estrutura real desenhada no meio) num único
 * ponto lógico, agrupa os trechos de entrada de cada caixa já ordenados por diâmetro
 * decrescente (o de maior diâmetro é tratado como a continuação do tronco), e identifica
 * as saídas da rede (caixas sem trecho de saída).
 */
function montarEstruturaFluxo(caixas: CaixaOrdenavel[], trechos: TrechoOrdenavel[]) {
  const porChaveNull = new Map<string, string[]>()
  for (const c of caixas) {
    const chave = chaveNullStruct(c.nome)
    if (!chave) continue
    if (!porChaveNull.has(chave)) porChaveNull.set(chave, [])
    porChaveNull.get(chave)!.push(c.id)
  }
  const canonico = new Map<string, string>()
  for (const ids of porChaveNull.values()) {
    if (ids.length < 2) continue
    const [primeiro, ...resto] = ids
    for (const id of resto) canonico.set(id, primeiro)
  }
  const resolve = (id: string) => canonico.get(id) ?? id

  const nomePorCaixa = new Map<string, string>()
  for (const c of caixas) {
    const id = resolve(c.id)
    if (!nomePorCaixa.has(id)) nomePorCaixa.set(id, c.nome)
  }

  const entradasPorCaixa = new Map<string, TrechoOrdenavel[]>()
  const temSaida = new Set<string>()
  for (const t of trechos) {
    const jusante = resolve(t.jusanteId)
    if (!entradasPorCaixa.has(jusante)) entradasPorCaixa.set(jusante, [])
    entradasPorCaixa.get(jusante)!.push(t)
    temSaida.add(resolve(t.montanteId))
  }
  // maior diâmetro primeiro (continuação do tronco); empate resolvido pelo nome do trecho
  for (const lista of entradasPorCaixa.values()) lista.sort((a, b) => b.diametroM - a.diametroM || a.nome.localeCompare(b.nome))

  const idsCaixas = [...new Set(caixas.map((c) => resolve(c.id)))]
  const outfalls = idsCaixas.filter((id) => !temSaida.has(id))
  outfalls.sort((a, b) => (nomePorCaixa.get(a) ?? '').localeCompare(nomePorCaixa.get(b) ?? ''))

  return { resolve, entradasPorCaixa, outfalls }
}

/**
 * Ordena os trechos seguindo o caminho físico da água, de montante pra jusante,
 * tratando a rede como "tronco + ramais": em cada confluência, o trecho de maior
 * diâmetro é tratado como a continuação do tronco — tudo que está a montante dele
 * (o resto do tronco) é emitido primeiro, e só depois os ramais menores que também
 * desaguam ali (o critério de nível/distância-da-cabeceira usado antes intercalava
 * ramais e tronco de forma arbitrária, na ordem alfabética da cabeceira).
 */
export function ordenarTrechosPorFluxo(caixas: CaixaOrdenavel[], trechos: TrechoOrdenavel[]): Map<string, number> {
  const { resolve, entradasPorCaixa, outfalls } = montarEstruturaFluxo(caixas, trechos)

  const ordem: string[] = []
  const trechoVisitado = new Set<string>()
  const caixaVisitada = new Set<string>()

  const emitir = (caixaId: string) => {
    if (caixaVisitada.has(caixaId)) return
    caixaVisitada.add(caixaId)
    for (const t of entradasPorCaixa.get(caixaId) ?? []) {
      if (trechoVisitado.has(t.id)) continue
      trechoVisitado.add(t.id)
      emitir(resolve(t.montanteId))
      ordem.push(t.id)
    }
  }
  for (const outfallId of outfalls) emitir(outfallId)

  // sobra (grafo com ciclo ou desconexo de todo outfall) vai no fim, sem travar a tela
  for (const t of trechos) if (!trechoVisitado.has(t.id)) ordem.push(t.id)

  return new Map(ordem.map((id, i) => [id, i]))
}

/**
 * Identifica os trechos que formam a "rede tronco": partindo de cada saída da rede,
 * segue só o trecho de MAIOR diâmetro em cada confluência (em vez de todos, como
 * ordenarTrechosPorFluxo) — define a cadeia principal de cada saída, deixando de fora
 * os ramais menores que desaguam nela. Usa o mesmo critério de diâmetro e a mesma fusão
 * de pares Start/EndNullStruct que a ordenação, então o resultado é sempre consistente
 * com o que aparece primeiro entre os trechos concorrentes na tabela.
 */
export function identificarTroncoRede(caixas: CaixaOrdenavel[], trechos: TrechoOrdenavel[]): Set<string> {
  const { resolve, entradasPorCaixa, outfalls } = montarEstruturaFluxo(caixas, trechos)

  const tronco = new Set<string>()
  const caixaVisitada = new Set<string>()
  const seguir = (caixaId: string) => {
    if (caixaVisitada.has(caixaId)) return
    caixaVisitada.add(caixaId)
    const entradas = entradasPorCaixa.get(caixaId)
    if (!entradas || entradas.length === 0) return
    const principal = entradas[0] // já ordenado por diâmetro desc (empate: nome)
    tronco.add(principal.id)
    seguir(resolve(principal.montanteId))
  }
  for (const outfallId of outfalls) seguir(outfallId)
  return tronco
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
