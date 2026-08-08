import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { exportSarjetaCriticaPdf, type DadosSarjetaCriticaPdf } from './exportSarjetaCriticaPdf'
import { exportSarjetaoPdf, type DadosSarjetaoPdf } from './exportSarjetaoPdf'
import { verificarEscadaHidraulica } from '../engine/escadaHidraulica'
import type { ImagemRasterizada } from './diagramaSvg'
import type { MaterialManningRecord } from './materiaisStorage'
import type { ItemBiblioteca } from './bibliotecaStorage'
import type { EquacaoIdfRecord } from './idfStorage'

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

export interface DadosEscadaRelatorio {
  nomeTrecho: string
  caixaMontante: string
  caixaJusante: string
  larguraM: number
  alturaFluxoM: number
  diametroExternoTuboChegadaM: number
  /** null quando o cálculo da rede ainda não rodou (não dá pra checar conformidade sem isso). */
  qProjetoM3s: number | null
}

export interface DadosRelatorioCompleto {
  clienteNome: string | null
  projetoNome: string
  revisaoNome: string
  equacaoIdf: EquacaoIdfRecord | null
  tempoRetornoAnos: number
  qtdCaixas: number
  qtdTrechos: number
  qtdBacias: number
  /** null quando não há logotipo cadastrado em Configurações. */
  logo: ImagemRasterizada | null
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
  escadasHidraulicas: DadosEscadaRelatorio[]
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
const RODAPE_Y = 825

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

function desenharImagem(doc: jsPDF, cursor: Cursor, imagem: ImagemRasterizada, larguraMaximaPt = CONTENT_WIDTH_PT) {
  const larguraDisp = larguraMaximaPt
  const alturaDisp = Math.min(larguraDisp * (imagem.alturaOriginal / imagem.larguraOriginal), PAGE_HEIGHT_PT - 100)
  garantirEspaco(doc, cursor, alturaDisp + 10)
  doc.addImage(imagem.dataUrl, 'PNG', MARGIN_X, cursor.y, larguraDisp, alturaDisp)
  cursor.y += alturaDisp + 16
  return alturaDisp
}

/** Rodapé de "Desenvolvido com miso4dren" + página/nome, aplicado depois de tudo pronto (só
 * então dá pra saber o total de páginas de cada trecho do PDF). */
function rodapePaginas(doc: jsPDF, cabecalho: string, dePagina: number, atePagina: number) {
  const total = atePagina - dePagina + 1
  for (let i = dePagina; i <= atePagina; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(140, 140, 140)
    doc.text(cabecalho, MARGIN_X, RODAPE_Y)
    doc.text('Desenvolvido com miso4dren', PAGE_WIDTH_PT / 2, RODAPE_Y, { align: 'center' })
    doc.text(`Página ${i - dePagina + 1} de ${total}`, PAGE_WIDTH_PT - MARGIN_X, RODAPE_Y, { align: 'right' })
    doc.setTextColor(20, 20, 20)
  }
}

const pct = (n: number, digits = 2) => `${(n * 100).toFixed(digits)}%`
const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—')

interface EntradaSumario {
  titulo: string
  /** Página do PRÓPRIO sumário onde esse item foi listado (pode ocupar mais de uma página) e a
   * posição Y ali -- é onde o número da página real é escrito de volta, na segunda passada. */
  paginaSumario: number
  y: number
  /** Preenchido só depois que a seção correspondente é de fato desenhada. */
  paginaAlvo: number | null
}

function desenharMemoriaEscada(doc: jsPDF, cursor: Cursor, e: DadosEscadaRelatorio) {
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12.5)
  doc.setTextColor(...BRAND_RGB)
  doc.text(e.nomeTrecho, MARGIN_X, cursor.y)
  doc.setDrawColor(...BRAND_RGB)
  doc.setLineWidth(0.75)
  doc.line(MARGIN_X, cursor.y + 4, PAGE_WIDTH_PT - MARGIN_X, cursor.y + 4)
  doc.setTextColor(20, 20, 20)
  cursor.y += 22

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(60, 60, 60)
  doc.text(`${e.caixaMontante} → ${e.caixaJusante}`, MARGIN_X, cursor.y)
  doc.setTextColor(20, 20, 20)
  cursor.y += 20

