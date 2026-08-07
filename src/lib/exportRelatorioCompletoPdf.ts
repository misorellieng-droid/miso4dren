import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { exportSarjetaCriticaPdf, type DadosSarjetaCriticaPdf } from './exportSarjetaCriticaPdf'
import { exportSarjetaoPdf, type DadosSarjetaoPdf } from './exportSarjetaoPdf'
import type { ImagemRasterizada } from './diagramaSvg'
import type { MaterialManningRecord } from './materiaisStorage'
import type { ItemBiblioteca } from './bibliotecaStorage'

export interface TabelaRelatorio {
  colunas: { key: string; label: string }[]
  linhas: Record<string, string>[]
}

export interface CriteriosRelatorio {
  limiteYD: number
  velMinMs: number
  velMaxMs: number
  declMinMM: number
  declMaxMM: number
  diametroMinTroncoM: number
  diametroMinRamalM: number
  energiaSoTronco: boolean
  /** null quando não configurado -- entra como "não definido" no relatório em vez de 0 m. */
  recobrimentoMinimoM: number | null
}

export interface DadosRelatorioCompleto {
  projetoNome: string
  revisaoNome: string
  equacaoNome: string | null
  tempoRetornoAnos: number
  qtdCaixas: number
  qtdTrechos: number
  qtdBacias: number
  /** null quando a rede não tem coordenadas cadastradas (nada pra desenhar). */
  diagramaTronco: ImagemRasterizada | null
  diagramaCompleto: ImagemRasterizada | null
  memorial: TabelaRelatorio
  notaServico: TabelaRelatorio
  quantidade: TabelaRelatorio
  resumoQuantidade: TabelaRelatorio
  criterios: CriteriosRelatorio
  materiaisManning: MaterialManningRecord[]
  bibliotecaPecas: ItemBiblioteca[]
  /** Todo estudo de sarjeta crítica/sarjetão já salvo na revisão (não arquivado) -- cada um vira
   * uma seção própria (memória de cálculo completa), reaproveitando exportSarjetaCriticaPdf /
   * exportSarjetaoPdf desenhando dentro do MESMO doc em vez de gerar PDFs separados. */
  sarjetasCriticas: DadosSarjetaCriticaPdf[]
  sarjetoes: DadosSarjetaoPdf[]
}

const BRAND_RGB: [number, number, number] = [240, 102, 26]
const CINZA_RGB: [number, number, number] = [90, 90, 90]
const MARGIN_X = 40
const PAGE_WIDTH_PT = 595
const PAGE_HEIGHT_PT = 842
const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - 2 * MARGIN_X

interface Cursor {
  y: number
}

function garantirEspaco(doc: jsPDF, cursor: Cursor, necessarioPt: number) {
  if (cursor.y + necessarioPt > PAGE_HEIGHT_PT - 55) {
    doc.addPage()
    cursor.y = 55
  }
}

function tituloPagina(doc: jsPDF, cursor: Cursor, texto: string) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(20, 20, 20)
  doc.text(texto, MARGIN_X, cursor.y)
  doc.setDrawColor(...BRAND_RGB)
  doc.setLineWidth(1)
  doc.line(MARGIN_X, cursor.y + 6, PAGE_WIDTH_PT - MARGIN_X, cursor.y + 6)
  doc.setTextColor(20, 20, 20)
  cursor.y += 26
}

function subtitulo(doc: jsPDF, cursor: Cursor, texto: string) {
  garantirEspaco(doc, cursor, 20)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text(texto, MARGIN_X, cursor.y)
  cursor.y += 16
}

