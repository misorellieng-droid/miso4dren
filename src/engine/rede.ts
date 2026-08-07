import { RATIONAL_METHOD_K } from './constants'

export interface ArestaGrafo {
  id: string
  montanteId: string
  jusanteId: string
}

/** Lançado por ordenarTopologicamente quando o grafo tem ciclo. Carrega os ids das caixas que
 * ficaram presas (o próprio ciclo mais tudo que só recebe água a partir dele), pra quem chamar
 * poder traduzir em nomes e mostrar uma mensagem acionável em vez de só "tem ciclo em algum lugar". */
export class GrafoCicloError extends Error {
  constructor(public readonly idsNoCiclo: string[]) {
    super('Grafo da rede possui ciclo — verifique os vínculos montante/jusante dos trechos.')
    this.name = 'GrafoCicloError'
  }
}

/**
 * Ordena os nós das cabeceiras até a saída (Kahn). Lança GrafoCicloError se o grafo
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
    const idsNoCiclo = noIds.filter((id) => (grauEntrada.get(id) ?? 0) > 0)
    throw new GrafoCicloError(idsNoCiclo)
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
  /** Classificação de rede tronco (ver CaixaComEhTronco) -- opcional aqui porque nem toda
   * chamada de montarEstruturaFluxo tem essa informação (ex.: antes de rodar o cálculo). Quando
   * presente, é o critério PRINCIPAL pra decidir qual entrada é "a continuação do tronco" em
   * cada confluência (ordenarTrechosPorFluxo/identificarRedesPorPvCabeceira) -- sem isso, cai no
   * fallback de maior diâmetro/nome, que quebra quando os diâmetros ainda estão todos iguais
   * (comum antes do dimensionamento) e o desempate por nome não tem relação nenhuma com
   * hierarquia hidráulica. */
  ehTronco?: boolean
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

  const ehTroncoPorCaixaId = new Map(caixas.map((c) => [c.id, c.ehTronco ?? false]))

  const entradasPorCaixa = new Map<string, TrechoOrdenavel[]>()
  const temSaida = new Set<string>()
  for (const t of trechos) {
    const jusante = resolve(t.jusanteId)
    if (!entradasPorCaixa.has(jusante)) entradasPorCaixa.set(jusante, [])
    entradasPorCaixa.get(jusante)!.push(t)
    temSaida.add(resolve(t.montanteId))
  }
  // critério de "quem é a continuação do tronco" nessa confluência: 1º a caixa de montante
  // classificada como rede tronco (explícita, controlada pelo engenheiro -- ver CaixaOrdenavel),
  // 2º maior diâmetro, 3º empate pelo nome do trecho. Sem o critério de rede tronco (ou com
  // nenhuma das entradas classificada), cai direto pro diâmetro/nome como sempre foi.
  for (const lista of entradasPorCaixa.values()) {
    lista.sort(
      (a, b) =>
        Number(ehTroncoPorCaixaId.get(b.montanteId) ?? false) - Number(ehTroncoPorCaixaId.get(a.montanteId) ?? false) ||
        b.diametroM - a.diametroM ||
        a.nome.localeCompare(b.nome)
    )
  }

  const idsCaixas = [...new Set(caixas.map((c) => resolve(c.id)))]
  const outfalls = idsCaixas.filter((id) => !temSaida.has(id))
  outfalls.sort((a, b) => (nomePorCaixa.get(a) ?? '').localeCompare(nomePorCaixa.get(b) ?? ''))

  return { resolve, entradasPorCaixa, outfalls }
}

/**
 * Ordena os trechos seguindo o caminho físico da água, de montante pra jusante, tratando a rede
 * como "tronco + ramais": em cada confluência, a entrada cuja caixa de montante é classificada
 * como rede tronco (`ehTronco` em CaixaOrdenavel, quando presente) é tratada como a continuação
 * do tronco — tudo que está a montante dela (o resto do tronco) é emitido primeiro, e só depois
 * os ramais que também desaguam ali. Sem classificação de tronco disponível, cai pro critério
 * antigo (maior diâmetro, empate por nome) -- que sozinho quebra quando os diâmetros ainda estão
 * todos iguais (comum antes de rodar o dimensionamento): o desempate por nome do trecho não tem
 * NENHUMA relação com hierarquia hidráulica, então a tabela podia "começar" por um ramal
 * qualquer perto da saída em vez da cabeceira de verdade da rede tronco.
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

export interface CaixaComEhTronco extends CaixaOrdenavel {
  /** Classificação explícita da caixa (editável em Rede Importada) — chute inicial pelo tipo
   * inferido do LandXML (PV e boca de lobo = true), mas o engenheiro é quem decide de fato
   * quais caixas fazem parte da rede tronco no projeto. */
  ehTronco: boolean
}

