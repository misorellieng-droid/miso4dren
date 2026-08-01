import * as XLSX from 'xlsx'
import type { BaciaRecord } from '../lib/baciasStorage'
import type { CaixaRecord } from '../lib/redeStorage'
import type { CaptacaoRecord } from '../lib/captacaoStorage'

const ABA_CAPTACAO = 'Captação'
const COL_DISPOSITIVO = 0
const LINHA_CABECALHO = 0 // nomes das bacias
const LINHA_SOMA = 1 // soma % por bacia (fórmula)
const LINHA_PRIMEIRO_DISPOSITIVO = 2

/**
 * Gera e baixa a planilha bacia x dispositivo: linhas = dispositivos,
 * colunas = bacias, linha 2 = soma de % por bacia (deve fechar em 100).
 * O engenheiro edita manualmente para vincular dispositivos que ficam FORA
 * do polígono da bacia mas ainda captam água dela, e reimporta pelo card
 * "3. Importação da tabela ajustada".
 */
export function gerarPlanilhaCaptacao(
  bacias: BaciaRecord[],
  dispositivos: CaixaRecord[],
  captacoes: CaptacaoRecord[],
  nomeRevisao: string
): void {
  const baciasOrdenadas = [...bacias].sort((a, b) => a.nome.localeCompare(b.nome))
  const dispositivosOrdenados = [...dispositivos].sort((a, b) => a.nome.localeCompare(b.nome))

  const percentualPorPar = new Map<string, number>()
  for (const c of captacoes) percentualPorPar.set(`${c.bacia_id}|${c.dispositivo_id}`, c.percentual)

  const linhas: (string | number)[][] = []
  linhas.push(['Dispositivo', ...baciasOrdenadas.map((b) => b.nome)])
  linhas.push(['SOMA % (deve fechar em 100)', ...baciasOrdenadas.map(() => 0)])
  for (const d of dispositivosOrdenados) {
    linhas.push([d.nome, ...baciasOrdenadas.map((b) => percentualPorPar.get(`${b.id}|${d.id}`) ?? '')])
  }

  const ws = XLSX.utils.aoa_to_sheet(linhas)
  ws['!cols'] = [{ wch: 28 }, ...baciasOrdenadas.map(() => ({ wch: 16 }))]

  const ultimaLinhaExcel = LINHA_PRIMEIRO_DISPOSITIVO + dispositivosOrdenados.length // 1-based
  const primeiraLinhaDadosExcel = LINHA_PRIMEIRO_DISPOSITIVO + 1
  baciasOrdenadas.forEach((_, i) => {
    const col = XLSX.utils.encode_col(i + 1)
    const ref = XLSX.utils.encode_cell({ r: LINHA_SOMA, c: i + 1 })
    ws[ref] = { t: 'n', f: `SUM(${col}${primeiraLinhaDadosExcel}:${col}${ultimaLinhaExcel})` }
  })

  const wsInstrucoes = XLSX.utils.aoa_to_sheet([
    ['Tabela de captação — dispositivos x bacias — miso4dren'],
    [''],
    ['Como preencher'],
    ['Cada célula é o % da vazão da bacia (coluna) captado por aquele dispositivo (linha).'],
    ['A soma de cada coluna (linha "SOMA %") precisa fechar em 100% — o sistema rejeita a reimportação se alguma bacia passar de 100%.'],
    [
      'Use isso principalmente para vincular dispositivos que ficam FORA do polígono da bacia mas ainda captam água dela (ex.: telhado sem caixa dentro do prédio, escoamento até uma sarjeta vizinha).',
    ],
    ['Deixe a célula em branco (ou 0) para dispositivos que não captam daquela bacia.'],
    ['A reimportação SUBSTITUI todos os vínculos de cada bacia presente na planilha pelo que estiver preenchido — não faz merge com o que já existia.'],
    ['Não renomeie os dispositivos/bacias nem adicione linhas/colunas novas — o casamento é feito pelo nome exato já cadastrado no sistema.'],
    [''],
    ['Onde reimportar'],
    ['Cadastros → Bacias → card "3. Importação da tabela ajustada" → selecione este arquivo já editado.'],
  ])
  wsInstrucoes['!cols'] = [{ wch: 100 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, ABA_CAPTACAO)
  XLSX.utils.book_append_sheet(wb, wsInstrucoes, 'Instruções')

  const slug = nomeRevisao.replace(/[^a-z0-9]+/gi, '_').toLowerCase()
  XLSX.writeFile(wb, `captacao_bacias_${slug}.xlsx`)
}

export interface EntradaCaptacaoPlanilha {
  baciaNome: string
  dispositivoNome: string
  percentual: number
}

export interface ResultadoParsePlanilhaCaptacao {
  entradas: EntradaCaptacaoPlanilha[]
  baciasNaPlanilha: string[]
  avisos: string[]
}

/**
 * Lê a planilha ajustada pelo usuário. Espera a mesma estrutura gerada por
 * `gerarPlanilhaCaptacao`: linha 1 = nomes de bacias, linha 2 = soma
 * (ignorada, é fórmula), linhas seguintes = dispositivo + percentuais.
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
  const baciasNaPlanilha = cabecalho.slice(1).map((v) => String(v).trim())
  if (baciasNaPlanilha.some((n) => !n)) {
    throw new Error('Existe uma coluna de bacia sem nome no cabeçalho (linha 1) — confira se não sobrou/faltou coluna.')
  }

  const entradas: EntradaCaptacaoPlanilha[] = []
  const avisos: string[] = []

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

  return { entradas, baciasNaPlanilha, avisos }
}
