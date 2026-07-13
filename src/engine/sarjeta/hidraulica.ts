/**
 * Velocidade média pela equação de Manning: V = (1/n) · Rh^(2/3) · √I
 * Genérica em relação à geometria — recebe apenas o raio hidráulico já
 * calculado, não importa de qual tipo de seção ele veio.
 */
export function calcularVelocidade(raioHidraulicoM: number, manningN: number, declividadeLongitudinalMM: number): number {
  return (1 / manningN) * Math.pow(raioHidraulicoM, 2 / 3) * Math.sqrt(declividadeLongitudinalMM)
}

/** Vazão da sarjeta: Q = A · V */
export function calcularVazao(areaMolhadaM2: number, velocidadeMs: number): number {
  return areaMolhadaM2 * velocidadeMs
}

/**
 * Declividade longitudinal necessária para atingir uma velocidade alvo na
 * condição de projeto (lâmina máxima Y0, portanto Rh máximo) — inversão da
 * equação de Manning: I = (V·n / Rh^(2/3))².
 *
 * Uso típico: quando a via não pode ter declividade longitudinal (ex.: pátio
 * entre galpões nivelado dos dois lados) e a queda é dada só ao longo da
 * própria calha — em vez de arbitrar a declividade, define-se a velocidade
 * mínima de autolimpeza desejada (tipicamente 0,5 m/s) e calcula-se daí a
 * declividade de projeto necessária.
 */
export function calcularDeclividadeParaVelocidade(velocidadeAlvoMs: number, raioHidraulicoM: number, manningN: number): number {
  return Math.pow((velocidadeAlvoMs * manningN) / Math.pow(raioHidraulicoM, 2 / 3), 2)
}