/**
 * Identifica os trechos que formam a "rede tronco": um trecho entra quando a caixa de MONTANTE
 * dele é classificada como rede tronco (`ehTronco`, campo editável por caixa — ver
 * CaixaComEhTronco). Critério explícito e previsível, controlado pelo engenheiro (não tenta
 * adivinhar por diâmetro/vazão): por padrão PV e boca de lobo entram, caixa de passagem não —
 * ajustável caixa a caixa em Rede Importada quando o padrão não bater com o projeto real (ex.:
 * uma boca de lobo que só capta localmente, sem função de tronco). Percorre a rede inteira a
 * partir de cada saída (caixa sem trecho de saída), então uma caixa não-tronco no meio do
 * caminho não interrompe a exploração rio acima -- só decide se O TRECHO que sai DELA entra ou
 * não no conjunto. Não afeta o cálculo hidráulico (ΣC×A/vazão sempre soma TODAS as entradas de
 * toda caixa); esse filtro só decide o que aparece na tabela/diagrama/Nota de Serviço/Quantidade
 * quando "Só rede tronco" está ativo. Usa a mesma fusão de pares Start/EndNullStruct que
 * ordenarTrechosPorFluxo.
 */
export function identificarTroncoRede(caixas: CaixaComEhTronco[], trechos: TrechoOrdenavel[]): Set<string> {
  const { resolve, entradasPorCaixa, outfalls } = montarEstruturaFluxo(caixas, trechos)
  const ehTroncoPorCaixa = new Map(caixas.map((c) => [resolve(c.id), c.ehTronco]))

  const tronco = new Set<string>()
  const caixaVisitada = new Set<string>()
  const seguir = (caixaId: string) => {
    if (caixaVisitada.has(caixaId)) return
    caixaVisitada.add(caixaId)
    const entradas = entradasPorCaixa.get(caixaId) ?? []
    for (const e of entradas) {
      const montanteId = resolve(e.montanteId)
      if (ehTroncoPorCaixa.get(montanteId)) tronco.add(e.id)
      seguir(montanteId)
    }
  }
  for (const outfallId of outfalls) seguir(outfallId)
  return tronco
}

/** Caixa nomeada "JUS" (ex.: "JUS - 1", "JUS-01") é o ponto de ligação com a rede externa,
 * declarado assim de propósito pelo engenheiro como fim de projeto — não é um vínculo quebrado,
 * mesmo não tendo trecho de saída. `(?![a-z])` depois do "jus" evita bater com nomes que só
 * começam parecido (ex.: uma eventual "Justino" ou "Juss..."), sem exigir separador específico
 * (aceita "JUS1", "JUS - 1", "JUS_1" etc.). */
export function ehCaixaDestinoExterno(nome: string): boolean {
  return /^jus(?![a-z])/i.test(nome.trim())
}

/**
 * Toda caixa sem trecho de saída é, pra topologia, uma "saída da rede" (outfall) -- é assim que
 * identificarTroncoRede/ordenarTrechosPorFluxo decidem por onde começar a andar rio acima. Mas
 * nem toda caixa sem saída é uma saída de verdade: às vezes é um erro de vínculo no LandXML (o
 * trecho que deveria continuar dali não ficou ligado a ela) e a rede simplesmente "morre" no meio
 * do caminho sem ninguém perceber. Retorna os ids (já resolvidos -- funde pares Start/EndNullStruct,
 * então não aponta os dois lados de uma emenda sem estrutura como "sem jusante" por engano) de
 * toda caixa que RECEBE água (tem pelo menos 1 trecho de entrada) mas não tem trecho de saída --
 * candidatas a conferir manualmente se são a saída real do terreno ou um vínculo quebrado. Caixas
 * "JUS" (ver ehCaixaDestinoExterno) nunca entram aqui — são a saída declarada de propósito.
 */
export function identificarCaixasSemJusante(caixas: CaixaOrdenavel[], trechos: TrechoOrdenavel[]): string[] {
  const { entradasPorCaixa, outfalls } = montarEstruturaFluxo(caixas, trechos)
  const nomePorId = new Map(caixas.map((c) => [c.id, c.nome]))
  return outfalls.filter((id) => (entradasPorCaixa.get(id) ?? []).length > 0 && !ehCaixaDestinoExterno(nomePorId.get(id) ?? ''))
}

/**
 * Caixas completamente desconectadas da rede: nenhum trecho de entrada NEM de saída ligado a
 * elas (depois de fundir pares Start/EndNullStruct -- senão uma emenda sem estrutura real
 * apareceria aqui por engano). Normalmente sinal de erro de vínculo no LandXML -- uma estrutura
 * que devia estar ligada a algum tubo ficou solta na importação.
 */
export function identificarCaixasIsoladas(caixas: CaixaOrdenavel[], trechos: TrechoOrdenavel[]): string[] {
  const { entradasPorCaixa, outfalls } = montarEstruturaFluxo(caixas, trechos)
  return outfalls.filter((id) => (entradasPorCaixa.get(id) ?? []).length === 0)
}

export interface CaixaComMultiplasSaidas {
  caixaId: string
  quantidade: number
}

