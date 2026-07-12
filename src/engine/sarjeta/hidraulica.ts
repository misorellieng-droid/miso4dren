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
