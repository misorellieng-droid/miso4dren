import type { ManningOrigem, TipoCaixa } from './types'

// Parser do Pipe Network exportado em LandXML pelo Civil 3D. Validado contra
// um export real (Civil 3D 2027): <PipeNetworks><PipeNetwork><Structs>
// <Struct name="..." desc="..." elevRim="..." elevSump="..."><Center>N E</Center> (Northing
// Easting, não X Y -- ver comentário de parsePos)
// <CircStruct diameter="mm"/ ou RectStruct length="m" width="m"/>
// <Invert elev="..." flowDir="in|out" refPipe="..."/></Struct></Structs>
// <Pipes><Pipe name="..." refStart="..." refEnd="..." length="..." slope="...">
// <CircPipe diameter="mm" material="..."/></Pipe></Pipes></PipeNetwork>
// </PipeNetworks>. Não há atributo `type` nem cotas de fundo no próprio
// <Pipe> — o tipo da caixa é inferido do `desc` e as cotas de fundo vêm dos
// <Invert> de cada estrutura, casados pelo nome do tubo (refPipe) e pela
// direção do fluxo (flowDir). Um formato mais "canônico" (<Structures>/
// <Structure type="...">, sub-elementos <Rim>/<Sump>/<Length>/<Slope>) também
// é aceito como fallback, caso uma versão diferente do Civil 3D exporte assim.

export interface CaixaImportada {
  nome: string
  tipo: TipoCaixa
  x?: number
  y?: number
  cotaTerreno?: number
  cotaFundo?: number
  redeNome?: string
  /** Se a caixa pode receber vazão de bacia diretamente — chute inicial pelo
   * tipo inferido (boca de lobo = sim); editável depois em Rede Importada. */
  recebeVazao: boolean
  /** Se a caixa é considerada "rede tronco" (filtro "Só rede tronco" em Rede Pluvial) —
   * chute inicial pelo tipo inferido (PV e boca de lobo = sim; caixa de passagem = não);
   * editável depois em Rede Importada. */
  ehTronco: boolean
}

export interface TrechoImportado {
  nome: string
  caixaMontanteNome: string
  caixaJusanteNome: string
  comprimentoM: number
  diametroM: number
  declividadeMM: number
  material?: string
  manningN: number | null
  manningNOrigem: ManningOrigem
  cotaTopoMontante?: number
  cotaFundoMontante?: number
  cotaTopoJusante?: number
  cotaFundoJusante?: number
  redeNome?: string
}

export interface ResultadoImportLandXml {
  caixas: CaixaImportada[]
  trechos: TrechoImportado[]
}

export interface BaciaImportadaLandXml {
  nome: string
  /** Área do Parcel (m²), já calculada pelo Civil 3D — não recalculamos a partir do polígono. */
  areaM2: number
  /** Um ou mais anéis fechados, na ordem dos vértices — mais de um anel quando o Parcel é
   * composto (união de sub-parcels, ex.: "6_union_1"/"6_union_2" dentro de um <Parcels>
   * aninhado no Civil 3D). Ponto-em-polígono testa contra qualquer um dos anéis (OR). */
  poligonos: { x: number; y: number }[][]
}

function textOf(el: Element | null | undefined): string | undefined {
  const t = el?.textContent?.trim()
  return t ? t : undefined
}

function numOf(el: Element | null | undefined): number | undefined {
  const t = textOf(el)
  if (t === undefined) return undefined
  const n = Number(t)
  return Number.isFinite(n) ? n : undefined
}