/**
 * "No máximo 1 trecho de saída por caixa" é uma suposição usada em todo o engine (rede tronco,
 * cascata jusante, numeração de Sistema, acumulação de vazão) -- uma caixa com 2+ saídas quebra
 * esse modelo de forma silenciosa: o cálculo roda, mas o resultado fica arbitrário conforme qual
 * saída "vence" em cada função (não necessariamente a mesma em todas). Detecta e lista as
 * caixas assim pra correção manual no Civil 3D. Funde pares Start/EndNullStruct antes de contar,
 * senão uma emenda sem estrutura real contaria como uma segunda saída por engano.
 */
export function identificarCaixasComMultiplasSaidas(caixas: CaixaOrdenavel[], trechos: TrechoOrdenavel[]): CaixaComMultiplasSaidas[] {
  const { resolve } = montarEstruturaFluxo(caixas, trechos)
  const contagem = new Map<string, number>()
  for (const t of trechos) {
    const montanteId = resolve(t.montanteId)
    contagem.set(montanteId, (contagem.get(montanteId) ?? 0) + 1)
  }
  return [...contagem.entries()]
    .filter(([, n]) => n > 1)
    .map(([caixaId, quantidade]) => ({ caixaId, quantidade }))
}

export interface CaixaPerfil extends CaixaOrdenavel {
  cotaTerreno: number | null
}

export interface TrechoPerfil extends TrechoOrdenavel {
  comprimentoM: number
}

export interface PatchPerfilRede {
  id: string
  declividadeMM: number
  cotaFundoMontante: number
  cotaFundoJusante: number
  cotaTopoMontante: number
  cotaTopoJusante: number
}

export interface ResultadoPerfilRede {
  patches: PatchPerfilRede[]
  /** Ids (resolvidos) de cabeceiras sem cota de terreno cadastrada -- não dá pra aplicar o
   * recobrimento ali, então elas (e tudo a jusante delas) ficam de fora do resultado. */
  cabeceirasSemCotaTerreno: string[]
}

/**
 * Recalcula a rede inteira (ou o subconjunto de trechos passado) com uma declividade uniforme e
 * um recobrimento fixo aplicado só nas cabeceiras (caixas sem trecho de entrada) -- sobrepõe
 * completamente as cotas de fundo/topo que vieram do LandXML/Civil 3D, em vez de editar trecho a
 * trecho. Em cada confluência, a cota de fundo que continua rio abaixo é a MENOR entre as
 * entradas que já chegaram ali (prática padrão: a saída não pode ficar acima de nenhuma entrada,
 * senão empoça). Serve pra testar rapidamente um perfil alternativo na rede inteira sem precisar
 * voltar pro Civil 3D -- se o resultado não for bom (ex.: ficar abaixo do nível de alguma
 * captação), o engenheiro ajusta os parâmetros e roda de novo, ou corrige pontualmente depois com
 * a edição trecho a trecho normal (que já existe).
 */
export function recalcularPerfilRedeUniforme(
  caixas: CaixaPerfil[],
  trechos: TrechoPerfil[],
  declividadeUniformeMM: number,
  recobrimentoM: number
): ResultadoPerfilRede {
  const { resolve, entradasPorCaixa } = montarEstruturaFluxo(caixas, trechos)

  const idsResolvidos = [...new Set(caixas.map((c) => resolve(c.id)))]
  const trechosResolvidos = trechos.map((t) => ({ id: t.id, montanteId: resolve(t.montanteId), jusanteId: resolve(t.jusanteId) }))
  const ordem = ordenarTopologicamente(idsResolvidos, trechosResolvidos)

  const cotaTerrenoPorCaixa = new Map<string, number | null>()
  for (const c of caixas) {
    const id = resolve(c.id)
    if (!cotaTerrenoPorCaixa.has(id)) cotaTerrenoPorCaixa.set(id, c.cotaTerreno)
  }

  const saidaPorCaixa = new Map<string, TrechoPerfil[]>()
  for (const t of trechos) {
    const montanteId = resolve(t.montanteId)
    if (!saidaPorCaixa.has(montanteId)) saidaPorCaixa.set(montanteId, [])
    saidaPorCaixa.get(montanteId)!.push(t)
  }

  const cotaFundoJusantePorTrecho = new Map<string, number>()
  const patches: PatchPerfilRede[] = []
  const cabeceirasSemCotaTerreno = new Set<string>()

  for (const caixaId of ordem) {
    const entradas = entradasPorCaixa.get(caixaId) ?? []
    let cotaNaCaixa: number | undefined

    if (entradas.length === 0) {
      const saidas = saidaPorCaixa.get(caixaId) ?? []
      if (saidas.length === 0) continue
      const terreno = cotaTerrenoPorCaixa.get(caixaId)
      if (terreno == null) {
        cabeceirasSemCotaTerreno.add(caixaId)
        continue
      }
      cotaNaCaixa = terreno - recobrimentoM - saidas[0].diametroM
    } else {
      const cotas = entradas.map((e) => cotaFundoJusantePorTrecho.get(e.id)).filter((v): v is number => v != null)
      if (cotas.length === 0) continue
      cotaNaCaixa = Math.min(...cotas)
    }

    for (const saida of saidaPorCaixa.get(caixaId) ?? []) {
      const cotaFundoJusante = cotaNaCaixa - declividadeUniformeMM * saida.comprimentoM
      cotaFundoJusantePorTrecho.set(saida.id, cotaFundoJusante)
      patches.push({
        id: saida.id,
        declividadeMM: declividadeUniformeMM,
        cotaFundoMontante: cotaNaCaixa,
        cotaFundoJusante,
        cotaTopoMontante: cotaNaCaixa + saida.diametroM,
        cotaTopoJusante: cotaFundoJusante + saida.diametroM,
      })
    }
  }

  return { patches, cabeceirasSemCotaTerreno: [...cabeceirasSemCotaTerreno] }
}

