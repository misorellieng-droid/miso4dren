import * as XLSX from 'xlsx'
import { describe, expect, it } from 'vitest'
import { parsePlanilhaCaptacao } from '../xlsxCaptacao'

/** Monta um buffer no mesmo layout gerado por gerarPlanilhaCaptacao (cabeçalho + coluna de
 * contribuição, linha de C, linha de área, linha de soma, dispositivos) sem passar pela escrita
 * real do arquivo -- simula o que o usuário reimporta depois de editar. */
function montarBuffer(linhas: (string | number)[][]): ArrayBuffer {
  const ws = XLSX.utils.aoa_to_sheet(linhas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Captação')
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
}

const COL_CONTRIB = 'Contribuição Q estimada (Tc=10min) L/s'

describe('parsePlanilhaCaptacao', () => {
  it('lê vínculos e coeficientes C da planilha', () => {
    const buffer = montarBuffer([
      ['Dispositivo', 'BACIA - 01', 'BACIA - 02', COL_CONTRIB],
      ['C da bacia (0 a 1)', 0.65, '', ''],
      ['Área da bacia (m²)', 1000, 2000, ''],
      ['SOMA % (deve fechar em 100)', 100, 0, ''],
      ['CT - 1', 100, '', 0.1234],
    ])
    const { entradas, coefCs, baciasNaPlanilha } = parsePlanilhaCaptacao(buffer)

    expect(baciasNaPlanilha).toEqual(['BACIA - 01', 'BACIA - 02'])
    expect(entradas).toEqual([{ baciaNome: 'BACIA - 01', dispositivoNome: 'CT - 1', percentual: 100 }])
    expect(coefCs).toEqual([{ baciaNome: 'BACIA - 01', coefC: 0.65 }])
  })

  it('ignora C em branco (não mexe no C já cadastrado)', () => {
    const buffer = montarBuffer([
      ['Dispositivo', 'BACIA - 01', COL_CONTRIB],
      ['C da bacia (0 a 1)', '', ''],
      ['Área da bacia (m²)', 1000, ''],
      ['SOMA %', 0, ''],
      ['CT - 1', '', ''],
    ])
    const { coefCs } = parsePlanilhaCaptacao(buffer)
    expect(coefCs).toEqual([])
  })

  it('gera aviso e ignora C fora do intervalo 0-1', () => {
    const buffer = montarBuffer([
      ['Dispositivo', 'BACIA - 01', COL_CONTRIB],
      ['C da bacia (0 a 1)', 1.5, ''],
      ['Área da bacia (m²)', 1000, ''],
      ['SOMA %', 0, ''],
      ['CT - 1', '', ''],
    ])
    const { coefCs, avisos } = parsePlanilhaCaptacao(buffer)
    expect(coefCs).toEqual([])
    expect(avisos.some((a) => a.includes('C inválido'))).toBe(true)
  })

  it('aceita vírgula decimal no C', () => {
    const buffer = montarBuffer([
      ['Dispositivo', 'BACIA - 01', COL_CONTRIB],
      ['C da bacia (0 a 1)', '0,8', ''],
      ['Área da bacia (m²)', 1000, ''],
      ['SOMA %', 0, ''],
      ['CT - 1', '', ''],
    ])
    const { coefCs } = parsePlanilhaCaptacao(buffer)
    expect(coefCs).toEqual([{ baciaNome: 'BACIA - 01', coefC: 0.8 }])
  })

  it('rejeita planilha de layout antigo (sem a coluna de contribuição no fim do cabeçalho)', () => {
    const buffer = montarBuffer([
      ['Dispositivo', 'BACIA - 01'],
      ['C da bacia (0 a 1)', 0.65],
      ['SOMA % (deve fechar em 100)', 100],
      ['CT - 1', 100],
      ['CT - 2', ''],
    ])
    expect(() => parsePlanilhaCaptacao(buffer)).toThrow('layout antigo')
  })
})
