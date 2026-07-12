import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ObraRecord } from './obrasStorage'
import type { EquacaoIdfRecord } from './idfStorage'
import type { BaciaRecord } from './baciasStorage'
import type { ResultadoSarjetaRecord } from './resultadosStorage'

export interface RelatorioData {
  obra: ObraRecord
  equacao: EquacaoIdfRecord | null
  bacias: BaciaRecord[]
  caixasPorId: Map<string, string> // id -> nome, para exibir a caixa de destino
  sarjetas: ResultadoSarjetaRecord[]
  rede: Array<{
    trecho_nome: string
    q_projeto_m3s: number | null
    lamina_m: number | null
    y_sobre_d_pct: number | null
    velocidade_ms: number | null
    conforme: boolean | null
    motivo_nao_conformidade: string | null
  }>
}

const fmt = (n: number | null | undefined, digits = 2) => (n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits))

/** Memorial de cálculo da obra: dados de entrada, bacias, sarjetas, rede e não conformidades. */
export function exportRelatorioPdf(data: RelatorioData): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const marginX = 40
  let y = 50

  doc.setFontSize(16)
  doc.text(`Memorial de Cálculo — ${data.obra.nome}`, marginX, y)
  y += 22

  doc.setFontSize(10)
  doc.text(
    `Equação IDF: ${data.equacao?.nome ?? '—'} · Tempo de retorno: ${data.obra.tempo_retorno_anos ?? '—'} anos`,
    marginX,
    y
  )
  y += 24

  doc.setFontSize(12)
  doc.text('Bacias de contribuição', marginX, y)
  autoTable(doc, {
    startY: y + 6,
    margin: { left: marginX, right: marginX },
    head: [['Bacia', 'Área (m²)', 'C', 'Tc (min)', 'Caixa destino', 'Vínculo']],
    body: data.bacias.map((b) => [
      b.nome,
      fmt(b.area_m2, 1),
      String(b.coef_c),
      b.tc_min != null ? fmt(b.tc_min, 1) : '—',
      b.caixa_destino_id ? (data.caixasPorId.get(b.caixa_destino_id) ?? '—') : '—',
      b.vinculo_status,
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [240, 102, 26] },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24

  doc.setFontSize(12)
  doc.text('Sarjetas calculadas', marginX, y)
  autoTable(doc, {
    startY: y + 6,
    margin: { left: marginX, right: marginX },
    head: [['Via', 'Intensidade (mm/h)', 'Comprimento crítico (m)']],
    body: data.sarjetas.map((s) => [s.nome_via, fmt(s.intensidade_mm_h), fmt(s.comprimento_critico_m)]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [240, 102, 26] },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24

  doc.setFontSize(12)
  doc.text('Rede de tubos', marginX, y)
  autoTable(doc, {
    startY: y + 6,
    margin: { left: marginX, right: marginX },
    head: [['Trecho', 'Q projeto (m³/s)', 'Lâmina (m)', 'y/D (%)', 'Velocidade (m/s)', 'Conformidade']],
    body: data.rede.map((r) => [
      r.trecho_nome,
      fmt(r.q_projeto_m3s, 4),
      fmt(r.lamina_m, 3),
      fmt(r.y_sobre_d_pct, 0),
      fmt(r.velocidade_ms),
      r.conforme ? 'Conforme' : 'Não conforme',
    ]),
    styles: { fontSize: 8 },
    headStyles: { fillColor: [240, 102, 26] },
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24

  const naoConformes = data.rede.filter((r) => r.conforme === false)
  if (naoConformes.length > 0) {
    doc.setFontSize(12)
    doc.text('Trechos não conformes', marginX, y)
    autoTable(doc, {
      startY: y + 6,
      margin: { left: marginX, right: marginX },
      head: [['Trecho', 'Motivo']],
      body: naoConformes.map((r) => [r.trecho_nome, r.motivo_nao_conformidade ?? '—']),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [220, 38, 38] },
    })
  }

  doc.save(`memorial-${data.obra.nome.replace(/\s+/g, '-').toLowerCase()}.pdf`)
}