export interface TrechoRecobrimento extends TrechoOrdenavel {
  comprimentoM: number
  declividadeMM: number
  cotaTopoMontante: number | null
  cotaTopoJusante: number | null
}

export interface ViolacaoRecobrimento {
  trechoId: string
  nomeTrecho: string
  extremidade: 'montante' | 'jusante'
  caixaId: string
  nomeCaixa: string
  /** Pode ser negativo -- tubo literalmente acima da cota de terreno cadastrada. */
  recobrimentoM: number
  /** true quando a extremidade é montante E a caixa não tem nenhum trecho de entrada -- esse
   * caso é corrigível diretamente (ver corrigirRecobrimentoCabeceiras), os outros não. */
  ehCabeceira: boolean
}

/**
 * Recobrimento = cota de terreno da caixa − cota de topo do tubo naquele ponto. Compara os dois
 * lados (montante e jusante) de todo trecho contra um mínimo -- valores negativos (recobrimento
 * < 0) significam o tubo literalmente acima da superfície cadastrada, fisicamente impossível;
 * normalmente erro de cota de fundo importada errada do Civil 3D numa estrutura de captação
 * (boca de lobo/bueiro simples), não do trecho em si.
 */
export function identificarRecobrimentoInsuficiente(
  caixas: CaixaPerfil[],
  trechos: TrechoRecobrimento[],
  recobrimentoMinimoM: number
): ViolacaoRecobrimento[] {
  const { entradasPorCaixa, resolve } = montarEstruturaFluxo(caixas, trechos)
  const caixaPorId = new Map(caixas.map((c) => [c.id, c]))

  const violacoes: ViolacaoRecobrimento[] = []
  for (const t of trechos) {
    const montante = caixaPorId.get(t.montanteId)
    if (montante?.cotaTerreno != null && t.cotaTopoMontante != null) {
      const recobrimentoM = montante.cotaTerreno - t.cotaTopoMontante
      if (recobrimentoM < recobrimentoMinimoM) {
        const ehCabeceira = (entradasPorCaixa.get(resolve(t.montanteId)) ?? []).length === 0
        violacoes.push({ trechoId: t.id, nomeTrecho: t.nome, extremidade: 'montante', caixaId: t.montanteId, nomeCaixa: montante.nome, recobrimentoM, ehCabeceira })
      }
    }
    const jusante = caixaPorId.get(t.jusanteId)
    if (jusante?.cotaTerreno != null && t.cotaTopoJusante != null) {
      const recobrimentoM = jusante.cotaTerreno - t.cotaTopoJusante
      if (recobrimentoM < recobrimentoMinimoM) {
        violacoes.push({ trechoId: t.id, nomeTrecho: t.nome, extremidade: 'jusante', caixaId: t.jusanteId, nomeCaixa: jusante.nome, recobrimentoM, ehCabeceira: false })
      }
    }
  }
  return violacoes
}

export interface CorrecaoRecobrimentoCabeceira {
  trechoId: string
  cotaFundoMontante: number
  cotaFundoJusante: number
  cotaTopoMontante: number
  cotaTopoJusante: number
}

/**
 * Corrige só as cabeceiras (trecho que nasce numa caixa sem nenhuma entrada) com recobrimento
 * insuficiente, empurrando a cota de fundo montante pra baixo até garantir o mínimo, preservando
 * a declividade própria do trecho -- o resto da rede a jusante se ajusta sozinho na próxima vez
 * que o cálculo rodar (calcularCotasPorEnergia já propaga a partir da nova âncora). Só mexe em
 * cabeceira: um recobrimento insuficiente no MEIO do caminho pode ser sintoma de outra coisa
 * (terreno caindo mais rápido que o tubo) e pede julgamento de engenharia, não é seguro
 * sobrescrever sozinho.
 */
