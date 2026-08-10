import * as XLSXStyle from 'xlsx-js-style'
import type { BaciaRecord } from '../lib/baciasStorage'

const ABA_RESUMO = 'Resumo de Bacias'
const LINHA_CABECALHO = 0
const LINHA_AREA = 1
const LINHA_COEF_C = 2
const LINHA_CA = 3

/**
 * Gera e baixa um relatório em Excel com as bacias do projeto — nome, área e
 * coeficiente C de cada uma — e um sumário com área total, ΣC×A acumulado e
 * C médio ponderado pela área (ΣC×A / área total), pra anexar numa folha do
 * projeto. Bacias como colunas (mesmo estilo de `gerarPlanilhaCaptacao`) pra
 * caber muitas bacias lado a lado sem rolar a tela.
 */
export function gerarRelatorioResumoBacias(bacias: BaciaRecord[], nomeRevisao: string): void {
  const baciasOrdenadas = [...bacias].sort((a, b) => a.nome.localeCompare(b.nome))

  const linhas: (string | number)[][] = []
  linhas.push(['Bacia', ...baciasOrdenadas.map((b) => b.nome)])
  linhas.push(['Área da bacia (m²)', ...baciasOrdenadas.map((b) => b.area_m2)])
  linhas.push(['C da bacia (0 a 1)', ...baciasOrdenadas.map((b) => b.coef_c ?? '')])
  linhas.push(['C × A (m²)', ...baciasOrdenadas.map(() => '')]) // preenchido com fórmula abaixo
  linhas.push([])
  linhas.push(['Área total (m²)', ''])
  linhas.push(['ΣC×A acumulado (m²)', ''])
  linhas.push(['C médio (ponderado pela área)', ''])

  const ws = XLSXStyle.utils.aoa_to_sheet(linhas)
  ws['!cols'] = [{ wch: 30 }, ...baciasOrdenadas.map(() => ({ wch: 8 }))]
  ws['!rows'] = [{ hpt: 90 }]

  baciasOrdenadas.forEach((_, i) => {
    const ref = XLSXStyle.utils.encode_cell({ r: LINHA_CABECALHO, c: i + 1 })
    ws[ref].s = { alignment: { textRotation: 90, vertical: 'bottom', horizontal: 'center' }, font: { bold: true } }
  })

  // C × A por bacia — fórmula, não hardcoded (Excel zera sozinho se a célula de C ficar em branco)
  baciasOrdenadas.forEach((_, i) => {
    const col = XLSXStyle.utils.encode_col(i + 1)
    const ref = XLSXStyle.utils.encode_cell({ r: LINHA_CA, c: i + 1 })
    ws[ref] = { t: 'n', f: `${col}${LINHA_COEF_C + 1}*${col}${LINHA_AREA + 1}` }
  })

  const ultimaColuna = XLSXStyle.utils.encode_col(baciasOrdenadas.length)
  const linhaAreaTotal = linhas.length - 3 // 0-based
  const linhaCaAcumulado = linhas.length - 2
  const linhaCMedio = linhas.length - 1

  ws[XLSXStyle.utils.encode_cell({ r: linhaAreaTotal, c: 1 })] = {
    t: 'n',
    f: `SUM(B${LINHA_AREA + 1}:${ultimaColuna}${LINHA_AREA + 1})`,
  }
  ws[XLSXStyle.utils.encode_cell({ r: linhaCaAcumulado, c: 1 })] = {
    t: 'n',
    f: `SUM(B${LINHA_CA + 1}:${ultimaColuna}${LINHA_CA + 1})`,
  }
  ws[XLSXStyle.utils.encode_cell({ r: linhaCMedio, c: 1 })] = {
    t: 'n',
    f: `B${linhaCaAcumulado + 1}/B${linhaAreaTotal + 1}`,
  }
  // negrito nas 3 linhas de sumário, pra destacar do resto da tabela
  for (const r of [linhaAreaTotal, linhaCaAcumulado, linhaCMedio]) {
    for (const c of [0, 1]) {
      const ref = XLSXStyle.utils.encode_cell({ r, c })
      if (ws[ref]) ws[ref].s = { font: { bold: true } }
    }
  }

  const wb = XLSXStyle.utils.book_new()
  XLSXStyle.utils.book_append_sheet(wb, ws, ABA_RESUMO)

  const slug = nomeRevisao.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  XLSXStyle.writeFile(wb, `resumo_bacias_${slug}.xlsx`)
}
