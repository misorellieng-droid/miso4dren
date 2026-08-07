export interface CaixaDiagramaSvg {
  id: string
  x: number | null
  y: number | null
}

export interface TrechoDiagramaSvg {
  id: string
  caixa_montante_id: string
  caixa_jusante_id: string
}

const COR_VERDE = '#16a34a'
const COR_VERMELHO = '#dc2626'
const COR_CINZA = '#6b7280'
const COR_AMBAR = '#d97706'
const COR_AZUL = '#3498db'

const W = 1000
const PAD = 30

/**
 * Versão estática (sem interatividade, sem classes Tailwind — cores em hex fixo) do diagrama de
 * plano da rede (ver RedeDiagrama.tsx), pra rasterizar e embutir no relatório completo em PDF.
 * Mesma geometria/paleta do componente em tela: posiciona pelas coordenadas reais (X/Y), Norte
 * pra cima, trechos coloridos por conformidade, cabeceiras/saídas destacadas. `null` quando
 * nenhuma caixa tem coordenada cadastrada (nada pra desenhar).
 */
export function gerarSvgDiagrama(
  caixas: CaixaDiagramaSvg[],
  trechos: TrechoDiagramaSvg[],
  conformidadePorTrecho: Map<string, boolean | null>
): string | null {
  const validas = caixas.filter((c) => c.x != null && c.y != null)
  if (validas.length === 0) return null

  const xs = validas.map((c) => c.x as number)
  const ys = validas.map((c) => c.y as number)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const larguraM = maxX - minX || 1
  const alturaM = maxY - minY || 1
  const H = Math.max(300, (alturaM / larguraM) * W)

  const pontos = new Map<string, { x: number; y: number }>()
  for (const c of validas) {
    const px = PAD + ((c.x! - minX) / larguraM) * (W - 2 * PAD)
    // Y do UTM cresce pra norte; SVG cresce pra baixo — inverte pra manter norte em cima (mesmo
    // critério do componente em tela).
    const py = PAD + (1 - (c.y! - minY) / alturaM) * (H - 2 * PAD)
    pontos.set(c.id, { x: px, y: py })
  }

  const idsComEntrada = new Set(trechos.map((t) => t.caixa_jusante_id))
  const idsComSaida = new Set(trechos.map((t) => t.caixa_montante_id))

  const linhasSvg = trechos
    .map((t) => {
      const a = pontos.get(t.caixa_montante_id)
      const b = pontos.get(t.caixa_jusante_id)
      if (!a || !b) return ''
      const conforme = conformidadePorTrecho.get(t.id) ?? undefined
      const cor = conforme === undefined ? COR_CINZA : conforme ? COR_VERDE : COR_VERMELHO
      return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${cor}" stroke-width="1.4" />`
    })
    .join('')

  const circulosSvg = [...pontos.entries()]
    .map(([id, p]) => {
      const cabeceira = !idsComEntrada.has(id)
      const saida = !idsComSaida.has(id)
      const raio = cabeceira || saida ? 4.5 : 2.5
      const cor = saida ? COR_AZUL : cabeceira ? COR_AMBAR : COR_CINZA
      return `<circle cx="${p.x}" cy="${p.y}" r="${raio}" fill="${cor}" />`
    })
    .join('')

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />` +
    linhasSvg +
    circulosSvg +
    `</svg>`
  )
}

export interface ImagemRasterizada {
  dataUrl: string
  /** Largura/altura ORIGINAIS da SVG (não multiplicadas por `escala`) -- é o que define a
   * proporção pra desenhar a imagem num tamanho físico no PDF (doc.addImage aceita a imagem em
   * resolução maior que o tamanho físico exibido, sem distorcer). */
  larguraOriginal: number
  alturaOriginal: number
}

/**
 * Rasteriza a SVG estática (ver gerarSvgDiagrama) pra um PNG data URL, via canvas -- é assim que
 * o diagrama entra no PDF (jsPDF não desenha SVG diretamente, só imagem raster). `escala` > 1
 * aumenta a resolução (nitidez) da imagem embutida sem mudar o tamanho físico no PDF. Só funciona
 * no browser (usa Image/canvas do DOM) -- não é testável em vitest/jsdom, mantido separado de
 * gerarSvgDiagrama (essa sim pura e testada) por isso.
 */
export function rasterizarSvgParaPngDataUrl(svg: string, escala = 2): Promise<ImagemRasterizada> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const larguraOriginal = img.width
      const alturaOriginal = img.height
      const canvas = document.createElement('canvas')
      canvas.width = larguraOriginal * escala
      canvas.height = alturaOriginal * escala
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('Canvas 2D não suportado neste navegador.'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve({ dataUrl: canvas.toDataURL('image/png'), larguraOriginal, alturaOriginal })
    }
    img.onerror = () => reject(new Error('Falha ao rasterizar o diagrama da rede.'))
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  })
}
