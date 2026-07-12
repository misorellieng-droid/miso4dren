import type { ManningOrigem, TipoCaixa } from './types'

// Parser do Pipe Network exportado em LandXML pelo Civil 3D. O schema alvo
// segue o formato usual desse export (<PipeNetworks><PipeNetwork><Structures>
// <Structure>...</Structure></Structures><Pipes><Pipe>...</Pipe></Pipes>
// </PipeNetwork></PipeNetworks>), mas variações de nomenclatura entre
// versões do Civil 3D são esperadas — ajustar os seletores abaixo (função
// `primeiroValor`/`primeiroAtributo`) contra um export real antes de usar em
// produção.

export interface CaixaImportada {
  nome: string
  tipo: TipoCaixa
  x?: number
  y?: number
  cotaTerreno?: number
  cotaFundo?: number
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

function inferirTipoCaixa(structureType: string | null): TipoCaixa {
  const t = (structureType ?? '').toLowerCase()
  if (t.includes('inlet') || t.includes('catchbasin') || t.includes('boca')) return 'boca_de_lobo'
  if (t.includes('junction') || t.includes('manhole') || t.includes('pv')) return 'pv'
  return 'caixa_passagem'
}

/** Distância entre dois pontos "x y" (formato PipeNetPos do LandXML). */
function parsePos(text: string | undefined): { x: number; y: number } | undefined {
  if (!text) return undefined
  const parts = text.trim().split(/\s+/).map(Number)
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n))) return undefined
  return { x: parts[0], y: parts[1] }
}

function distancia(a?: { x: number; y: number }, b?: { x: number; y: number }): number | undefined {
  if (!a || !b) return undefined
  return Math.hypot(b.x - a.x, b.y - a.y)
}

export function parseLandXml(xmlText: string, materiaisManning: Map<string, number>): ResultadoImportLandXml {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlText, 'application/xml')

  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) {
    throw new Error('LandXML inválido: ' + (parseError.textContent ?? 'erro de parsing'))
  }

  const caixas: CaixaImportada[] = []
  const trechos: TrechoImportado[] = []

  const structureEls = Array.from(doc.getElementsByTagName('Structure'))
  for (const s of structureEls) {
    const nome = s.getAttribute('name') ?? s.getAttribute('desc') ?? ''
    if (!nome) continue

    const center = s.getElementsByTagName('Center')[0]
    const pos = parsePos(textOf(center?.getElementsByTagName('PipeNetPos')[0]))
    const rim = s.getElementsByTagName('Rim')[0]
    const sump = s.getElementsByTagName('Sump')[0]

    caixas.push({
      nome,
      tipo: inferirTipoCaixa(s.getAttribute('type')),
      x: pos?.x,
      y: pos?.y,
      cotaTerreno: numAttr(rim, 'elevation'),
      cotaFundo: numAttr(sump, 'elevation'),
    })
  }

  const pipeEls = Array.from(doc.getElementsByTagName('Pipe'))
  for (const p of pipeEls) {
    const nome = p.getAttribute('name') ?? p.getAttribute('desc') ?? ''
    const caixaMontanteNome = p.getAttribute('refStart') ?? ''
    const caixaJusanteNome = p.getAttribute('refEnd') ?? ''
    if (!nome || !caixaMontanteNome || !caixaJusanteNome) continue

    const circular = p.getElementsByTagName('CircularPipe')[0]
    const diametroM = numAttr(circular, 'diameter') ?? numAttr(p, 'diameter') ?? 0

    const startPos = parsePos(textOf(p.getElementsByTagName('Start')[0]?.getElementsByTagName('PipeNetPos')[0]))
    const endPos = parsePos(textOf(p.getElementsByTagName('End')[0]?.getElementsByTagName('PipeNetPos')[0]))

    const comprimentoM = numOf(p.getElementsByTagName('Length')[0]) ?? distancia(startPos, endPos) ?? 0

    const invert = p.getElementsByTagName('Invert')[0]
    const cotaFundoMontante = numAttr(invert, 'start')
    const cotaFundoJusante = numAttr(invert, 'end')
    const cotaTopoMontante = cotaFundoMontante !== undefined ? cotaFundoMontante + diametroM : undefined
    const cotaTopoJusante = cotaFundoJusante !== undefined ? cotaFundoJusante + diametroM : undefined

    const declividadeExplicita = numOf(p.getElementsByTagName('Slope')[0])
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
    })
  }

  return { caixas, trechos }
}