export function corrigirRecobrimentoCabeceiras(
  caixas: CaixaPerfil[],
  trechos: TrechoRecobrimento[],
  recobrimentoMinimoM: number
): CorrecaoRecobrimentoCabeceira[] {
  const violacoes = identificarRecobrimentoInsuficiente(caixas, trechos, recobrimentoMinimoM)
  const caixaPorId = new Map(caixas.map((c) => [c.id, c]))
  const trechoPorId = new Map(trechos.map((t) => [t.id, t]))

  const correcoes: CorrecaoRecobrimentoCabeceira[] = []
  for (const v of violacoes) {
    if (!v.ehCabeceira || v.extremidade !== 'montante') continue
    const t = trechoPorId.get(v.trechoId)
    const caixa = caixaPorId.get(v.caixaId)
    if (!t || caixa?.cotaTerreno == null) continue
    const cotaTopoMontante = caixa.cotaTerreno - recobrimentoMinimoM
    const cotaFundoMontante = cotaTopoMontante - t.diametroM
    const cotaFundoJusante = cotaFundoMontante - t.declividadeMM * t.comprimentoM
    const cotaTopoJusante = cotaFundoJusante + t.diametroM
    correcoes.push({ trechoId: t.id, cotaFundoMontante, cotaFundoJusante, cotaTopoMontante, cotaTopoJusante })
  }
  return correcoes
}

export interface CorrecaoRecobrimentoTrecho {
  trechoId: string
  cotaFundoMontante: number
  cotaFundoJusante: number
  cotaTopoMontante: number
  cotaTopoJusante: number
  declividadeMM: number
}

const TOLERANCIA_COTA_RECOBRIMENTO_M = 0.001

/**
 * Corrige o recobrimento insuficiente da rede INTEIRA, não só cabeceiras -- generalização de
 * corrigirRecobrimentoCabeceiras. Percorre a rede na mesma ordem de fluxo de
 * ordenarTrechosPorFluxo (montante pra jusante, cabeceira primeiro) empurrando cota pra baixo
 * sempre que necessário:
 * - Cabeceira: empurra a própria cota de fundo montante, preservando a declividade própria do
 *   trecho (igual corrigirRecobrimentoCabeceiras).
 * - Qualquer outro trecho: herda a cota de fundo montante de quem chega nele (a mais restritiva,
 *   quando há confluência com mais de uma entrada) -- não é uma decisão nova, só reflete o que a
 *   caixa já vai receber depois que os trechos de montante forem corrigidos. Se mesmo assim faltar
 *   recobrimento na extremidade jusante, aumenta a PRÓPRIA declividade o suficiente pra garantir o
 *   mínimo ali (a montante não muda -- só a rampa fica mais íngreme).
 * Nunca deixa uma cota SUBIR, só descer -- por isso qualquer violação vira uma trincheira mais
 * funda, nunca um degrau pra cima que represaria água.
 *
 * A correção aqui usa continuidade simples (degrau zero / mais restritiva entre entradas), sem
 * linha de energia (EGL) -- essa é uma etapa de planejamento; o recálculo de verdade que roda
 * depois (calcularCotasPorEnergia, já com vazão/lâmina/velocidade da rede) é quem ajusta fino as
 * confluências com troca de diâmetro, mas o resultado dele nunca fica mais RASO do que a entrada
 * escolhida aqui (usa sempre o mínimo entre a energia calculada e a cota da entrada de menor
 * energia), então o recobrimento mínimo garantido aqui não se perde no recálculo -- na pior das
 * hipóteses sobra uma folga maior que o estritamente necessário.
 */