function numAttr(el: Element | null | undefined, name: string): number | undefined {
  const v = el?.getAttribute(name)
  if (!v) return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/** Fator de conversão para metros, a partir de <Units><Metric diameterUnit="..."/>. */
function fatorParaMetros(doc: XMLDocument): number {
  const unidade = doc.getElementsByTagName('Metric')[0]?.getAttribute('diameterUnit')
  if (unidade === 'millimeter') return 0.001
  if (unidade === 'centimeter') return 0.01
  return 1
}

function inferirTipoCaixa(tipoAttr: string | null, desc: string | null): TipoCaixa {
  const t = (tipoAttr ?? '').toLowerCase()
  if (t.includes('inlet') || t.includes('catchbasin') || t.includes('boca')) return 'boca_de_lobo'
  if (t.includes('junction') || t.includes('manhole') || t.includes('pv')) return 'pv'

  const d = (desc ?? '').toLowerCase()
  if (d.includes('boca') || d.includes('bl') || d.includes('bueiro')) return 'boca_de_lobo'
  if (d.includes('pv')) return 'pv'
  return 'caixa_passagem'
}

/** Ponto em "N E" -- Northing (metros pra norte) primeiro, Easting (metros pra leste) depois --
 * é a ordem que o LandXML usa em TODOS os pares de coordenada 2D (<Center>, <PipeNetPos>,
 * <Start>/<End> de CoordGeom), tanto no Pipe Network quanto nos Parcels. Fácil de confundir com
 * "X Y" (Easting primeiro) por ser a ordem mais comum em outros formatos GIS -- errar aqui não
 * quebra nada visivelmente óbvio, só deixa o desenho (RedeDiagrama/PlantaChave, que assumem
 * x=Easting/horizontal e y=Northing/vertical) espelhado e rotacionado em relação ao CAD. x =
 * Easting (2º número), y = Northing (1º número). */
function parsePos(text: string | undefined): { x: number; y: number } | undefined {
  if (!text) return undefined
  const parts = text.trim().split(/\s+/).map(Number)
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return undefined
  return { x: parts[1], y: parts[0] }
}

/** Aceita <Center>X Y</Center> direto ou <Center><PipeNetPos>X Y</PipeNetPos></Center>. */
function centerPos(center: Element | undefined): { x: number; y: number } | undefined {
  if (!center) return undefined
  const nested = center.getElementsByTagName('PipeNetPos')[0]
  return parsePos(textOf(nested) ?? textOf(center))
}

function distancia(a?: { x: number; y: number }, b?: { x: number; y: number }): number | undefined {
  if (!a || !b) return undefined
  return Math.hypot(b.x - a.x, b.y - a.y)
}

interface InvertInfo {
  elev: number
  flowDir: string
  refPipe: string
}

export function parseLandXml(xmlText: string, materiaisManning: Map<string, number>): ResultadoImportLandXml {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')

  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) {
    throw new Error('LandXML inválido: ' + (parseError.textContent ?? 'erro de parsing'))
  }

  const fatorDiametro = fatorParaMetros(doc)
  const caixas: CaixaImportada[] = []
  const trechos: TrechoImportado[] = []
  const posPorNome = new Map<string, { x: number; y: number }>()
  const invertsPorEstrutura = new Map<string, InvertInfo[]>()

  // Um LandXML pode trazer mais de um <PipeNetwork> (redes que se conectam entre si —
  // um trecho de uma rede descarrega numa caixa de outra). Cada Struct/Pipe é tageado
  // com o nome da rede (<PipeNetwork name="...">) a que pertence. Se não houver esse
  // agrupamento no arquivo, trata o documento inteiro como uma rede sem nome.
  const networkEls = Array.from(doc.getElementsByTagName('PipeNetwork'))
  const escopos: Array<{ el: Element | XMLDocument; redeNome: string | undefined }> =
    networkEls.length > 0 ? networkEls.map((el) => ({ el, redeNome: el.getAttribute('name') ?? undefined })) : [{ el: doc, redeNome: undefined }]

  for (const { el: escopo, redeNome } of escopos) {
    const structEls = [...Array.from(escopo.getElementsByTagName('Struct')), ...Array.from(escopo.getElementsByTagName('Structure'))]
    for (const s of structEls) {
      const nome = s.getAttribute('name') ?? s.getAttribute('desc') ?? ''
      if (!nome) continue

      const pos = centerPos(s.getElementsByTagName('Center')[0])
      if (pos) posPorNome.set(nome, pos)

      const rim = s.getElementsByTagName('Rim')[0]
      const sump = s.getElementsByTagName('Sump')[0]
      const cotaTerreno = numAttr(s, 'elevRim') ?? numAttr(rim, 'elevation')
      const cotaFundo = numAttr(s, 'elevSump') ?? numAttr(sump, 'elevation')

      const tipo = inferirTipoCaixa(s.getAttribute('type'), s.getAttribute('desc'))
      caixas.push({
        nome,
        tipo,
        x: pos?.x,
        y: pos?.y,
        cotaTerreno,
        cotaFundo,
        redeNome,
        recebeVazao: tipo === 'boca_de_lobo',
        ehTronco: tipo === 'pv' || tipo === 'boca_de_lobo',
      })

      const inverts: InvertInfo[] = []
      for (const inv of Array.from(s.getElementsByTagName('Invert'))) {
        const elev = numAttr(inv, 'elev')
        const flowDir = inv.getAttribute('flowDir') ?? ''
        const refPipe = inv.getAttribute('refPipe') ?? ''
        if (elev !== undefined && refPipe) inverts.push({ elev, flowDir, refPipe })
      }
      if (inverts.length > 0) invertsPorEstrutura.set(nome, inverts)
    }
  }

  for (const { el: escopo, redeNome } of escopos) {
    const pipeEls = Array.from(escopo.getElementsByTagName('Pipe'))
    for (const p of pipeEls) {
    const nome = p.getAttribute('name') ?? p.getAttribute('desc') ?? ''
    const caixaMontanteNome = p.getAttribute('refStart') ?? ''
    const caixaJusanteNome = p.getAttribute('refEnd') ?? ''
    if (!nome || !caixaMontanteNome || !caixaJusanteNome) continue

    const circular = p.getElementsByTagName('CircPipe')[0] ?? p.getElementsByTagName('CircularPipe')[0]
    const diametroM = (numAttr(circular, 'diameter') ?? numAttr(p, 'diameter') ?? 0) * fatorDiametro

    const startPos = parsePos(textOf(p.getElementsByTagName('Start')[0]?.getElementsByTagName('PipeNetPos')[0]))
    const endPos = parsePos(textOf(p.getElementsByTagName('End')[0]?.getElementsByTagName('PipeNetPos')[0]))

    const comprimentoM =
      numAttr(p, 'length') ??
      numOf(p.getElementsByTagName('Length')[0]) ??
      distancia(startPos, endPos) ??
      distancia(posPorNome.get(caixaMontanteNome), posPorNome.get(caixaJusanteNome)) ??
      0

    // Formato "canônico": cotas de fundo no próprio <Pipe><Invert start=".." end=".."/>.
    // Formato real do Civil 3D: cotas de fundo nos <Invert> de cada <Struct>,
    // casados pelo nome do tubo (refPipe) e pela direção do fluxo.
    const invertPipe = p.getElementsByTagName('Invert')[0]
    let cotaFundoMontante = numAttr(invertPipe, 'start')
    let cotaFundoJusante = numAttr(invertPipe, 'end')
    if (cotaFundoMontante === undefined) {
      cotaFundoMontante = invertsPorEstrutura
        .get(caixaMontanteNome)
        ?.find((i) => i.refPipe === nome && i.flowDir === 'out')?.elev
    }
    if (cotaFundoJusante === undefined) {
      cotaFundoJusante = invertsPorEstrutura
        .get(caixaJusanteNome)
        ?.find((i) => i.refPipe === nome && i.flowDir === 'in')?.elev
    }

    const cotaTopoMontante = cotaFundoMontante !== undefined ? cotaFundoMontante + diametroM : undefined
    const cotaTopoJusante = cotaFundoJusante !== undefined ? cotaFundoJusante + diametroM : undefined

    const declividadeExplicita = numAttr(p, 'slope') ?? numOf(p.getElementsByTagName('Slope')[0])
    const declividadeMM =
      declividadeExplicita ??
      (cotaFundoMontante !== undefined && cotaFundoJusante !== undefined && comprimentoM > 0
        ? Math.abs(cotaFundoMontante - cotaFundoJusante) / comprimentoM
        : 0)

    const material = circular?.getAttribute('material') ?? p.getAttribute('material') ?? undefined

    const manningExplicito =
      numAttr(circular, 'roughness') ?? numAttr(p, 'roughness') ?? numOf(p.getElementsByTagName('ManningsN')[0])

    let manningN: number | null
    let manningNOrigem: ManningOrigem
    if (manningExplicito !== undefined) {
      manningN = manningExplicito
      manningNOrigem = 'landxml'
    } else {
      const daTabela = material ? materiaisManning.get(material.toUpperCase()) : undefined
      if (daTabela !== undefined) {
        manningN = daTabela
        manningNOrigem = 'tabela_interna'
      } else {
        manningN = null
        manningNOrigem = 'manual'
      }
    }

      trechos.push({
        nome,
        caixaMontanteNome,
        caixaJusanteNome,
        comprimentoM,
        diametroM,
        declividadeMM,
        material,
        manningN,
        manningNOrigem,
        cotaTopoMontante,
        cotaFundoMontante,
        cotaTopoJusante,
        cotaFundoJusante,
        redeNome,
      })
    }
  }

  return { caixas, trechos }
}

