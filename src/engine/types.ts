// Tipos do motor de cálculo de drenagem pluvial (sarjeta crítica + rede de tubos).

export interface EquacaoIdf {
  k: number
  a: number
  b: number
  c: number
}

export type TipoCaixa = 'pv' | 'boca_de_lobo' | 'caixa_passagem'
export type ManningOrigem = 'landxml' | 'tabela_interna' | 'manual'
export type VinculoStatus = 'automatico' | 'manual' | 'pendente'

export interface Caixa {
  id: string
  nome: string
  tipo: TipoCaixa
  x?: number
  y?: number
  cota_terreno?: number
  cota_fundo?: number
}

export interface Trecho {
  id: string
  nome: string
  caixaMontanteId: string
  caixaJusanteId: string
  comprimentoM: number
  diametroM: number
  declividadeMM: number // m/m
  material?: string
  manningN: number | null
  manningNOrigem: ManningOrigem
}

export interface Bacia {
  id: string
  nome: string
  areaM2: number
  coefC: number
  tcMin?: number
  pourPointX: number
  pourPointY: number
  caixaDestinoId: string | null
}

export interface ResolverLaminaResult {
  lamina: number
  theta: number
  raioHidraulico: number
  velocidade: number
  vazaoCalculada: number
  iteracoes: number
  convergiu: boolean
}
