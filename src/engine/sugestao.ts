import { resolverLamina } from './bissecao'

export interface LimitesConformidade {
  limiteYD: number
  velMinMs: number
  velMaxMs: number
  declMinMM: number
  declMaxMM: number
}

// Diâmetros comerciais usuais (PVC corrugado + concreto armado), em metros.
export const DIAMETROS_COMERCIAIS_M = [0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.2, 1.5]

function atendeConformidade(
  qProjetoM3s: number,
  diametroM: number,
  declividadeMM: number,
  manningN: number,
  limites: LimitesConformidade
): boolean {
  if (declividadeMM < limites.declMinMM || declividadeMM > limites.declMaxMM) return false
  const solver = resolverLamina({ qProjetoM3s, diametroM, declividadeMM, manningN })
  if (!solver.convergiu) return false
  if (solver.lamina / diametroM > limites.limiteYD) return false
  if (solver.velocidade < limites.velMinMs || solver.velocidade > limites.velMaxMs) return false
  return true
}

/** Menor diâmetro comercial (mantendo a declividade atual) que atende todos os critérios de conformidade. */
export function sugerirDiametro(
  qProjetoM3s: number,
  declividadeMM: number,
  manningN: number,
  limites: LimitesConformidade
): number | null {
  for (const d of DIAMETROS_COMERCIAIS_M) {
    if (atendeConformidade(qProjetoM3s, d, declividadeMM, manningN, limites)) return d
  }
  return null
}

/**
 * Declividade mais próxima da atual (dentro da faixa mín/máx configurada em Critérios de
 * conformidade) que atende todos os critérios, mantendo o diâmetro atual. Varre a faixa em
 * passos finos em vez de bissecção porque a conformidade não é estritamente monotônica em S
 * (velocidade tem limite mínimo E máximo).
 */
export function sugerirDeclividade(
  qProjetoM3s: number,
  diametroM: number,
  manningN: number,
  limites: LimitesConformidade,
  declividadeAtualMM: number
): number | null {
  const PASSOS = 300
  let melhor: number | null = null
  let melhorDist = Infinity
  for (let i = 0; i <= PASSOS; i++) {
    const s = limites.declMinMM + ((limites.declMaxMM - limites.declMinMM) * i) / PASSOS
    if (!atendeConformidade(qProjetoM3s, diametroM, s, manningN, limites)) continue
    const dist = Math.abs(s - declividadeAtualMM)
    if (dist < melhorDist) {
      melhorDist = dist
      melhor = s
    }
  }
  return melhor
}