export function corrigirRecobrimentoRedeCompleta(
  caixas: CaixaPerfil[],
  trechos: TrechoRecobrimento[],
  recobrimentoMinimoM: number,
  declividadeMinimaMM?: number
): CorrecaoRecobrimentoTrecho[] {
  const { resolve, entradasPorCaixa, outfalls } = montarEstruturaFluxo(caixas, trechos)
  const caixaPorId = new Map(caixas.map((c) => [c.id, c]))
  const trechoPorId = new Map(trechos.map((t) => [t.id, t]))

  // mesma travessia de ordenarTrechosPorFluxo: monta a ordem montante -> jusante a partir das
  // saídas da rede, andando rio acima primeiro.
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
  for (const t of trechos) if (!trechoVisitado.has(t.id)) ordem.push(t.id) // grafo com ciclo/desconexo -- não trava

  // 1 mm de folga ao clampar numa cota-limite -- evita cair EXATAMENTE na borda do mínimo e
  // depois "escorregar" pra não conforme por ruído de ponto flutuante numa conferência posterior.
  const MARGEM_SEGURANCA_M = 0.001

  const cotaFundoMontantePorTrecho = new Map<string, number>()
  const cotaFundoJusantePorTrecho = new Map<string, number>()
  const declividadeAplicadaPorTrecho = new Map<string, number>()
  const cotaFundoMaximaEm = (caixaId: string, diametroM: number): number | null => {
    const terreno = caixaPorId.get(caixaId)?.cotaTerreno
    return terreno != null ? terreno - recobrimentoMinimoM - diametroM - MARGEM_SEGURANCA_M : null
  }

  for (const trechoId of ordem) {
    const t = trechoPorId.get(trechoId)
    if (!t) continue
    const caixaMontanteId = resolve(t.montanteId)
    const entradas = (entradasPorCaixa.get(caixaMontanteId) ?? []).filter((e) => cotaFundoJusantePorTrecho.has(e.id))

    let cotaFundoMontante: number
    if (entradas.length > 0) {
      cotaFundoMontante = Math.min(...entradas.map((e) => cotaFundoJusantePorTrecho.get(e.id)!))
    } else if (t.cotaTopoMontante != null) {
      cotaFundoMontante = t.cotaTopoMontante - t.diametroM
    } else {
      continue // sem nenhuma cota pra ancorar -- não há o que corrigir aqui
    }
    const maximaMontante = cotaFundoMaximaEm(t.montanteId, t.diametroM)
    if (maximaMontante != null) cotaFundoMontante = Math.min(cotaFundoMontante, maximaMontante)
    cotaFundoMontantePorTrecho.set(t.id, cotaFundoMontante)
    const atualFundoMontante = t.cotaTopoMontante != null ? t.cotaTopoMontante - t.diametroM : null
    const montanteMudou = atualFundoMontante == null || Math.abs(atualFundoMontante - cotaFundoMontante) > TOLERANCIA_COTA_RECOBRIMENTO_M

    // declividade aplicada só se afasta da original (por SUBTRAÇÃO, que introduz ruído de ponto
    // flutuante) quando de fato precisa descer mais pra vencer o recobrimento na jusante -- senão
    // reaproveita o valor original tal como veio, evitando algo como um 0.003 exato virar
    // 0.0029999999999987 e cair "não conforme" à toa só por ter passado pela conta.
    let declividadeAplicada = t.declividadeMM
    let cotaFundoJusante = cotaFundoMontante - declividadeAplicada * t.comprimentoM
    const maximaJusante = cotaFundoMaximaEm(t.jusanteId, t.diametroM)
    let jusanteClampou = false
    if (maximaJusante != null && cotaFundoJusante > maximaJusante) {
      cotaFundoJusante = maximaJusante
      jusanteClampou = true
      if (t.comprimentoM > 0) declividadeAplicada = (cotaFundoMontante - cotaFundoJusante) / t.comprimentoM
    }
    // nunca deixa a declividade final ficar abaixo do mínimo de conformidade do projeto (quando
    // informado) -- só sobe, nunca desce, e refaz a cota de fundo jusante coerente com o valor
    // final, garantindo declividade mínima E recobrimento mínimo ao mesmo tempo. Só entra em jogo
    // em trechos que este corretor JÁ está mexendo por outro motivo (cabeceira empurrada,
    // recobrimento clampado): uma declividade baixa pré-existente num trecho não tocado é outro
    // problema (tem correção própria na tela) e não deve virar escopo por tabela aqui.
    if (declividadeMinimaMM != null && declividadeAplicada < declividadeMinimaMM && (montanteMudou || jusanteClampou)) {
      declividadeAplicada = declividadeMinimaMM
      cotaFundoJusante = cotaFundoMontante - declividadeAplicada * t.comprimentoM
    }
    declividadeAplicadaPorTrecho.set(t.id, declividadeAplicada)
    cotaFundoJusantePorTrecho.set(t.id, cotaFundoJusante)
  }

  const correcoes: CorrecaoRecobrimentoTrecho[] = []
  for (const t of trechos) {
    const cotaFundoMontante = cotaFundoMontantePorTrecho.get(t.id)
    const cotaFundoJusante = cotaFundoJusantePorTrecho.get(t.id)
    const declividadeAplicada = declividadeAplicadaPorTrecho.get(t.id)
    if (cotaFundoMontante == null || cotaFundoJusante == null || declividadeAplicada == null) continue
    const atualFundoMontante = t.cotaTopoMontante != null ? t.cotaTopoMontante - t.diametroM : null
    const atualFundoJusante = t.cotaTopoJusante != null ? t.cotaTopoJusante - t.diametroM : null
    const mudou =
      atualFundoMontante == null ||
      atualFundoJusante == null ||
      Math.abs(atualFundoMontante - cotaFundoMontante) > TOLERANCIA_COTA_RECOBRIMENTO_M ||
      Math.abs(atualFundoJusante - cotaFundoJusante) > TOLERANCIA_COTA_RECOBRIMENTO_M
    if (!mudou) continue
    correcoes.push({
      trechoId: t.id,
      cotaFundoMontante,
      cotaFundoJusante,
      cotaTopoMontante: cotaFundoMontante + t.diametroM,
      cotaTopoJusante: cotaFundoJusante + t.diametroM,
      declividadeMM: declividadeAplicada,
    })
  }
  return correcoes
}

export interface CaixaComTipo extends CaixaOrdenavel {
  tipo: string
}

