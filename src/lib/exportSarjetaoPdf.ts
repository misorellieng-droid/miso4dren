import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { MemorialSarjetaoDenteServa, MetodoCapacidade, ResultadoMetodoSarjetao } from '../engine/sarjetao'

/** Espelha os campos numéricos do formulário no momento do cálculo — usado tanto no memorial em tela quanto no PDF. */
export interface ParametrosExibicao {
  larguraViaM: number
  coefC: number
  telhadoAtivo: boolean
  larguraTelhadoM?: number
  coefCTelhado?: number
  larguraSarjetaoM: number
  sxSarjetaoAlto: number
  sxSarjetaoBaixo: number
  yMaxM: number
  sxPista: number
  larguraEspraiamentoM: number
  manningN: number
  tcInicialMin: number
}

export interface DadosSarjetaoPdf {
  nomeTrecho: string
  projetoNome: string
  revisaoNome: string
  equacaoNome: string | null
  tempoRetornoAnos: number
  parametros: ParametrosExibicao
  memorial: MemorialSarjetaoDenteServa
}

const BRAND_RGB: [number, number, number] = [240, 102, 26]
const CINZA_RGB: [number, number, number] = [90, 90, 90]
const PAGE_HEIGHT_PT = 842 // A4, unit pt
const MARGIN_X = 40
const MARGIN_BOTTOM = 55

const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—')
const pct = (n: number, digits = 3) => `${(n * 100).toFixed(digits)}%`

const METODO_LABELS: Record<MetodoCapacidade, string> = {
  manning_generico: 'Método 1 — Manning genérico (seção retangular equivalente)',
  hec22: 'Método 2 — HEC-22/FHWA (seção triangular integrada)',
}

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

