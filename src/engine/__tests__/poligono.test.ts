import { describe, expect, it } from 'vitest'
import { centroidePoligono, pontoDentroPoligono } from '../poligono'

describe('pontoDentroPoligono', () => {
  const quadrado = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]

  it('detecta ponto claramente dentro', () => {
    expect(pontoDentroPoligono({ x: 5, y: 5 }, quadrado)).toBe(true)
  })

  it('detecta ponto claramente fora', () => {
    expect(pontoDentroPoligono({ x: 20, y: 20 }, quadrado)).toBe(false)
  })

  it('funciona em polígono côncavo (formato de L)', () => {
    const formaL = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 5, y: 5 },
      { x: 5, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(pontoDentroPoligono({ x: 7, y: 7 }, formaL)).toBe(false) // no "recorte" do L
    expect(pontoDentroPoligono({ x: 2, y: 7 }, formaL)).toBe(true) // dentro da perna esquerda
  })

  it('retorna false pra polígono degenerado (menos de 3 vértices)', () => {
    expect(pontoDentroPoligono({ x: 1, y: 1 }, [{ x: 0, y: 0 }])).toBe(false)
  })
})

describe('centroidePoligono', () => {
  it('calcula a média dos vértices', () => {
    const quadrado = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(centroidePoligono(quadrado)).toEqual({ x: 5, y: 5 })
  })

  it('retorna null pra lista vazia', () => {
    expect(centroidePoligono([])).toBeNull()
  })
})
