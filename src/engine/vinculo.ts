import type { VinculoStatus } from './types'

export interface BaciaParaVinculo {
  id: string
  pourPointX: number
  pourPointY: number
}

export interface CaixaParaVinculo {
  id: string
  x: number
  y: number
}

export interface ResultadoVinculo {
  baciaId: string
  caixaDestinoId: string | null
  vinculoStatus: VinculoStatus
  candidatas: string[] // caixaIds dentro da tolerância — útil pra tela de revisão manual
}

const TOLERANCIA_PADRAO_M = 5

/**
 * Vincula cada bacia à caixa mais próxima do seu pour point, dentro de uma
 * tolerância (default 5 m). Exatamente uma caixa na tolerância → vínculo
 * automático. Zero ou mais de uma → pendente, para resolução manual.
 */
export function vincularBaciasCaixas(
  bacias: BaciaParaVinculo[],
  caixas: CaixaParaVinculo[],
  toleranciaM = TOLERANCIA_PADRAO_M
): ResultadoVinculo[] {
  return bacias.map((bacia) => {
    const candidatas = caixas
      .map((caixa) => ({ caixa, dist: Math.hypot(caixa.x - bacia.pourPointX, caixa.y - bacia.pourPointY) }))
      .filter(({ dist }) => dist <= toleranciaM)
      .sort((a, b) => a.dist - b.dist)

    if (candidatas.length === 1) {
      return {
        baciaId: bacia.id,
        caixaDestinoId: candidatas[0].caixa.id,
        vinculoStatus: 'automatico',
        candidatas: candidatas.map((c) => c.caixa.id),
      }
    }

    return {
      baciaId: bacia.id,
      caixaDestinoId: null,
      vinculoStatus: 'pendente',
      candidatas: candidatas.map((c) => c.caixa.id),
    }
  })
}
