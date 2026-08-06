import * as XLSX from 'xlsx'
import * as XLSXStyle from 'xlsx-js-style'
import type { BaciaRecord } from '../lib/baciasStorage'
import type { CaixaRecord } from '../lib/redeStorage'
import type { CaptacaoRecord } from '../lib/captacaoStorage'
import { calcularIntensidadeIdf } from './idf'
import { RATIONAL_METHOD_K } from './constants'
import type { EquacaoIdf } from './types'

const ABA_CAPTACAO = 'Captação'
const COL_DISPOSITIVO = 0
const LINHA_CABECALHO = 0 // nomes das bacias
const LINHA_COEF_C = 1 // C de cada bacia (editável, aplicado na reimportação)
// linha 2 = área de cada bacia (m²) -- só informativa, não tem constante própria porque
// parsePlanilhaCaptacao nunca lê essa linha de volta.
const LINHA_SOMA = 3 // soma % por bacia (fórmula)
const LINHA_PRIMEIRO_DISPOSITIVO = 4

/** Tempo de concentração fixo (min) usado só pra estimar a coluna de contribuição de cada
 * dispositivo na planilha -- é uma referência rápida pro engenheiro comparar a ordem de
 * grandeza entre dispositivos, não substitui o Tc real calculado rio abaixo no cálculo da rede
 * (que varia por trecho, dependendo do caminho crítico até ali). */
const TC_REFERENCIA_MIN = 10

/**
 * Gera e baixa a planilha bacia x dispositivo: linhas = dispositivos,
 * colunas = bacias, linha 2 = coeficiente C de cada bacia (editável), linha 3 = área de cada
 * bacia (m², só informativo), linha 4 = soma de % por bacia (deve fechar em 100). O engenheiro
 * edita manualmente para vincular dispositivos que ficam FORA do polígono da bacia mas ainda
 * captam água dela, e reimporta pelo card "3. Importação da tabela ajustada". Escrita com
 * xlsx-js-style (em vez do `xlsx` puro usado no resto do app) porque é o único dos dois que
 * realmente grava estilo de célula (rotação de texto) no arquivo -- o `xlsx` community aceita a
 * propriedade `s` sem erro mas descarta silenciosamente na hora de escrever.
 *
 * Última coluna (só leitura, não reimporta): vazão de contribuição estimada de cada dispositivo,
 * Q = 2,78×10⁻⁷ × ΣC×A(bacias vinculadas, ponderado pelo % de cada uma) × i(Tc=10min) — usa a
 * equação IDF/tempo de retorno da revisão. Sem equação vinculada, fica em branco.
 */