/** Extrai o anel de um Parcel "simples" (CoordGeom direto ou dentro de um <Boundary>). */
function extrairAnelSimples(p: Element): { x: number; y: number }[] {
  const coordGeom = p.getElementsByTagName('CoordGeom')[0]
  const segmentos = coordGeom
    ? Array.from(coordGeom.children).filter((el) => el.tagName === 'Line' || el.tagName === 'Curve')
    : []

  const anel: { x: number; y: number }[] = []
  for (const seg of segmentos) {
    const start = parsePos(textOf(seg.getElementsByTagName('Start')[0]))
    if (start) anel.push(start)
  }
  const ultimo = segmentos[segmentos.length - 1]
  const fim = ultimo ? parsePos(textOf(ultimo.getElementsByTagName('End')[0])) : undefined
  if (fim && (anel.length === 0 || fim.x !== anel[0].x || fim.y !== anel[0].y)) {
    anel.push(fim)
  }
  return anel
}

/** Um ou mais anéis: um Parcel "composto" (união de sub-parcels) tem um <Parcels> aninhado
 * como filho direto em vez de um CoordGeom próprio — cada sub-Parcel dentro dele vira um anel. */
function extrairAneisDoParcel(p: Element): { x: number; y: number }[][] {
  const parcelsAninhado = Array.from(p.children).find((c) => c.tagName === 'Parcels')
  if (parcelsAninhado) {
    return Array.from(parcelsAninhado.children)
      .filter((c) => c.tagName === 'Parcel')
      .map(extrairAnelSimples)
      .filter((anel) => anel.length >= 3)
  }
  const anel = extrairAnelSimples(p)
  return anel.length >= 3 ? [anel] : []
}