/**
 * Identifica as "redes" dentro da revisão a partir de cada PV de cabeceira. "De cabeceira" aqui
 * NÃO significa sem nenhum trecho de entrada — na prática todo PV recebe contribuição direta de
 * boca de lobo/grelha, então essa condição quase nunca aconteceria. Significa: um PV cujas
 * entradas (se houver) vêm todas de caixas que NÃO são PV — ou seja, é o PRIMEIRO PV da rede,
 * mesmo recebendo água direto de inlets. Um PV só deixa de ser cabeceira quando pelo menos uma
 * das entradas dele vem de OUTRO PV — nesse caso ele é continuação/junção de uma rede que já
 * existe, não o início de uma nova.
 *
 * IMPORTANTE: o critério de candidato a cabeceira (tipo === 'pv') é só o primeiro filtro. O
 * critério que REALMENTE decide se um PV vira cabeceira nova é a ORDEM DE CHECAGEM no loop
 * abaixo -- tenta herdar a rede de uma entrada que já carregue uma (mesmo vindo indiretamente
 * de outro PV, através de uma cadeia de caixas não-PV no meio do caminho, tipo boca de lobo
 * funcionando como relé de uma tubulação principal) ANTES de decidir que é cabeceira nova. Isso
 * evita o caso real de um PV que só recebe de bocas de lobo/caixas de passagem, mas uma dessas
 * bocas de lobo já carrega uma sub-rede enorme atrás dela (vinda de outro PV, mais a montante) --
 * sem essa ordem, esse PV "cortaria" a rede que já vinha, criando uma segunda do zero.
 *
 * Cada PV de cabeceira gera uma rede nova e independente, numerada em ordem alfabética do nome
 * (determinístico). A rede se propaga rio abaixo trecho a trecho até desaguar numa caixa que já
 * recebe outra rede (confluência com outro PV de cabeceira mais a jusante): a partir daí, quem
 * continua é a entrada DOMINANTE (maior diâmetro — mesmo critério de tronco/ramal usado em
 * identificarTroncoRede/ordenarTrechosPorFluxo), como se a rede menor tivesse "desaguado" na
 * maior. Caixas que não são PV (boca de lobo, grelha, caixa de passagem etc.) nunca geram rede
 * própria — passam a integrar a rede do PV de cabeceira que alimentam (útil pra Nota de
 * Serviço/Quantidade: a boca de lobo entra no filtro da rede que ela alimenta). Assume no
 * máximo 1 trecho de saída por caixa, igual ao resto do engine.
 */
export interface RedesPorPvCabeceira {
  /** rede de cada trecho */
  redePorTrecho: Map<string, number>
  /** pra cada caixa de confluência, os números de rede (que não a que continua a partir dali)
   * que desaguam ali -- ex.: Rede 02 desaguando na Rede 01 na caixa X aparece como
   * redesQueDesaguamPorCaixa.get('X') === [2]. Útil pra sinalizar isso nas tabelas/diagrama. */
  redesQueDesaguamPorCaixa: Map<string, number[]>
}