export function gerarPlanilhaCaptacao(
  bacias: BaciaRecord[],
  dispositivos: CaixaRecord[],
  captacoes: CaptacaoRecord[],
  nomeRevisao: string,
  equacaoIdf: EquacaoIdf | null,
  tempoRetornoAnos: number
): void {
  const baciasOrdenadas = [...bacias].sort((a, b) => a.nome.localeCompare(b.nome))
  const dispositivosOrdenados = [...dispositivos].sort((a, b) => a.nome.localeCompare(b.nome))

  const percentualPorPar = new Map<string, number>()
  for (const c of captacoes) percentualPorPar.set(`${c.bacia_id}|${c.dispositivo_id}`, c.percentual)

  const intensidadeReferencia = equacaoIdf ? calcularIntensidadeIdf(equacaoIdf, tempoRetornoAnos, TC_REFERENCIA_MIN) : null

  const colContribuicao = baciasOrdenadas.length + 1
  const cabecalhoContribuicao = `Contribuição Q estimada (Tc=${TC_REFERENCIA_MIN}min) m³/s`

  const linhas: (string | number)[][] = []
  linhas.push(['Dispositivo', ...baciasOrdenadas.map((b) => b.nome), cabecalhoContribuicao])
  linhas.push(['C da bacia (0 a 1)', ...baciasOrdenadas.map((b) => b.coef_c ?? ''), ''])
  linhas.push(['Área da bacia (m²)', ...baciasOrdenadas.map((b) => b.area_m2), ''])
  linhas.push(['SOMA % (deve fechar em 100)', ...baciasOrdenadas.map(() => 0), ''])
  for (const d of dispositivosOrdenados) {
    let caContribuicao = 0
    baciasOrdenadas.forEach((b) => {
      const pct = percentualPorPar.get(`${b.id}|${d.id}`)
      if (pct && b.coef_c != null) caContribuicao += b.area_m2 * (pct / 100) * b.coef_c
    })
    const contribuicaoQ = intensidadeReferencia != null ? RATIONAL_METHOD_K * caContribuicao * intensidadeReferencia : ''
    linhas.push([d.nome, ...baciasOrdenadas.map((b) => percentualPorPar.get(`${b.id}|${d.id}`) ?? ''), contribuicaoQ])
  }

  const ws = XLSXStyle.utils.aoa_to_sheet(linhas)
  // colunas de bacia estreitas (nome vai girado 90° no cabeçalho); a primeira coluna
  // (nome do dispositivo/rótulo de linha) e a última (contribuição) ficam largas e horizontais.
  ws['!cols'] = [{ wch: 28 }, ...baciasOrdenadas.map(() => ({ wch: 6 })), { wch: 16 }]
  ws['!rows'] = [{ hpt: 110 }]

  baciasOrdenadas.forEach((_, i) => {
    const ref = XLSXStyle.utils.encode_cell({ r: LINHA_CABECALHO, c: i + 1 })
    ws[ref].s = { alignment: { textRotation: 90, vertical: 'bottom', horizontal: 'center' }, font: { bold: true } }
  })

  const ultimaLinhaExcel = LINHA_PRIMEIRO_DISPOSITIVO + dispositivosOrdenados.length // 1-based
  const primeiraLinhaDadosExcel = LINHA_PRIMEIRO_DISPOSITIVO + 1
  baciasOrdenadas.forEach((_, i) => {
    const col = XLSXStyle.utils.encode_col(i + 1)
    const ref = XLSXStyle.utils.encode_cell({ r: LINHA_SOMA, c: i + 1 })
    ws[ref] = { t: 'n', f: `SUM(${col}${primeiraLinhaDadosExcel}:${col}${ultimaLinhaExcel})` }
  })

  if (intensidadeReferencia != null) {
    for (let r = LINHA_PRIMEIRO_DISPOSITIVO; r < LINHA_PRIMEIRO_DISPOSITIVO + dispositivosOrdenados.length; r++) {
      const ref = XLSXStyle.utils.encode_cell({ r, c: colContribuicao })
      if (ws[ref]) ws[ref].z = '0.0000'
    }
  }

  const wsInstrucoes = XLSXStyle.utils.aoa_to_sheet([
    ['Tabela de captação — dispositivos x bacias — miso4dren'],
    [''],
    ['Como preencher'],
    ['Linha "C da bacia": o coeficiente de escoamento (0 a 1) daquela bacia — na reimportação, substitui o C já cadastrado. Deixe em branco para não mexer no C atual.'],
    ['Linha "Área da bacia (m²)": só informativa, não é reimportada — ajuda a conferir se o % de cada dispositivo faz sentido pro tamanho da bacia.'],
    ['Cada célula sob um dispositivo é o % da vazão da bacia (coluna) captado por aquele dispositivo (linha).'],
    ['A soma de cada coluna (linha "SOMA %") precisa fechar em 100% — o sistema rejeita a reimportação se alguma bacia passar de 100%.'],
    [
      'Use isso principalmente para vincular dispositivos que ficam FORA do polígono da bacia mas ainda captam água dela (ex.: telhado sem caixa dentro do prédio, escoamento até uma sarjeta vizinha).',
    ],
    ['Deixe a célula em branco (ou 0) para dispositivos que não captam daquela bacia.'],
    [
      'Última coluna ("Contribuição Q estimada"): vazão estimada que cada dispositivo recebe, somando as bacias vinculadas (área × % × C) e aplicando a intensidade da chuva com Tc fixo de 10 min -- só uma referência rápida pra comparar dispositivos entre si, não substitui o Tc real (que varia por trecho) calculado em Rede Pluvial. Fica em branco se a revisão não tiver equação IDF vinculada. Também não é reimportada.',
    ],
    ['A reimportação SUBSTITUI todos os vínculos de cada bacia presente na planilha pelo que estiver preenchido — não faz merge com o que já existia.'],
    ['Não renomeie os dispositivos/bacias nem adicione linhas/colunas novas — o casamento é feito pelo nome exato já cadastrado no sistema.'],
    [''],
    ['Onde reimportar'],
    ['Cadastros → Bacias → card "3. Importação da tabela ajustada" → selecione este arquivo já editado.'],
  ])
  wsInstrucoes['!cols'] = [{ wch: 100 }]

  const wb = XLSXStyle.utils.book_new()
  XLSXStyle.utils.book_append_sheet(wb, ws, ABA_CAPTACAO)
  XLSXStyle.utils.book_append_sheet(wb, wsInstrucoes, 'Instruções')

  const slug = nomeRevisao.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  XLSXStyle.writeFile(wb, `captacao_bacias_${slug}.xlsx`)
}

