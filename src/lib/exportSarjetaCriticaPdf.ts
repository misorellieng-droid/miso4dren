import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { MemorialCalculoSarjeta, ModoDeclividade } from '../engine/sarjeta'

/** Espelha os campos numéricos do formulário no momento do cálculo — usado tanto no memorial em tela quanto no PDF. */
export interface ParametrosExibicaoCritica {
  y0M: number
  larguraSarjetaM: number
  declividadeTransversalVia: number // decimal (m/m)
  declividadeTransversalSarjeta: number // decimal (m/m)
  larguraImpluvioM: number
  manningN: number
  coefC: number
  tcMin: number
  modoDeclividade: ModoDeclividade
  velocidadeMinimaMs?: number
}

export interface DadosSarjetaCriticaPdf {
  nomeVia: string
  projetoNome: string
  revisaoNome: string
  equacaoNome: string | null
  tempoRetornoAnos: number
  intensidadeMmH: number
  parametros: ParametrosExibicaoCritica
  memorial: MemorialCalculoSarjeta
}

const BRAND_RGB: [number, number, number] = [240, 102, 26]
const CINZA_RGB: [number, number, number] = [90, 90, 90]
const PAGE_HEIGHT_PT = 842
const MARGIN_X = 40
const MARGIN_BOTTOM = 55

const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—')
const pct = (n: number, digits = 3) => `${(n * 100).toFixed(digits)}%`

interface Cursor {
  y: number
}

function garantirEspaco(doc: jsPDF, cursor: Cursor, necessarioPt: number) {
  if (cursor.y + necessarioPt > PAGE_HEIGHT_PT - MARGIN_BOTTOM) {
    doc.addPage()
    cursor.y = 55
  }
}

function tituloSecao(doc: jsPDF, cursor: Cursor, texto: string) {
  garantirEspaco(doc, cursor, 30)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(...BRAND_RGB)
  doc.text(texto, MARGIN_X, cursor.y)
  doc.setDrawColor(...BRAND_RGB)
  doc.setLineWidth(0.75)
  doc.line(MARGIN_X, cursor.y + 4, 555, cursor.y + 4)
  doc.setTextColor(20, 20, 20)
  cursor.y += 20
}

function subtitulo(doc: jsPDF, cursor: Cursor, texto: string) {
  garantirEspaco(doc, cursor, 18)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10.5)
  doc.setTextColor(20, 20, 20)
  doc.text(texto, MARGIN_X, cursor.y)
  cursor.y += 15
}