function tabela(doc: jsPDF, cursor: Cursor, tab: TabelaRelatorio) {
  if (tab.linhas.length === 0) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...CINZA_RGB)
    doc.text('(sem registros)', MARGIN_X, cursor.y)
    cursor.y += 16
    doc.setTextColor(20, 20, 20)
    return
  }
  autoTable(doc, {
    startY: cursor.y,
    margin: { left: MARGIN_X, right: MARGIN_X },
    head: [tab.colunas.map((c) => c.label)],
    body: tab.linhas.map((linha) => tab.colunas.map((c) => linha[c.key] ?? '—')),
    styles: { fontSize: 6.5, cellPadding: 2.5 },
    headStyles: { fillColor: BRAND_RGB, fontSize: 6.5 },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cursor.y = (doc as any).lastAutoTable.finalY + 18
}

function desenharImagem(doc: jsPDF, cursor: Cursor, imagem: ImagemRasterizada) {
  const larguraDisp = CONTENT_WIDTH_PT
  const alturaDisp = Math.min(larguraDisp * (imagem.alturaOriginal / imagem.larguraOriginal), PAGE_HEIGHT_PT - 100)
  garantirEspaco(doc, cursor, alturaDisp + 10)
  doc.addImage(imagem.dataUrl, 'PNG', MARGIN_X, cursor.y, larguraDisp, alturaDisp)
  cursor.y += alturaDisp + 16
}

function rodapePaginas(doc: jsPDF, cabecalho: string, dePagina: number, atePagina: number) {
  const total = atePagina - dePagina + 1
  for (let i = dePagina; i <= atePagina; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text(cabecalho, MARGIN_X, 825)
    doc.text(`Página ${i - dePagina + 1} de ${total}`, PAGE_WIDTH_PT - MARGIN_X, 825, { align: 'right' })
    doc.setTextColor(20, 20, 20)
  }
}

const pct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`
const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—')

/**
 * Relatório completo do projeto: capa, diagramas da rede (tronco e completa), memorial
 * justificativo, nota de serviço, quantidade (com resumo por item), critérios adotados, e a
 * memória de cálculo de cada estudo de sarjeta crítica/sarjetão da revisão -- um único PDF, um
 * `jsPDF` só, salvo no final. As seções de sarjeta reaproveitam exportSarjetaCriticaPdf/
 * exportSarjetaoPdf passando o MESMO doc (ver o parâmetro opcional `docExistente` nelas), então o
 * desenho técnico bespoke (seção transversal, perfil longitudinal) não é duplicado aqui.
 */
export function gerarRelatorioCompletoPdf(dados: DadosRelatorioCompleto): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const cursor: Cursor = { y: 60 }
  const cabecalhoRodape = `${dados.projetoNome} — ${dados.revisaoNome}`

  // Capa
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(20, 20, 20)
  doc.text('Relatório Completo do Projeto', MARGIN_X, cursor.y)
  cursor.y += 30
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...CINZA_RGB)
  doc.text(dados.projetoNome, MARGIN_X, cursor.y)
  cursor.y += 18
  doc.text(dados.revisaoNome, MARGIN_X, cursor.y)
  cursor.y += 24
  doc.setFontSize(10)
  doc.text(
    `Equação IDF: ${dados.equacaoNome ?? '—'}   ·   Tempo de retorno: ${dados.tempoRetornoAnos} anos   ·   Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
    MARGIN_X,
    cursor.y
  )
  cursor.y += 13
  doc.text(
    `${dados.qtdCaixas} caixa(s)   ·   ${dados.qtdTrechos} trecho(s)   ·   ${dados.qtdBacias} bacia(s)   ·   ${dados.sarjetasCriticas.length} sarjeta(s) crítica(s)   ·   ${dados.sarjetoes.length} sarjetão(ões)`,
    MARGIN_X,
    cursor.y
  )
  cursor.y += 30

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text('Sumário', MARGIN_X, cursor.y)
  cursor.y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(60, 60, 60)
  const itensSumario = [
    dados.diagramaTronco ? 'Diagrama da rede tronco' : null,
    dados.diagramaCompleto ? 'Diagrama da rede completa' : null,
    'Memorial justificativo',
    'Nota de serviço',
    'Quantidade e resumo de quantidades',
    'Critérios adotados',
    ...dados.sarjetasCriticas.map((s) => `Sarjeta crítica — ${s.nomeVia}`),
    ...dados.sarjetoes.map((s) => `Sarjetão dente de serra — ${s.nomeTrecho}`),
  ].filter((s): s is string => s != null)
  for (const item of itensSumario) {
    garantirEspaco(doc, cursor, 14)
    doc.text(`•  ${item}`, MARGIN_X + 6, cursor.y)
    cursor.y += 14
  }
  doc.setTextColor(20, 20, 20)

  if (dados.diagramaTronco) {
    doc.addPage()
    cursor.y = 60
    tituloPagina(doc, cursor, 'Diagrama da rede tronco')
    desenharImagem(doc, cursor, dados.diagramaTronco)
  }

  if (dados.diagramaCompleto) {
    doc.addPage()
    cursor.y = 60
    tituloPagina(doc, cursor, 'Diagrama da rede completa')
    desenharImagem(doc, cursor, dados.diagramaCompleto)
  }

  doc.addPage()
  cursor.y = 60
  tituloPagina(doc, cursor, 'Memorial justificativo')
  tabela(doc, cursor, dados.memorial)

  doc.addPage()
  cursor.y = 60
  tituloPagina(doc, cursor, 'Nota de serviço')
  tabela(doc, cursor, dados.notaServico)

  doc.addPage()
  cursor.y = 60
  tituloPagina(doc, cursor, 'Quantidade')
  tabela(doc, cursor, dados.quantidade)
  subtitulo(doc, cursor, 'Resumo de quantidades por item (material + diâmetro)')
  tabela(doc, cursor, dados.resumoQuantidade)

  doc.addPage()
  cursor.y = 60
  tituloPagina(doc, cursor, 'Critérios adotados')
  const c = dados.criterios
  subtitulo(doc, cursor, 'Hidráulica e conformidade')
  tabela(doc, cursor, {
    colunas: [
      { key: 'criterio', label: 'Critério' },
      { key: 'valor', label: 'Valor' },
    ],
    linhas: [
      { criterio: 'Equação IDF', valor: dados.equacaoNome ?? '—' },
      { criterio: 'Tempo de retorno', valor: `${dados.tempoRetornoAnos} anos` },
      { criterio: 'y/D máximo', valor: pct(c.limiteYD, 0) },
      { criterio: 'Velocidade mínima', valor: `${fmt(c.velMinMs)} m/s` },
      { criterio: 'Velocidade máxima', valor: `${fmt(c.velMaxMs)} m/s` },
      { criterio: 'Declividade mínima', valor: `${fmt(c.declMinMM, 4)} m/m` },
      { criterio: 'Declividade máxima', valor: `${fmt(c.declMaxMM, 4)} m/m` },
      { criterio: 'Recobrimento mínimo', valor: c.recobrimentoMinimoM != null ? `${fmt(c.recobrimentoMinimoM)} m` : 'não definido' },
      { criterio: 'Diâmetro mínimo — rede tronco', valor: `${fmt(c.diametroMinTroncoM)} m` },
      { criterio: 'Diâmetro mínimo — ramal', valor: `${fmt(c.diametroMinRamalM)} m` },
      {
        criterio: 'Linha de energia (EGL) na troca de diâmetro',
        valor: c.energiaSoTronco ? 'Só considera troca dentro da rede tronco' : 'Considera qualquer troca (tronco ou ramal)',
      },
    ],
  })

  subtitulo(doc, cursor, 'Materiais e rugosidades')
  tabela(doc, cursor, {
    colunas: [
      { key: 'material', label: 'Material' },
      { key: 'manningN', label: 'Manning n' },
      { key: 'observacao', label: 'Observação' },
    ],
    linhas: dados.materiaisManning.map((m) => ({
      material: m.material,
      manningN: fmt(m.manning_n, 4),
      observacao: m.observacao ?? '—',
    })),
  })

  subtitulo(doc, cursor, 'Biblioteca de peças')
  tabela(doc, cursor, {
    colunas: [
      { key: 'material', label: 'Material' },
      { key: 'diametro', label: 'Diâm. (m)' },
      { key: 'pecaNome', label: 'Peça' },
      { key: 'espessura', label: 'Espessura parede (m)' },
      { key: 'larguraEscavacao', label: 'Largura escavação (m)' },
      { key: 'talude', label: 'Talude H:V' },
      { key: 'alturaBerco', label: 'Altura berço (m)' },
    ],
    linhas: dados.bibliotecaPecas.map((b) => ({
      material: b.material,
      diametro: fmt(b.diametro_m, 3),
      pecaNome: b.nome_peca ?? '—',
      espessura: b.espessura_parede_m != null ? fmt(b.espessura_parede_m, 3) : '—',
      larguraEscavacao: b.largura_escavacao_m != null ? fmt(b.largura_escavacao_m, 2) : '—',
      talude: b.talude_escavacao_hv != null ? fmt(b.talude_escavacao_hv, 2) : '—',
      alturaBerco: b.altura_berco_m != null ? fmt(b.altura_berco_m, 2) : '—',
    })),
  })

  const paginaAntesSecoesTecnicas = doc.getNumberOfPages()
  rodapePaginas(doc, cabecalhoRodape, 1, paginaAntesSecoesTecnicas)

  // Cada estudo de sarjeta/sarjetão desenha sua própria seção (com seu próprio rodapé, já
  // aplicado dentro de exportSarjetaCriticaPdf/exportSarjetaoPdf) dentro do MESMO doc.
  for (const s of dados.sarjetasCriticas) exportSarjetaCriticaPdf(s, doc)
  for (const s of dados.sarjetoes) exportSarjetaoPdf(s, doc)

  const nomeArquivo = `relatorio-completo-${dados.projetoNome}-${dados.revisaoNome}`.replace(/\s+/g, '-').toLowerCase() + '.pdf'
  doc.save(nomeArquivo)
}