export interface EntradaCaptacaoPlanilha {
  baciaNome: string
  dispositivoNome: string
  percentual: number
}

export interface EntradaCoefCPlanilha {
  baciaNome: string
  coefC: number
}

export interface ResultadoParsePlanilhaCaptacao {
  entradas: EntradaCaptacaoPlanilha[]
  coefCs: EntradaCoefCPlanilha[]
  baciasNaPlanilha: string[]
  avisos: string[]
}

/**
 * Lê a planilha ajustada pelo usuário. Espera a mesma estrutura gerada por
 * `gerarPlanilhaCaptacao`: linha 1 = nomes de bacias (última coluna = "Contribuição...", só
 * leitura, ignorada aqui), linha 2 = C de cada bacia (opcional), linha 3 = área (ignorada,
 * informativa), linha 4 = soma (ignorada, é fórmula), linhas seguintes = dispositivo +
 * percentuais.
 */
export function parsePlanilhaCaptacao(arrayBuffer: ArrayBuffer): ResultadoParsePlanilhaCaptacao {
  const wb = XLSX.read(arrayBuffer, { type: 'array' })
  const ws = wb.Sheets[ABA_CAPTACAO] ?? wb.Sheets[wb.SheetNames[0]]
  if (!ws) throw new Error('Planilha vazia ou sem aba de dados.')

  const linhas: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' })
  if (linhas.length <= LINHA_PRIMEIRO_DISPOSITIVO) {
    throw new Error('Planilha sem linhas de dispositivo — confira se não apagou tudo por engano.')
  }

  const cabecalho = linhas[LINHA_CABECALHO]
  const ultimaCelulaCabecalho = String(cabecalho[cabecalho.length - 1] ?? '').toLowerCase()
  if (!ultimaCelulaCabecalho.startsWith('contribuição')) {
    throw new Error(
      'Última coluna do cabeçalho não é "Contribuição..." -- essa planilha parece de um layout antigo ou foi editada. Exporte de novo (Cadastros → Bacias → "Exportar tabela de captação") e refaça os ajustes.'
    )
  }
  const baciasNaPlanilha = cabecalho.slice(1, -1).map((v) => String(v).trim())
  if (baciasNaPlanilha.some((n) => !n)) {
    throw new Error('Existe uma coluna de bacia sem nome no cabeçalho (linha 1) — confira se não sobrou/faltou coluna.')
  }

  const avisos: string[] = []

  const coefCs: EntradaCoefCPlanilha[] = []
  const linhaCoefC = linhas[LINHA_COEF_C]
  baciasNaPlanilha.forEach((baciaNome, i) => {
    const bruto = linhaCoefC?.[i + 1]
    if (bruto === '' || bruto == null) return // em branco = não mexe no C atual
    const coefC = typeof bruto === 'number' ? bruto : Number(String(bruto).replace(',', '.'))
    if (!Number.isFinite(coefC) || coefC < 0 || coefC > 1) {
      avisos.push(`C inválido para "${baciaNome}": "${bruto}" (precisa estar entre 0 e 1) — ignorado.`)
      return
    }
    coefCs.push({ baciaNome, coefC })
  })

  const entradas: EntradaCaptacaoPlanilha[] = []

  for (let r = LINHA_PRIMEIRO_DISPOSITIVO; r < linhas.length; r++) {
    const linha = linhas[r]
    const dispositivoNome = String(linha[COL_DISPOSITIVO] ?? '').trim()
    if (!dispositivoNome) continue // linha em branco no fim da planilha

    baciasNaPlanilha.forEach((baciaNome, i) => {
      const bruto = linha[i + 1]
      if (bruto === '' || bruto == null) return
      const percentual = typeof bruto === 'number' ? bruto : Number(String(bruto).replace(',', '.'))
      if (!Number.isFinite(percentual)) {
        avisos.push(`Valor inválido em "${dispositivoNome}" × "${baciaNome}": "${bruto}" — ignorado.`)
        return
      }
      if (percentual <= 0) return // célula zerada = sem captação, não gera vínculo
      entradas.push({ baciaNome, dispositivoNome, percentual })
    })
  }

  return { entradas, coefCs, baciasNaPlanilha, avisos }
}
