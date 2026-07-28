import type { ManningOrigem, TipoCaixa } from './types'

// Parser do Pipe Network exportado em LandXML pelo Civil 3D. Validado contra
// um export real (Civil 3D 2027): <PipeNetworks><PipeNetwork><Structs>
// <Struct name="..." desc="..." elevRim="..." elevSump="..."><Center>X Y</Center>
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

/** Distância entre dois pontos "x y" (formato do texto de <Center> ou <PipeNetPos>). */
function parsePos(text: string | undefined): { x: number; y: number } | undefined {
  if (!text) return undefined
  const parts = text.trim().split(/\s+/).map(Number)
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return undefined
  return { x: parts[0], y: parts[1] }
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