  doc.setFont('courier', 'normal')
  doc.setFontSize(9)
  doc.text('Q = 2,07 x B^0,90 x H^1,60  (fórmula empírica, B e H em metros, Q em m³/s)', MARGIN_X + 12, cursor.y)
  cursor.y += 20

  const verificacao =
    e.qProjetoM3s != null ? verificarEscadaHidraulica(e.larguraM, e.alturaFluxoM, e.qProjetoM3s, e.diametroExternoTuboChegadaM) : null

  tabela(doc, cursor, {
    colunas: [
      { key: 'parametro', label: 'Parâmetro' },
      { key: 'valor', label: 'Valor' },
    ],
    linhas: [
      { parametro: 'Diâmetro externo do tubo de chegada', valor: `${fmt(e.diametroExternoTuboChegadaM, 3)} m` },
      {
        parametro: 'B — largura útil adotada',
        valor: `${fmt(e.larguraM, 3)} m (mínimo admissível: ${verificacao ? fmt(verificacao.larguraMinimaM, 3) : '—'} m)`,
      },
      { parametro: 'H — altura do fluxo adotada', valor: `${fmt(e.alturaFluxoM, 3)} m (faixa admitida: 0,30–0,60 m)` },
      { parametro: 'Q de projeto (chegando na escada)', valor: e.qProjetoM3s != null ? `${(e.qProjetoM3s * 1000).toFixed(2)} L/s` : '—' },
      { parametro: 'Q de capacidade da escada', valor: verificacao ? `${(verificacao.vazaoCapacidadeM3s * 1000).toFixed(2)} L/s` : '—' },
    ],
  })

  if (verificacao) {
    const motivos: string[] = []
    if (verificacao.larguraAbaixoDoMinimo) motivos.push('largura B abaixo do mínimo admissível')
    if (verificacao.alturaForaDaFaixa) motivos.push('altura H fora da faixa admitida (30–60 cm)')
    if (verificacao.vazaoInsuficiente) motivos.push('vazão de capacidade menor que a vazão de projeto')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(...(verificacao.conforme ? ([22, 163, 74] as [number, number, number]) : ([220, 38, 38] as [number, number, number])))
    doc.text(verificacao.conforme ? 'Conforme' : `Não conforme: ${motivos.join('; ')}`, MARGIN_X, cursor.y)
    doc.setTextColor(20, 20, 20)
    cursor.y += 18
  }
}

/**
 * Relatório completo do projeto: capa (com logotipo, cliente/projeto/revisão), sumário com
 * número de página real de cada item, diagramas da rede (tronco e completa), memorial
 * justificativo, nota de serviço, quantidade (com resumo por item), critérios adotados (incluindo
 * a equação de chuva completa), memória de cálculo de cada escada hidráulica, e de cada estudo de
 * sarjeta crítica/sarjetão da revisão -- um único PDF, um `jsPDF` só, salvo no final. As seções de
 * sarjeta reaproveitam exportSarjetaCriticaPdf/exportSarjetaoPdf passando o MESMO doc (ver o
 * parâmetro opcional `docExistente` nelas), então o desenho técnico bespoke (seção transversal,
 * perfil longitudinal) não é duplicado aqui.
 */