function tabelaIteracoesTc(doc: jsPDF, cursor: Cursor, resultado: ResultadoMetodoSarjetao) {
  garantirEspaco(doc, cursor, 40)
  autoTable(doc, {
    startY: cursor.y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [['#', 'Tc (min)', 'i (mm/h)', 'L (m)', 'SL no braço (%)', 'Q (m³/s)', 'Qcap (m³/s)']],
    body: resultado.historicoIteracoesTc.map((h) => [
      String(h.numero),
      fmt(h.tcMin, 2),
      fmt(h.intensidadeMmH, 1),
      fmt(h.comprimentoM, 2),
      fmt(h.declividadeLongitudinalMM * 100, 4),
      fmt(h.vazaoM3s, 5),
      fmt(h.vazaoCapacidadeM3s, 5),
    ]),
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: BRAND_RGB, fontSize: 7.5 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor.y = (doc as any).lastAutoTable.finalY + 16
}

const AREA_MOLHADA_RGB: [number, number, number] = [252, 231, 214] // brand claro, aproxima a sombra translúcida usada na tela

function desenharPoligono(doc: jsPDF, pontos: Array<[number, number]>, estilo: string) {
  if (pontos.length < 2) return
  const deltas: Array<[number, number]> = []
  for (let i = 1; i < pontos.length; i++) {
    deltas.push([pontos[i][0] - pontos[i - 1][0], pontos[i][1] - pontos[i - 1][1]])
  }
  doc.lines(deltas, pontos[0][0], pontos[0][1], [1, 1], estilo, true)
}

/** Espraiamento triangular real (Método 2) sombreado, com o retângulo equivalente do Método 1 sobreposto (tracejado). */
function desenharSecaoTransversalSarjetao(doc: jsPDF, cursor: Cursor, p: ParametrosExibicao) {
  const alturaDisp = 95
  garantirEspaco(doc, cursor, alturaDisp + 44)

  const T = p.larguraEspraiamentoM
  const origemY = cursor.y + 14
  const centroX = MARGIN_X + 257
  const larguraDisp = 480
  const escalaX = larguraDisp / (2 * T)
  const escalaY = alturaDisp / p.yMaxM

  const px = (x: number) => centroX + x * escalaX
  const py = (profundidade: number) => origemY + profundidade * escalaY

  // retângulo equivalente do Método 1
  doc.setDrawColor(140, 140, 140)
  doc.setLineWidth(0.75)
  doc.rect(px(-T), py(p.yMaxM), px(T) - px(-T), py(0) - py(p.yMaxM), 'S')

  // triângulo real (Método 2)
  doc.setFillColor(...AREA_MOLHADA_RGB)
  desenharPoligono(
    doc,
    [
      [px(-T), py(0)],
      [px(0), py(p.yMaxM)],
      [px(T), py(0)],
    ],
    'F'
  )
  doc.setDrawColor(...BRAND_RGB)
  doc.setLineWidth(1)
  doc.line(px(-T), py(0), px(0), py(p.yMaxM))
  doc.line(px(0), py(p.yMaxM), px(T), py(0))

  doc.setDrawColor(140, 140, 140)
  doc.setLineWidth(0.5)
  doc.line(px(-T), py(0), px(T), py(0))

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text(`y_max = ${fmt(p.yMaxM, 3)} m`, centroX, py(p.yMaxM) - 6, { align: 'center' })
  doc.text(`T = ${fmt(T, 2)} m`, px(-T / 2), py(0) + 12, { align: 'center' })
  doc.text(`T = ${fmt(T, 2)} m`, px(T / 2), py(0) + 12, { align: 'center' })
  doc.text(`eixo do sarjetão (Sx da pista = ${pct(p.sxPista, 2)})`, centroX, origemY + alturaDisp + 24, { align: 'center' })
  doc.setTextColor(20, 20, 20)

  cursor.y = origemY + alturaDisp + 36
}

/** Perfil crista→caixa→crista com braço, distância e lâmina rotulados — mesma forma do desenho em tela. */
function desenharPerfilLongitudinalSarjetao(doc: jsPDF, cursor: Cursor, titulo: string, comprimentoM: number, yMaxM: number) {
  garantirEspaco(doc, cursor, 110)

  subtitulo(doc, cursor, titulo)

  const origemX = MARGIN_X + 10
  const topoY = cursor.y + 6
  const baseY = topoY + 60
  const larguraDisp = 495
  const meioX = origemX + larguraDisp / 2

  doc.setFillColor(...AREA_MOLHADA_RGB)
  desenharPoligono(
    doc,
    [
      [origemX, topoY],
      [meioX, baseY],
      [origemX + larguraDisp, topoY],
    ],
    'F'
  )
  doc.setDrawColor(...BRAND_RGB)
  doc.setLineWidth(1.25)
  doc.line(origemX, topoY, meioX, baseY)
  doc.line(meioX, baseY, origemX + larguraDisp, topoY)

  doc.setFillColor(200, 60, 40)
  doc.circle(origemX, topoY, 2.2, 'F')
  doc.circle(meioX, baseY, 2.2, 'F')
  doc.circle(origemX + larguraDisp, topoY, 2.2, 'F')

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(90, 90, 90)
  doc.text('ponto alto', origemX, topoY - 6)
  doc.text('caixa (ponto baixo)', meioX, baseY + 12, { align: 'center' })
  doc.text('próximo ponto alto', origemX + larguraDisp, topoY - 6, { align: 'right' })
  doc.text(`lâmina = y_max = ${fmt(yMaxM, 3)} m`, meioX, baseY + 24, { align: 'center' })
  doc.text(`braço = ${fmt(comprimentoM / 2, 2)} m`, (origemX + meioX) / 2, (topoY + baseY) / 2, { align: 'center' })
  doc.text(`braço = ${fmt(comprimentoM / 2, 2)} m`, (meioX + origemX + larguraDisp) / 2, (topoY + baseY) / 2, { align: 'center' })
  doc.setTextColor(20, 20, 20)

  cursor.y = baseY + 36
}

function blocoResultadoFinal(doc: jsPDF, cursor: Cursor, resultado: ResultadoMetodoSarjetao) {
  garantirEspaco(doc, cursor, 70)
  doc.setDrawColor(220, 220, 220)
  doc.setFillColor(250, 246, 240)
  const alturaBox = 62
  doc.roundedRect(MARGIN_X, cursor.y, 515, alturaBox, 3, 3, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(20, 20, 20)
  doc.text(
    `Distância entre caixas (L) = ${fmt(resultado.comprimentoEquilibrioM, 2)} m   (braço = ${fmt(resultado.comprimentoEquilibrioM / 2, 2)} m)`,
    MARGIN_X + 10,
    cursor.y + 16
  )
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(60, 60, 60)
  doc.text(
    `SL no braço = ${pct(resultado.declividadeLongitudinalMM, 4)}   Velocidade = ${fmt(resultado.velocidadeMs, 3)} m/s   Vazão = Qcap = ${fmt(resultado.vazaoM3s, 5)} m³/s`,
    MARGIN_X + 10,
    cursor.y + 31
  )
  doc.text(
    `Tc convergido = ${fmt(resultado.tcConvergidoMin, 2)} min (${resultado.iteracoesTc} iteração(ões))   Intensidade = ${fmt(resultado.intensidadeConvergidaMmH, 1)} mm/h`,
    MARGIN_X + 10,
    cursor.y + 44
  )
  doc.text(
    `Bisseção: ${resultado.iteracoes} iteração(ões), ${resultado.convergiu ? 'convergiu' : 'NÃO convergiu'}`,
    MARGIN_X + 10,
    cursor.y + 57
  )
  cursor.y += alturaBox + 18
}

function secaoMetodo(doc: jsPDF, cursor: Cursor, metodo: MetodoCapacidade, resultado: ResultadoMetodoSarjetao, p: ParametrosExibicao, deltaHM: number) {
  tituloSecao(doc, cursor, METODO_LABELS[metodo])

  if (metodo === 'manning_generico') {
    subtitulo(doc, cursor, 'Geometria da seção (retangular equivalente)')
    linhaFormula(doc, cursor, `A = T x y_max = ${fmt(p.larguraEspraiamentoM, 4)} x ${fmt(p.yMaxM, 4)} = ${fmt(resultado.areaMolhadaM2, 5)} m2`)
    linhaFormula(doc, cursor, `P = 2 x T = 2 x ${fmt(p.larguraEspraiamentoM, 4)} = ${fmt(2 * p.larguraEspraiamentoM, 4)} m`)
    linhaFormula(doc, cursor, `Rh = A / P = ${fmt(resultado.areaMolhadaM2, 5)} / ${fmt(2 * p.larguraEspraiamentoM, 4)} = ${fmt(resultado.raioHidraulicoM ?? 0, 5)} m`)
    cursor.y += 4

    subtitulo(doc, cursor, 'Capacidade hidráulica (no braço, L/2)')
    linhaFormula(doc, cursor, 'Qcap = (1/n) x A x Rh^(2/3) x SL^(1/2)')
    linhaFormula(doc, cursor, `Qcap = (1/${fmt(p.manningN, 4)}) x ${fmt(resultado.areaMolhadaM2, 5)} x ${fmt(resultado.raioHidraulicoM ?? 0, 5)}^(2/3) x SL^(1/2)`)
  } else {
    subtitulo(doc, cursor, 'Geometria de referência (área triangular equivalente, só para reportar velocidade)')
    linhaFormula(doc, cursor, `A_eq = T x y_max / 2 = ${fmt(p.larguraEspraiamentoM, 4)} x ${fmt(p.yMaxM, 4)} / 2 = ${fmt(resultado.areaMolhadaM2, 5)} m2`)
    cursor.y += 4

    subtitulo(doc, cursor, 'Capacidade hidráulica (seção triangular integrada, no braço)')
    linhaFormula(doc, cursor, 'Qcap = (0,375/n) x Sx_pista^(5/3) x SL^(1/2) x T^(8/3)')
    linhaFormula(
      doc,
      cursor,
      `Qcap = (0,375/${fmt(p.manningN, 4)}) x ${fmt(p.sxPista, 4)}^(5/3) x SL^(1/2) x ${fmt(p.larguraEspraiamentoM, 4)}^(8/3)`
    )
    paragrafo(
      doc,
      cursor,
      'Atenção: o Sx usado aqui é o da PISTA fora do sarjetão (retroanalisado de y_max/T), não o Sx do próprio sarjetão — são geometrias distintas.'
    )
  }

  subtitulo(doc, cursor, 'Desnível e declividade longitudinal do braço')
  linhaFormula(doc, cursor, `delta_h = (largura_sarjetao / 2) x (Sx_baixo - Sx_alto) = ${fmt(deltaHM, 4)} m`)
  linhaFormula(doc, cursor, `braco = L / 2 = ${fmt(resultado.comprimentoEquilibrioM, 2)} / 2 = ${fmt(resultado.comprimentoEquilibrioM / 2, 2)} m`)
  linhaFormula(
    doc,
    cursor,
    `SL = delta_h / braco = ${fmt(deltaHM, 4)} / ${fmt(resultado.comprimentoEquilibrioM / 2, 2)} = ${pct(resultado.declividadeLongitudinalMM, 4)}`
  )
  cursor.y += 4

  subtitulo(doc, cursor, 'Vazão afluente (método racional, no braço)')
  linhaFormula(doc, cursor, 'Q = K x i x (C_pista x largura_via [+ C_telhado x largura_telhado]) x braco   (K = 2,78e-7)')
  if (p.telhadoAtivo) {
    linhaFormula(
      doc,
      cursor,
      `Q = 2,78e-7 x i x (${fmt(p.coefC, 2)} x ${fmt(p.larguraViaM, 2)} + ${fmt(p.coefCTelhado ?? 0, 2)} x ${fmt(p.larguraTelhadoM ?? 0, 2)}) x braco`
    )
  } else {
    linhaFormula(doc, cursor, `Q = 2,78e-7 x i x (${fmt(p.coefC, 2)} x ${fmt(p.larguraViaM, 2)}) x braco`)
  }
  cursor.y += 4

  subtitulo(doc, cursor, `Iteração de Tc até convergência (tolerância 1% em L, ${resultado.historicoIteracoesTc.length} passada(s))`)
  tabelaIteracoesTc(doc, cursor, resultado)

  subtitulo(doc, cursor, 'Resultado no ponto de equilíbrio')
  blocoResultadoFinal(doc, cursor, resultado)
}

/** Memória de cálculo completa, ponto a ponto, dos dois métodos — layout formatado pra impressão/anexo de projeto. */
export function exportSarjetaoPdf(data: DadosSarjetaoPdf): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const cursor: Cursor = { y: 55 }
  const { parametros: p, memorial } = data

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(17)
  doc.setTextColor(20, 20, 20)
  doc.text('Memória de Cálculo — Sarjetão em Dente de Serra', MARGIN_X, cursor.y)
  cursor.y += 20

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...CINZA_RGB)
  doc.text(`${data.projetoNome} — ${data.revisaoNome} — Trecho: ${data.nomeTrecho}`, MARGIN_X, cursor.y)
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
      ['Largura total da via contribuinte', `${fmt(p.larguraViaM, 2)} m`],
      ['Coeficiente de escoamento C (pista)', fmt(p.coefC, 2)],
      ['Contribuição de telhado', p.telhadoAtivo ? 'Ativa' : 'Inativa'],
      ...(p.telhadoAtivo
        ? ([
            ['Largura de cobertura contribuinte', `${fmt(p.larguraTelhadoM ?? 0, 2)} m`],
            ['Coeficiente de escoamento C (cobertura)', fmt(p.coefCTelhado ?? 0, 2)],
          ] as string[][])
        : []),
      ['Largura do sarjetão', `${fmt(p.larguraSarjetaoM, 2)} m`],
      ['Sx do sarjetão — ponto alto', pct(p.sxSarjetaoAlto, 2)],
      ['Sx do sarjetão — ponto baixo', pct(p.sxSarjetaoBaixo, 2)],
      ['Lâmina d’água admissível (y_max)', `${fmt(p.yMaxM, 4)} m`],
      ['Sx da pista fora do sarjetão', pct(p.sxPista, 2)],
      ['Espraiamento T', `${fmt(p.larguraEspraiamentoM, 4)} m`],
      ['Manning n', fmt(p.manningN, 4)],
      ['Tc inicial (semente)', `${fmt(p.tcInicialMin, 2)} min`],
    ],
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: BRAND_RGB },
    columnStyles: { 0: { cellWidth: 260 } },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor.y = (doc as any).lastAutoTable.finalY + 20

  tituloSecao(doc, cursor, '2. Desnível do sarjetão (delta_h)')
  linhaFormula(doc, cursor, 'delta_h = (largura_sarjetao / 2) x (Sx_baixo - Sx_alto)')
  linhaFormula(
    doc,
    cursor,
    `delta_h = (${fmt(p.larguraSarjetaoM, 2)} / 2) x (${fmt(p.sxSarjetaoBaixo, 3)} - ${fmt(p.sxSarjetaoAlto, 3)}) = ${fmt(memorial.deltaHM, 4)} m (${fmt(memorial.deltaHM * 100, 2)} cm)`
  )
  cursor.y += 10

  secaoMetodo(doc, cursor, 'manning_generico', memorial.metodo1, p, memorial.deltaHM)
  secaoMetodo(doc, cursor, 'hec22', memorial.metodo2, p, memorial.deltaHM)

  tituloSecao(doc, cursor, '5. Comparação e recomendação')
  garantirEspaco(doc, cursor, 40)
  autoTable(doc, {
    startY: cursor.y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [['Método', 'L — distância entre caixas (m)', 'Braço (m)', 'SL no braço (%)', 'Velocidade (m/s)']],
    body: [
      [
        METODO_LABELS.manning_generico,
        fmt(memorial.metodo1.comprimentoEquilibrioM, 2),
        fmt(memorial.metodo1.comprimentoEquilibrioM / 2, 2),
        fmt(memorial.metodo1.declividadeLongitudinalMM * 100, 4),
        fmt(memorial.metodo1.velocidadeMs, 3),
      ],
      [
        METODO_LABELS.hec22,
        fmt(memorial.metodo2.comprimentoEquilibrioM, 2),
        fmt(memorial.metodo2.comprimentoEquilibrioM / 2, 2),
        fmt(memorial.metodo2.declividadeLongitudinalMM * 100, 4),
        fmt(memorial.metodo2.velocidadeMs, 3),
      ],
    ],
    styles: { fontSize: 8.5, cellPadding: 4 },
    headStyles: { fillColor: BRAND_RGB },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor.y = (doc as any).lastAutoTable.finalY + 16

  paragrafo(
    doc,
    cursor,
    `Diferença entre os métodos: ${fmt(memorial.diferencaPercentual, 1)}%. Recomenda-se adotar o menor comprimento entre os dois -- ${fmt(memorial.comprimentoRecomendadoM, 2)} m (${METODO_LABELS[memorial.metodoRecomendado]}) -- pelo lado da segurança. A diferença decorre de premissas geométricas distintas (retângulo equivalente vs. integração triangular calibrada); nenhum dos dois métodos deve ser descartado como incorreto -- a escolha final depende de qual geometria descreve melhor o trecho real.`
  )

  tituloSecao(doc, cursor, '6. Seção transversal e perfil longitudinal')
  paragrafo(
    doc,
    cursor,
    'Região sombreada = área alagada aproximada na condição crítica. Esquemático -- não substitui o detalhamento executivo.'
  )
  desenharSecaoTransversalSarjetao(doc, cursor, p)
  desenharPerfilLongitudinalSarjetao(doc, cursor, `Perfil -- ${METODO_LABELS.manning_generico}`, memorial.metodo1.comprimentoEquilibrioM, p.yMaxM)
  desenharPerfilLongitudinalSarjetao(doc, cursor, `Perfil -- ${METODO_LABELS.hec22}`, memorial.metodo2.comprimentoEquilibrioM, p.yMaxM)

  const totalPaginas = doc.getNumberOfPages()
  for (let i = 1; i <= totalPaginas; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text(`${data.nomeTrecho} — Sarjetão em Dente de Serra`, MARGIN_X, 825)
    doc.text(`Página ${i} de ${totalPaginas}`, 555, 825, { align: 'right' })
  }

  const nomeArquivo = `memoria-sarjetao-${data.nomeTrecho}`.replace(/\s+/g, '-').toLowerCase() + '.pdf'
  doc.save(nomeArquivo)
}
