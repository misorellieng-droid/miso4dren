// Parser do CSV de bacias (Data Extraction de Catchment do Civil 3D).
// Colunas esperadas: nome_bacia, area_m2, coef_c, tc_min (opcional),
// pour_point_x, pour_point_y. Aceita separador "," ou ";" (exports em
// pt-BR do Excel costumam usar ";" com decimal em vírgula).

export interface BaciaImportada {
  nome: string
  areaM2: number
  coefC: number
  tcMin?: number
  pourPointX: number
  pourPointY: number
}

const COLUNAS_OBRIGATORIAS = ['nome_bacia', 'area_m2', 'coef_c', 'pour_point_x', 'pour_point_y'] as const

function detectarDelimitador(headerLine: string): ',' | ';' {
  return headerLine.includes(';') && !headerLine.includes(',') ? ';' : headerLine.includes(';') ? ';' : ','
}

function splitLinhaCsv(line: string, delimitador: string): string[] {
  const campos: string[] = []
  let atual = ''
  let dentroDeAspas = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      dentroDeAspas = !dentroDeAspas
    } else if (ch === delimitador && !dentroDeAspas) {
      campos.push(atual)
      atual = ''
    } else {
      atual += ch
    }
  }
  campos.push(atual)
  return campos.map((c) => c.trim().replace(/^"|"$/g, ''))
}

function parseNumero(valor: string, delimitador: string): number {
  const normalizado = delimitador === ';' ? valor.replace(',', '.') : valor
  const n = Number(normalizado)
  return n
}

export function parseBaciasCsv(csvText: string): BaciaImportada[] {
  const linhas = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0)
  if (linhas.length === 0) return []

  const delimitador = detectarDelimitador(linhas[0])
  const header = splitLinhaCsv(linhas[0], delimitador).map((h) => h.toLowerCase())

  for (const coluna of COLUNAS_OBRIGATORIAS) {
    if (!header.includes(coluna)) {
      throw new Error(`CSV de bacias inválido: coluna obrigatória "${coluna}" não encontrada.`)
    }
  }

  const idx = (nome: string) => header.indexOf(nome)
  const iNome = idx('nome_bacia')
  const iArea = idx('area_m2')
  const iC = idx('coef_c')
  const iTc = idx('tc_min')
  const iX = idx('pour_point_x')
  const iY = idx('pour_point_y')

  const bacias: BaciaImportada[] = []
  for (let i = 1; i < linhas.length; i++) {
    const campos = splitLinhaCsv(linhas[i], delimitador)
    if (campos.every((c) => c === '')) continue

    const nome = campos[iNome]
    const areaM2 = parseNumero(campos[iArea], delimitador)
    const coefC = parseNumero(campos[iC], delimitador)
    const pourPointX = parseNumero(campos[iX], delimitador)
    const pourPointY = parseNumero(campos[iY], delimitador)
    const tcRaw = iTc >= 0 ? campos[iTc] : ''
    const tcMin = tcRaw !== '' && tcRaw !== undefined ? parseNumero(tcRaw, delimitador) : undefined

    if (!nome || !Number.isFinite(areaM2) || !Number.isFinite(coefC) || !Number.isFinite(pourPointX) || !Number.isFinite(pourPointY)) {
      throw new Error(`CSV de bacias inválido na linha ${i + 1}: valores numéricos ausentes ou malformados.`)
    }

    bacias.push({ nome, areaM2, coefC, tcMin, pourPointX, pourPointY })
  }

  return bacias
}