export function gerarRelatorioCompletoPdf(dados: DadosRelatorioCompleto): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const cursor: Cursor = { y: 60 }
  const equacaoNome = dados.equacaoIdf?.nome ?? '—'
  const cabecalhoRodape = dados.clienteNome
    ? `${dados.clienteNome} — ${dados.projetoNome} — ${dados.revisaoNome}`
    : `${dados.projetoNome} — ${dados.revisaoNome}`

  // Capa
  if (dados.logo) {
    const larguraLogoPt = 90
    const alturaLogoPt = larguraLogoPt * (dados.logo.alturaOriginal / dados.logo.larguraOriginal)
    doc.addImage(dados.logo.dataUrl, 'PNG', PAGE_WIDTH_PT - MARGIN_X - larguraLogoPt, cursor.y - 20, larguraLogoPt, alturaLogoPt)
  }
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(20, 20, 20)
  doc.text('Relatório Completo do Projeto', MARGIN_X, cursor.y)
  cursor.y += 34
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.setTextColor(...CINZA_RGB)
  if (dados.clienteNome) {
    doc.text(`Cliente: ${dados.clienteNome}`, MARGIN_X, cursor.y)
    cursor.y += 18
  }
  doc.text(`Projeto: ${dados.projetoNome}`, MARGIN_X, cursor.y)
  cursor.y += 18
  doc.text(`Revisão: ${dados.revisaoNome}`, MARGIN_X, cursor.y)
  cursor.y += 24
  doc.setFontSize(10)
  doc.text(
    `Equação IDF: ${equacaoNome}   ·   Tempo de retorno: ${dados.tempoRetornoAnos} anos   ·   Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
    MARGIN_X,
    cursor.y
  )
  cursor.y += 13
  doc.text(
    `${dados.qtdCaixas} caixa(s)   ·   ${dados.qtdTrechos} trecho(s)   ·   ${dados.qtdBacias} bacia(s)   ·   ${dados.escadasHidraulicas.length} escada(s) hidráulica(s)   ·   ${dados.sarjetasCriticas.length} sarjeta(s) crítica(s)   ·   ${dados.sarjetoes.length} sarjetão(ões)`,
    MARGIN_X,
    cursor.y
  )
  cursor.y += 30

  // Sumário -- 1ª passada: só os títulos, com espaço reservado à direita pro número da página
  // (preenchido de volta depois que cada seção correspondente é de fato desenhada, quando o
  // número real da página dela já é conhecido).
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(20, 20, 20)
  doc.text('Sumário', MARGIN_X, cursor.y)
  cursor.y += 16
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(60, 60, 60)

  const titulos = [
    dados.diagramaTronco ? 'Diagrama da rede tronco' : null,
    dados.diagramaCompleto ? 'Diagrama da rede completa' : null,
    'Memorial justificativo',
    'Nota de serviço',
    'Quantidade e resumo de quantidades',
    'Critérios adotados',
    ...dados.escadasHidraulicas.map((e) => `Escada hidráulica — ${e.nomeTrecho}`),
    ...dados.sarjetasCriticas.map((s) => `Sarjeta crítica — ${s.nomeVia}`),
    ...dados.sarjetoes.map((s) => `Sarjetão dente de serra — ${s.nomeTrecho}`),
  ].filter((s): s is string => s != null)

  const entradasSumario: EntradaSumario[] = []
  for (const titulo of titulos) {
    garantirEspaco(doc, cursor, 14)
    doc.text(`•  ${titulo}`, MARGIN_X + 6, cursor.y)
    doc.text('. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .', MARGIN_X + 6, cursor.y, {
      maxWidth: PAGE_WIDTH_PT - MARGIN_X * 2 - 40,
    })
    entradasSumario.push({ titulo, paginaSumario: doc.getNumberOfPages(), y: cursor.y, paginaAlvo: null })
    cursor.y += 14
  }
  doc.setTextColor(20, 20, 20)

  let idxSumario = 0
  const proximaEntrada = () => entradasSumario[idxSumario++]

  if (dados.diagramaTronco) {
    doc.addPage()
    proximaEntrada().paginaAlvo = doc.getNumberOfPages()
    cursor.y = 60
    tituloPagina(doc, cursor, 'Diagrama da rede tronco')
    desenharImagem(doc, cursor, dados.diagramaTronco)
  }

  if (dados.diagramaCompleto) {
    doc.addPage()
    proximaEntrada().paginaAlvo = doc.getNumberOfPages()
    cursor.y = 60
    tituloPagina(doc, cursor, 'Diagrama da rede completa')
    desenharImagem(doc, cursor, dados.diagramaCompleto)
  }

  doc.addPage()
  proximaEntrada().paginaAlvo = doc.getNumberOfPages()
  cursor.y = 60
  tituloPagina(doc, cursor, 'Memorial justificativo')
  tabela(doc, cursor, dados.memorial)

  doc.addPage()
  proximaEntrada().paginaAlvo = doc.getNumberOfPages()
  cursor.y = 60
  tituloPagina(doc, cursor, 'Nota de serviço')
  tabela(doc, cursor, dados.notaServico)

  doc.addPage()
  proximaEntrada().paginaAlvo = doc.getNumberOfPages()
  cursor.y = 60
  tituloPagina(doc, cursor, 'Quantidade')
  tabela(doc, cursor, dados.quantidade)
  subtitulo(doc, cursor, 'Resumo de quantidades por item (material + diâmetro)')
  tabela(doc, cursor, dados.resumoQuantidade)

  doc.addPage()
  proximaEntrada().paginaAlvo = doc.getNumberOfPages()
  cursor.y = 60
  tituloPagina(doc, cursor, 'Critérios adotados')
  const c = dados.criterios
  subtitulo(doc, cursor, 'Equação de chuva (IDF)')
  if (dados.equacaoIdf) {
    const eq = dados.equacaoIdf
    tabela(doc, cursor, {
      colunas: [
        { key: 'criterio', label: 'Parâmetro' },
        { key: 'valor', label: 'Valor' },
      ],
      linhas: [
        { criterio: 'Nome', valor: eq.nome },
        { criterio: 'Localidade', valor: eq.localidade ?? '—' },
        { criterio: 'Fonte', valor: eq.fonte ?? '—' },
        { criterio: 'K', valor: fmt(eq.k, 4) },
        { criterio: 'a', valor: fmt(eq.a, 4) },
        { criterio: 'b', valor: fmt(eq.b, 4) },
        { criterio: 'c', valor: fmt(eq.c, 4) },
        {
          criterio: 'Fórmula',
          valor: `i = ${fmt(eq.k, 4)} x TR^${fmt(eq.a, 4)} / (t + ${fmt(eq.b, 4)})^${fmt(eq.c, 4)}  (i em mm/h, TR em anos, t em min)`,
        },
      ],
    })
  } else {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...CINZA_RGB)
    doc.text('Nenhuma equação IDF vinculada a esta revisão.', MARGIN_X, cursor.y)
    cursor.y += 16
    doc.setTextColor(20, 20, 20)
  }

  subtitulo(doc, cursor, 'Hidráulica e conformidade')
  tabela(doc, cursor, {
    colunas: [
      { key: 'criterio', label: 'Critério' },
      { key: 'valor', label: 'Valor' },
    ],
    linhas: [
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

  for (const e of dados.escadasHidraulicas) {
    doc.addPage()
    proximaEntrada().paginaAlvo = doc.getNumberOfPages()
    cursor.y = 60
    desenharMemoriaEscada(doc, cursor, e)
  }

  const paginaAntesSecoesTecnicas = doc.getNumberOfPages()
  rodapePaginas(doc, cabecalhoRodape, 1, paginaAntesSecoesTecnicas)

  // Cada estudo de sarjeta/sarjetão desenha sua própria seção (com seu próprio rodapé, já
  // aplicado dentro de exportSarjetaCriticaPdf/exportSarjetaoPdf) dentro do MESMO doc.
  for (const s of dados.sarjetasCriticas) {
    proximaEntrada().paginaAlvo = doc.getNumberOfPages() + 1
    exportSarjetaCriticaPdf(s, doc)
  }
  for (const s of dados.sarjetoes) {
    proximaEntrada().paginaAlvo = doc.getNumberOfPages() + 1
    exportSarjetaoPdf(s, doc)
  }

  // 2ª passada do sumário: agora que toda seção já foi desenhada, os números de página são
  // conhecidos -- volta pra(s) página(s) do sumário e escreve cada um na posição reservada.
  for (const entrada of entradasSumario) {
    if (entrada.paginaAlvo == null) continue
    doc.setPage(entrada.paginaSumario)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    doc.setTextColor(60, 60, 60)
    doc.text(String(entrada.paginaAlvo), PAGE_WIDTH_PT - MARGIN_X, entrada.y, { align: 'right' })
  }
  doc.setTextColor(20, 20, 20)

  const nomeArquivo = `relatorio-completo-${dados.projetoNome}-${dados.revisaoNome}`.replace(/\s+/g, '-').toLowerCase() + '.pdf'
  doc.save(nomeArquivo)
}
