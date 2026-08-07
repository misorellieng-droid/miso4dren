import type { ItemBiblioteca } from '../lib/bibliotecaStorage'
import type { CaixaRecord, TrechoRecord } from '../lib/redeStorage'
import { cotaFundoEstruturaConectada } from './landxmlCotas'

const TOLERANCIA_DIAMETRO_M = 0.001

/** Acha o item certo (espessura de parede + nome da peça) pro material+diâmetro na
 * biblioteca de peças (ver bibliotecaStorage.ts) — precisa bater exato (dentro de 1mm)
 * com o catálogo real do Civil 3D, senão a troca de diâmetro na reimportação é recusada. */
function acharItemNaBiblioteca(biblioteca: ItemBiblioteca[], material: string | null, diametroM: number): ItemBiblioteca | null {
  return (
    biblioteca.find(
      (i) => i.material.toUpperCase() === (material ?? '').toUpperCase() && Math.abs(i.diametro_m - diametroM) < TOLERANCIA_DIAMETRO_M
    ) ?? null
  )
}

function fmt(n: number): string {
  return Number(n.toFixed(6)).toString()
}

/** Mesmo critério de conversão de unidade do parser de importação (landxml.ts). */
function fatorParaMetros(doc: XMLDocument): number {
  const unidade = doc.getElementsByTagName('Metric')[0]?.getAttribute('diameterUnit')
  if (unidade === 'millimeter') return 0.001
  if (unidade === 'centimeter') return 0.01
  return 1
}

function setCota(struct: Element, attrName: 'elevRim' | 'elevSump', nestedTag: 'Rim' | 'Sump', valor: number) {
  if (struct.hasAttribute(attrName)) {
    struct.setAttribute(attrName, fmt(valor))
    return
  }
  const nested = struct.getElementsByTagName(nestedTag)[0]
  if (nested) nested.setAttribute('elevation', fmt(valor))
}

function setCenterTexto(struct: Element, x: number, y: number) {
  const center = struct.getElementsByTagName('Center')[0]
  if (!center) return
  const nested = center.getElementsByTagName('PipeNetPos')[0]
  const alvo = nested ?? center
  // "N E" (Northing Easting) -- mesma ordem que parseLandXml lê (ver parsePos em landxml.ts) e
  // que o Civil 3D espera de volta; x é Easting, y é Northing, então escreve y antes de x.
  alvo.textContent = `${fmt(y)} ${fmt(x)}`
}

function setPipeLength(pipe: Element, valor: number) {
  if (pipe.hasAttribute('length')) {
    pipe.setAttribute('length', fmt(valor))
    return
  }
  const nested = pipe.getElementsByTagName('Length')[0]
  if (nested) nested.textContent = fmt(valor)
}

function setPipeSlope(pipe: Element, valor: number) {
  if (pipe.hasAttribute('slope')) {
    pipe.setAttribute('slope', fmt(valor))
    return
  }
  const nested = pipe.getElementsByTagName('Slope')[0]
  if (nested) nested.textContent = fmt(valor)
}

function setPipeManning(pipe: Element, circular: Element | undefined, valor: number) {
  if (circular?.hasAttribute('roughness')) {
    circular.setAttribute('roughness', fmt(valor))
    return
  }
  if (pipe.hasAttribute('roughness')) {
    pipe.setAttribute('roughness', fmt(valor))
    return
  }
  const nested = pipe.getElementsByTagName('ManningsN')[0]
  if (nested) nested.textContent = fmt(valor)
  // se nenhum dos três existir no original (manning veio da tabela interna, não do
  // XML), não adiciona nada novo — evita introduzir um override que não existia
}

/**
 * Edita só os campos alterados no app DENTRO do LandXML original importado, em vez
 * de gerar um arquivo novo do zero (landxmlExport.ts) — preserva tudo que o app não
 * edita e o Civil 3D precisa pra reimportar sem erro (geometria da própria estrutura
 * via CircStruct/RectStruct, desc, atributos que o parser de importação nem lê).
 * Casa Struct/Pipe/Invert pelo nome (name/refPipe), igual o parser de importação faz.
 */
