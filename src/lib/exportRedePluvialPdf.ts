import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const BRAND_RGB: [number, number, number] = [240, 102, 26]
const CINZA_RGB: [number, number, number] = [90, 90, 90]

export interface ColunaTabelaRedePluvial {
  key: string
  label: string
}

export interface DadosTabelaRedePluvialPdf {
  projetoNome: string
  revisaoNome: string
  sistemaLabel: string // "Todos os sistemas" ou "Sistema 01" — reflete o filtro ativo na tela
  tituloTabela: string // 'Memorial Justificativo' | 'Nota de Serviço' | 'Quantitativo de materiais'
  colunas: ColunaTabelaRedePluvial[]
  linhas: Record<string, string>[]
  nomeArquivo: string
}

/**
 * Exporta em PDF (A4 paisagem) exatamente a tabela que está em tela — mesmas
 * colunas visíveis, mesma ordem de linhas — pra registrar como anexo de
 * projeto. Uma tabela por vez (aba ativa), já que memorial/nota de
 * serviço/quantitativo têm colunas bem diferentes entre si.
 */
export function exportarTabelaRedePluvialPdf(data: DadosTabelaRedePluvialPdf): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' })
  const marginX = 30
  let y = 40

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(20, 20, 20)
  doc.text(`Rede Pluvial — ${data.tituloTabela}`, marginX, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9.5)
  doc.setTextColor(...CINZA_RGB)
  doc.text(
    `${data.projetoNome} — ${data.revisaoNome} — ${data.sistemaLabel} — Emitido em ${new Date().toLocaleDateString('pt-BR')}`,
    marginX,
    y
  )
  y += 16

  autoTable(doc, {
    startY: y,
    margin: { left: marginX, right: marginX },
    head: [data.colunas.map((c) => c.label)],
    body: data.linhas.map((linha) => data.colunas.map((c) => linha[c.key] ?? '—')),
    styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: BRAND_RGB, fontSize: 7.5 },
    didDrawPage: () => {
      const pageSize = doc.internal.pageSize
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(140, 140, 140)
      doc.text(`${data.projetoNome} — ${data.revisaoNome}`, marginX, pageSize.getHeight() - 18)
      doc.text(`Página ${doc.getCurrentPageInfo().pageNumber}`, pageSize.getWidth() - marginX, pageSize.getHeight() - 18, {
        align: 'right',
      })
    },
  })

  doc.save(`${data.nomeArquivo}.pdf`.replace(/\s+/g, '-').toLowerCase())
}
