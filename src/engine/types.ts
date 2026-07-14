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
  caixaDestinoId: string | null // legado — ver CaptacaoBaciaDispositivo, que substitui o vínculo 1:1 por rateio percentual N:N
}

export type OrigemPercentual = 'derivado_rede' | 'manual'

/**
 * Relação muitos-para-muitos entre bacia e dispositivo (caixa), com o
 * percentual da vazão da bacia captado por esse dispositivo específico —
 * substitui o antigo `Bacia.caixaDestinoId` escalar (1 bacia → no máximo 1
 * dispositivo) por um modelo onde uma bacia pode alimentar vários
 * dispositivos e um dispositivo pode captar de várias bacias.
 *
 * `origem: 'manual'` é digitado pelo engenheiro e fica travado até ser
 * editado de novo. `origem: 'derivado_rede'` viria calculado da posição
 * geométrica de um divisor de águas conhecido (ex.: módulo de sarjetão em
 * dente de serra) — o valor já existe no tipo, mas nenhum módulo ainda
 * popula automaticamente essa origem.
 */
export interface CaptacaoBaciaDispositivo {
  id: string
  baciaId: string
  dispositivoId: string
  percentual: number
  origem: OrigemPercentual
  atualizadoEm: string
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