export function identificarRedesPorPvCabeceira(caixas: CaixaComTipo[], trechos: TrechoOrdenavel[]): RedesPorPvCabeceira {
  const { resolve, entradasPorCaixa } = montarEstruturaFluxo(caixas, trechos)

  const idsResolvidos = [...new Set(caixas.map((c) => resolve(c.id)))]
  const trechosResolvidos = trechos.map((t) => ({ id: t.id, montanteId: resolve(t.montanteId), jusanteId: resolve(t.jusanteId) }))

  const nomePorCaixaResolvida = new Map<string, string>()
  const tipoPorCaixaResolvida = new Map<string, string>()
  for (const c of caixas) {
    const id = resolve(c.id)
    if (!nomePorCaixaResolvida.has(id)) nomePorCaixaResolvida.set(id, c.nome)
    if (!tipoPorCaixaResolvida.has(id)) tipoPorCaixaResolvida.set(id, c.tipo)
  }

  let ordem: string[]
  try {
    ordem = ordenarTopologicamente(idsResolvidos, trechosResolvidos)
  } catch (e) {
    if (e instanceof GrafoCicloError) {
      const nomes = e.idsNoCiclo.map((id) => nomePorCaixaResolvida.get(id) ?? id).sort()
      const erroComNomes = new GrafoCicloError(e.idsNoCiclo)
      erroComNomes.message = `Grafo da rede possui ciclo — verifique os vínculos montante/jusante das caixas: ${nomes.join(', ')}.`
      throw erroComNomes
    }
    throw e
  }

  const ehPv = (id: string) => tipoPorCaixaResolvida.get(id) === 'pv'
  const ehPvCabeceira = (id: string) => {
    if (!ehPv(id)) return false
    const entradas = entradasPorCaixa.get(id) ?? []
    return entradas.every((e) => !ehPv(resolve(e.montanteId)))
  }

  // numera os PVs de cabeceira em ordem alfabética do nome -- numeração determinística,
  // independente da ordem de chegada dos dados do banco.
  const pvsCabeceira = idsResolvidos
    .filter(ehPvCabeceira)
    .sort((a, b) => (nomePorCaixaResolvida.get(a) ?? '').localeCompare(nomePorCaixaResolvida.get(b) ?? ''))
  const numeroPorPvCabeceira = new Map(pvsCabeceira.map((id, i) => [id, i + 1]))

  const saidaPorCaixa = new Map<string, TrechoOrdenavel>()
  for (const t of trechos) saidaPorCaixa.set(resolve(t.montanteId), t)

  const redePorTrecho = new Map<string, number>()
  const redesQueDesaguamPorCaixa = new Map<string, number[]>()

  for (const caixaId of ordem) {
    const entradas = entradasPorCaixa.get(caixaId) ?? []
    let redeAtual: number | undefined

    // tenta herdar PRIMEIRO -- mesmo um PV "candidato a cabeceira" (tipo pv, só entradas
    // não-pv diretas) pode já estar recebendo, através de uma dessas entradas não-pv, uma rede
    // que veio de outro PV mais a montante (ex.: uma boca de lobo no meio do caminho de uma
    // tubulação principal). Só vira cabeceira NOVA quando ninguém a montante já carrega rede.
    if (entradas.length > 0) {
      redeAtual = redePorTrecho.get(entradas[0].id)
      if (redeAtual == null) {
        const comRede = entradas.find((e) => redePorTrecho.get(e.id) != null)
        redeAtual = comRede ? redePorTrecho.get(comRede.id) : undefined
      }
    }

    // só vira cabeceira NOVA quando ninguém a montante já carrega rede -- é o que evita o PV
    // "cortar" uma rede que já vinha por trás de uma boca de lobo/caixa de passagem (ver
    // comentário no topo da função).
    if (redeAtual == null && numeroPorPvCabeceira.has(caixaId)) {
      redeAtual = numeroPorPvCabeceira.get(caixaId)
    }

    if (redeAtual != null) {
      // registra qualquer entrada que já chegue com uma rede DIFERENTE da que continua daqui
      // pra frente -- é o ponto onde aquela outra rede "deságua" nesta.
      const outrasRedes = new Set<number>()
      for (const e of entradas) {
        const redeEntrada = redePorTrecho.get(e.id)
        if (redeEntrada != null && redeEntrada !== redeAtual) outrasRedes.add(redeEntrada)
      }
      if (outrasRedes.size > 0) redesQueDesaguamPorCaixa.set(caixaId, [...outrasRedes].sort((a, b) => a - b))

      // "adota" ramais órfãos (boca de lobo/grelha sem rede própria, ou entradas de um PV de
      // cabeceira) que desaguam aqui -- passam a integrar a rede resolvida desta caixa. Ramais
      // que JÁ carregam sua própria rede (de outro PV de cabeceira) não são sobrescritos: a
      // rede deles continua existindo até aqui, só não segue rio abaixo (ela "desaguou").
      for (const e of entradas) {
        if (redePorTrecho.get(e.id) == null) redePorTrecho.set(e.id, redeAtual)
      }
    }

    const saida = saidaPorCaixa.get(caixaId)
    if (saida && redeAtual != null) {
      redePorTrecho.set(saida.id, redeAtual)
    }
  }

  // Retropropagação: a passada acima só "adota" ramais órfãos que desaguam DIRETO na caixa que
  // acabou de descobrir sua rede (1 hop) -- uma cadeia de 2+ caixas de captação em fila (ex.:
  // CT-19 -> CT-20 -> CT-21 -> PV-21) fica com os trechos do meio (CT-19->CT-20, CT-20->CT-21)
  // sem rede nenhuma, porque quando cada uma delas foi processada (em ordem topológica, sempre
  // antes do PV que só decide ser cabeceira depois) ninguém a montante ainda carregava rede.
  // Aqui, pra cada trecho ainda sem rede, segue a cadeia rio abaixo (pelas próprias saídas) até
  // achar um trecho que já tenha rede, e propaga essa rede de volta pra cadeia inteira -- afinal
  // fisicamente esses trechos deságuam ali de qualquer jeito.
  for (const t of trechos) {
    if (redePorTrecho.get(t.id) != null) continue
    const cadeia: string[] = [t.id]
    const visitados = new Set<string>([t.id])
    let jusanteAtual = resolve(t.jusanteId)
    let proximo = saidaPorCaixa.get(jusanteAtual)
    while (proximo && redePorTrecho.get(proximo.id) == null && !visitados.has(proximo.id)) {
      cadeia.push(proximo.id)
      visitados.add(proximo.id)
      jusanteAtual = resolve(proximo.jusanteId)
      proximo = saidaPorCaixa.get(jusanteAtual)
    }
    const redeFinal = proximo ? redePorTrecho.get(proximo.id) : undefined
    if (redeFinal != null) for (const id of cadeia) redePorTrecho.set(id, redeFinal)
  }

  return { redePorTrecho, redesQueDesaguamPorCaixa }
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
