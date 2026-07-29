export interface Ponto {
  x: number
  y: number
}

/**
 * Ray casting (algoritmo do número de cruzamentos): lança um raio horizontal
 * do ponto até o infinito e conta quantas arestas do polígono ele cruza —
 * ímpar = dentro, par = fora. Padrão pra teste ponto-em-polígono, O(n) nos
 * vértices, funciona pra polígonos convexos ou côncavos (bacias raramente
 * são convexas).
 */
export function pontoDentroPoligono(ponto: Ponto, poligono: Ponto[]): boolean {
  if (poligono.length < 3) return false
  let dentro = false
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const vi = poligono[i]
    const vj = poligono[j]
    const cruza = vi.y > ponto.y !== vj.y > ponto.y
    if (!cruza) continue
    const xCruzamento = ((vj.x - vi.x) * (ponto.y - vi.y)) / (vj.y - vi.y) + vi.x
    if (ponto.x < xCruzamento) dentro = !dentro
  }
  return dentro
}

/** Centroide simples (média aritmética dos vértices) — usado como pour point
 * de fallback quando a bacia vem de um Parcel sem ponto de descarga explícito. */
export function centroidePoligono(poligono: Ponto[]): Ponto | null {
  if (poligono.length === 0) return null
  const soma = poligono.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 })
  return { x: soma.x / poligono.length, y: soma.y / poligono.length }
}