export function patchXmlOriginal(
  xmlOriginal: string,
  caixas: CaixaRecord[],
  trechos: TrechoRecord[],
  biblioteca: ItemBiblioteca[] = []
): string {
  const parser = new DOMParser()
  const doc = parser.parseFromString(xmlOriginal, 'application/xml')
  const parseError = doc.getElementsByTagName('parsererror')[0]
  if (parseError) {
    throw new Error('LandXML original inválido: ' + (parseError.textContent ?? 'erro de parsing'))
  }

  const fatorDiametro = fatorParaMetros(doc)
  const caixaPorNome = new Map(caixas.map((c) => [c.nome, c]))
  const trechoPorNome = new Map(trechos.map((t) => [t.nome, t]))

  const structEls = [...Array.from(doc.getElementsByTagName('Struct')), ...Array.from(doc.getElementsByTagName('Structure'))]
  for (const s of structEls) {
    const nome = s.getAttribute('name') ?? s.getAttribute('desc') ?? ''
    const caixa = caixaPorNome.get(nome)
    if (!caixa) continue

    if (caixa.cota_terreno != null) setCota(s, 'elevRim', 'Rim', caixa.cota_terreno)
    const cotaFundoReal = cotaFundoEstruturaConectada(caixa.id, caixa.cota_fundo, trechos)
    if (cotaFundoReal != null) setCota(s, 'elevSump', 'Sump', cotaFundoReal)
    if (caixa.x != null && caixa.y != null) setCenterTexto(s, caixa.x, caixa.y)

    for (const inv of Array.from(s.getElementsByTagName('Invert'))) {
      const refPipe = inv.getAttribute('refPipe') ?? ''
      const flowDir = inv.getAttribute('flowDir') ?? ''
      const trecho = trechoPorNome.get(refPipe)
      if (!trecho) continue
      if (flowDir === 'out' && trecho.caixa_montante_id === caixa.id && trecho.cota_fundo_montante != null) {
        inv.setAttribute('elev', fmt(trecho.cota_fundo_montante))
      } else if (flowDir === 'in' && trecho.caixa_jusante_id === caixa.id && trecho.cota_fundo_jusante != null) {
        inv.setAttribute('elev', fmt(trecho.cota_fundo_jusante))
      }
    }
  }

  const pipeEls = Array.from(doc.getElementsByTagName('Pipe'))
  for (const p of pipeEls) {
    const nome = p.getAttribute('name') ?? p.getAttribute('desc') ?? ''
    const trecho = trechoPorNome.get(nome)
    if (!trecho) continue

    setPipeLength(p, trecho.comprimento_m)
    setPipeSlope(p, trecho.declividade_m_m)

    const circular = p.getElementsByTagName('CircPipe')[0] ?? p.getElementsByTagName('CircularPipe')[0]
    if (circular) {
      const diametroOriginalAttr = circular.getAttribute('diameter')
      const diametroOriginalM = diametroOriginalAttr != null ? Number(diametroOriginalAttr) * fatorDiametro : null
      const diametroMudou = diametroOriginalM == null || Math.abs(diametroOriginalM - trecho.diametro_m) > 1e-6

      circular.setAttribute('diameter', fmt(trecho.diametro_m / fatorDiametro))
      if (trecho.material) circular.setAttribute('material', trecho.material)

      // "thickness" (espessura de parede) e o "Part Size Name" (ex.: "BSTC DN 0,60 m",
      // gravado no `desc` do <Pipe> -- ver abaixo) são atrelados ao diâmetro no catálogo
      // de peças do Civil 3D -- manter os do diâmetro ANTIGO junto com o diâmetro NOVO
      // trava numa combinação sem peça de catálogo correspondente ("Part Family... found,
      // but an exact match... was not"), e o Civil mantém o tubo com o diâmetro antigo em
      // vez de aplicar o novo. Quando o diâmetro muda, busca o item EXATO do catálogo
      // (biblioteca_pecas, cadastrada a partir do Parts List real do Civil 3D do usuário)
      // pro tamanho novo. thickness é sempre em metros (linearUnit), não sofre a conversão
      // de unidade do atributo diameter (diameterUnit).
      if (diametroMudou) {
        const item = acharItemNaBiblioteca(biblioteca, trecho.material, trecho.diametro_m)
        if (item?.espessura_parede_m != null) {
          circular.setAttribute('thickness', fmt(item.espessura_parede_m))
        } else if (circular.hasAttribute('thickness')) {
          circular.removeAttribute('thickness')
        }
        // desc do <Pipe> é o "Part Size Name" do Civil 3D (ex.: "BSTC DN 0,60 m") -- nunca
        // mexe no `name` (identificador que casa o Pipe com o trecho aqui e no próprio
        // Civil), só no desc, que é rótulo/descrição.
        if (item?.nome_peca) p.setAttribute('desc', item.nome_peca)
      }
    }
    if (trecho.manning_n != null) setPipeManning(p, circular, trecho.manning_n)
  }

  const declaracao = xmlOriginal.match(/^<\?xml[^>]*\?>/)?.[0] ?? '<?xml version="1.0"?>'
  const serializado = new XMLSerializer().serializeToString(doc)
  return serializado.startsWith('<?xml') ? serializado : `${declaracao}\n${serializado}`
}