/**
 * Parser do Parcel exportado em LandXML pelo Civil 3D (grupo de bacias/lotes
 * desenhados como polilinha fechada). Validado contra um export real (Civil
 * 3D 2027): <Parcels name="..."><Parcel name="..." area="..." desc="...">
 * <CoordGeom><Line dir="..." length="..."><Start>N E</Start><End>N E</End>
 * </Line>...<Curve>...</Curve>...</CoordGeom></Parcel></Parcels> — sem
 * elemento <Boundary> envolvendo o CoordGeom (diferente do que a doc do
 * schema LandXML sugere). Curvas são aproximadas pela corda (Start-End) —
 * suficiente pra teste ponto-em-polígono, que não precisa da curvatura exata.
 *
 * Um Parcel "composto" (formado unindo dois ou mais desenhos no Civil 3D) não
 * traz CoordGeom próprio — em vez disso tem um <Parcels> ANINHADO com um
 * sub-Parcel por pedaço original (ex.: "6_union_1"/"6_union_2"), cada um com
 * seu próprio anel fechado e SEM atributo `area`. Só os Parcels de nível
 * raiz (filhos diretos do <Parcels> do documento, não de um <Parcel>) contam
 * como bacia — os sub-Parcels da união viram os anéis extras dessa bacia.
 */
export function parseLandXmlParcels(xmlText: string): { bacias: BaciaImportadaLandXml[] } {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')

  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) {
    throw new Error('LandXML inválido: ' + (parseError.textContent ?? 'erro de parsing'))
  }

  const bacias: BaciaImportadaLandXml[] = []
  const gruposRaiz = Array.from(doc.getElementsByTagName('Parcels')).filter((el) => el.parentElement?.tagName !== 'Parcel')
  const parcelEls = gruposRaiz.flatMap((g) => Array.from(g.children).filter((c) => c.tagName === 'Parcel'))

  for (const p of parcelEls) {
    const nome = p.getAttribute('name') ?? ''
    const areaM2 = numAttr(p, 'area')
    if (!nome || areaM2 === undefined) continue

    const poligonos = extrairAneisDoParcel(p)
    if (poligonos.length === 0) continue // sem contorno utilizável — ignora o Parcel

    bacias.push({ nome, areaM2, poligonos })
  }

  return { bacias }
}
