import type { ResolverLaminaResult } from './types'

// Acima desse limite (93% do diâmetro) a curva de Manning para seção circular
// deixa de ser monotônica (a vazão máxima ocorre perto de y/D≈0.94 e depois
// cai até a seção plena) — o cap evita que a bisseção convirja para o ramo
// descendente da curva.
const CAP_Y_SOBRE_D = 0.93
const TOLERANCIA_RELATIVA = 0.001 // 0.1% de Q_projeto
const MAX_ITERACOES = 50

export interface EstadoHidraulico {
  theta: number
  areaMolhada: number
  raioHidraulico: number
  velocidade: number
  vazaoCalculada: number
}

/**
 * Estado hidráulico (θ, área molhada, raio hidráulico, velocidade e vazão)
 * de uma seção circular parcialmente cheia com lâmina `y`, diâmetro `d`,
 * declividade `declividade` (m/m) e rugosidade de Manning `manningN`.
 */
export function estadoHidraulico(y: number, d: number, declividade: number, manningN: number): EstadoHidraulico {
  const razao = Math.max(-1, Math.min(1, 1 - (2 * y) / d))
  const theta = 2 * Math.acos(razao)
  const areaMolhada = (d * d / 8) * (theta - Math.sin(theta))
  const raioHidraulico = theta === 0 ? 0 : (d / 4) * (1 - Math.sin(theta) / theta)
  const velocidade = (1 / manningN) * Math.pow(raioHidraulico, 2 / 3) * Math.sqrt(declividade)
  const vazaoCalculada = velocidade * areaMolhada
  return { theta, areaMolhada, raioHidraulico, velocidade, vazaoCalculada }
}

export interface ResolverLaminaParams {
  qProjetoM3s: number
  diametroM: number
  declividadeMM: number
  manningN: number
}

/**
 * Encontra, por bisseção no intervalo (0, 0.93×D], a lâmina `y` tal que
 * Q_calculada(y) = Q_projeto. Critério de parada: |Q_calculada − Q_projeto|
 * < 0.1% de Q_projeto, ou 50 iterações.
 */
export function resolverLamina(params: ResolverLaminaParams): ResolverLaminaResult {
  const { qProjetoM3s, diametroM, declividadeMM, manningN } = params

  if (qProjetoM3s <= 0) {
    return { lamina: 0, theta: 0, raioHidraulico: 0, velocidade: 0, vazaoCalculada: 0, iteracoes: 0, convergiu: true }
  }

  const upper = CAP_Y_SOBRE_D * diametroM
  let lo = 1e-9
  let hi = upper
  let mid = hi
  let estado = estadoHidraulico(mid, diametroM, declividadeMM, manningN)
  const tolAbs = TOLERANCIA_RELATIVA * qProjetoM3s

  let iteracoes = 0
  for (iteracoes = 1; iteracoes <= MAX_ITERACOES; iteracoes++) {
    mid = (lo + hi) / 2
    estado = estadoHidraulico(mid, diametroM, declividadeMM, manningN)
    const diff = estado.vazaoCalculada - qProjetoM3s
    if (Math.abs(diff) < tolAbs) break
    if (diff < 0) lo = mid
    else hi = mid
  }

  const convergiu = Math.abs(estado.vazaoCalculada - qProjetoM3s) < tolAbs

  return {
    lamina: mid,
    theta: estado.theta,
    raioHidraulico: estado.raioHidraulico,
    velocidade: estado.velocidade,
    vazaoCalculada: estado.vazaoCalculada,
    iteracoes,
    convergiu,
  }
}