function linhaFormula(doc: jsPDF, cursor: Cursor, texto: string, indent = 12) {
  garantirEspaco(doc, cursor, 13)
  doc.setFont('courier', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(40, 40, 40)
  doc.text(texto, MARGIN_X + indent, cursor.y)
  cursor.y += 13
}

function paragrafo(doc: jsPDF, cursor: Cursor, texto: string) {
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(60, 60, 60)
  const linhas = doc.splitTextToSize(texto, 515)
  garantirEspaco(doc, cursor, linhas.length * 12 + 4)
  doc.text(linhas, MARGIN_X, cursor.y)
  cursor.y += linhas.length * 12 + 6
}

function blocoResultadoFinal(doc: jsPDF, cursor: Cursor, memorial: MemorialCalculoSarjeta, intensidadeMmH: number) {
  garantirEspaco(doc, cursor, 62)
  doc.setDrawColor(220, 220, 220)
  doc.setFillColor(250, 246, 240)
  const alturaBox = 48
  doc.roundedRect(MARGIN_X, cursor.y, 515, alturaBox, 3, 3, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(20, 20, 20)
  doc.text(`Comprimento crítico = ${fmt(memorial.comprimentoCriticoM, 2)} m`, MARGIN_X + 10, cursor.y + 16)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(60, 60, 60)
  doc.text(
    `Rh = ${fmt(memorial.raioHidraulicoM, 5)} m   Velocidade = ${fmt(memorial.velocidadeMs, 4)} m/s   Vazão = ${fmt(memorial.vazaoM3s, 6)} m³/s`,
    MARGIN_X + 10,
    cursor.y + 31
  )
  doc.text(
    `Declividade longitudinal = ${pct(memorial.declividadeLongitudinalMM, 4)}   Intensidade = ${fmt(intensidadeMmH, 2)} mm/h`,
    MARGIN_X + 10,
    cursor.y + 44
  )
  cursor.y += alturaBox + 18
}

/** Memória de cálculo completa, ponto a ponto — layout formatado pra impressão/anexo de projeto. */
export function exportSarjetaCriticaPdf(data: DadosSarjetaCriticaPdf): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const cursor: Cursor = { y: 55 }
  const { parametros: p, memorial } = data

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(20, 20, 20)
  doc.text('Memória de Cálculo — Sarjeta Crítica', MARGIN_X, cursor.y)
  cursor.y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...CINZA_RGB)
  doc.text(`${data.projetoNome} — ${data.revisaoNome} — Via: ${data.nomeVia}`, MARGIN_X, cursor.y)
  cursor.y += 13
  doc.text(
    `Equação IDF: ${data.equacaoNome ?? '—'}   ·   Tempo de retorno: ${data.tempoRetornoAnos} anos   ·   Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
    MARGIN_X,
    cursor.y
  )
  cursor.y += 22

  tituloSecao(doc, cursor, '1. Dados de entrada')
  autoTable(doc, {
    startY: cursor.y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [['Parâmetro', 'Valor']],
    body: [
      ['Y0 — altura limite da lâmina d’água', `${fmt(p.y0M, 3)} m`],
      ['Largura da sarjeta', `${fmt(p.larguraSarjetaM, 2)} m`],
      ['Declividade transversal da via (Sx)', pct(p.declividadeTransversalVia, 2)],
      ['Declividade transversal da sarjeta (Sw)', pct(p.declividadeTransversalSarjeta, 2)],
      ['Largura do impluvio', `${fmt(p.larguraImpluvioM, 2)} m`],
      ['Manning n', fmt(p.manningN, 4)],
      ['Coeficiente de escoamento C', fmt(p.coefC, 2)],
      ['Tc — tempo de concentração', `${fmt(p.tcMin, 2)} min`],
      ['Modo de declividade longitudinal', p.modoDeclividade === 'velocidade_minima' ? 'Calculada (velocidade mínima)' : 'Informada diretamente'],
      ...(p.modoDeclividade === 'velocidade_minima' ? [['Velocidade mínima de autolimpeza', `${fmt(p.velocidadeMinimaMs ?? 0, 3)} m/s`]] : []),
    ],
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: BRAND_RGB },
    columnStyles: { 0: { cellWidth: 260 } },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor.y = (doc as any).lastAutoTable.finalY + 20

  tituloSecao(doc, cursor, '2. Geometria da sarjeta (seção composta via + calha)')
  paragrafo(doc, cursor, 'Dois planos de declividade transversal (Sx da via, Sw da própria sarjeta) — área e perímetro pela composição HEC-22.')
  linhaFormula(doc, cursor, `A = ${fmt(memorial.areaMolhadaM2, 5)} m2`)
  linhaFormula(doc, cursor, `P = ${fmt(memorial.perimetroMolhadoM, 4)} m`)
  linhaFormula(doc, cursor, `Rh = A / P = ${fmt(memorial.raioHidraulicoM, 5)} m`)
  cursor.y += 6

  tituloSecao(doc, cursor, '3. Declividade longitudinal')
  if (p.modoDeclividade === 'velocidade_minima') {
    linhaFormula(doc, cursor, 'S = (V x n / Rh^(2/3))^2')
    linhaFormula(
      doc,
      cursor,
      `S = (${fmt(p.velocidadeMinimaMs ?? 0, 3)} x ${fmt(p.manningN, 4)} / ${fmt(memorial.raioHidraulicoElevadoDoisTercos, 5)})^2 = ${pct(memorial.declividadeLongitudinalMM, 4)}`
    )
  } else {
    linhaFormula(doc, cursor, `S = ${pct(memorial.declividadeLongitudinalMM, 4)} (informada diretamente)`)
  }
  cursor.y += 6

  tituloSecao(doc, cursor, '4. Seu método — capacidade da sarjeta (Manning)')
  linhaFormula(doc, cursor, 'V = (1/n) x Rh^(2/3) x S^(1/2)')
  linhaFormula(
    doc,
    cursor,
    `V = (1/${fmt(p.manningN, 4)}) x ${fmt(memorial.raioHidraulicoElevadoDoisTercos, 5)} x ${fmt(Math.sqrt(memorial.declividadeLongitudinalMM), 5)} = ${fmt(memorial.velocidadeMs, 4)} m/s`
  )
  linhaFormula(doc, cursor, 'Q = A x V')
  linhaFormula(doc, cursor, `Q = ${fmt(memorial.areaMolhadaM2, 5)} x ${fmt(memorial.velocidadeMs, 4)} = ${fmt(memorial.vazaoM3s, 6)} m3/s`)
  cursor.y += 6

  tituloSecao(doc, cursor, '5. Método racional — vazão de projeto e comprimento crítico')
  linhaFormula(doc, cursor, 'Q = K x C x i x largura_impluvio x L   (K = 2,78e-7)')
  linhaFormula(doc, cursor, 'L = Q / (K x C x i x largura_impluvio)')
  linhaFormula(
    doc,
    cursor,
    `L = ${fmt(memorial.vazaoM3s, 6)} / (2,78e-7 x ${fmt(p.coefC, 2)} x ${fmt(data.intensidadeMmH, 2)} x ${fmt(p.larguraImpluvioM, 2)}) = ${fmt(memorial.comprimentoCriticoM, 2)} m`
  )
  cursor.y += 10

  subtitulo(doc, cursor, 'Resultado final')
  blocoResultadoFinal(doc, cursor, memorial, data.intensidadeMmH)

  const totalPaginas = doc.getNumberOfPages()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text(`${data.nomeVia} — Sarjeta Crítica`, MARGIN_X, 825)
    doc.text(`Página ${i} de ${totalPaginas}`, 555, 825, { align: 'right' })
  }

  const nomeArquivo = `memoria-sarjeta-critica-${data.nomeVia}`.replace(/\s+/g, '-').toLowerCase() + '.pdf'
  doc.save(nomeArquivo)
}
