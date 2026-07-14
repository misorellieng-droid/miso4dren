import { describe, expect, it } from 'vitest'
import { resolverPorBisseccao } from '../bisseccao'

describe('resolverPorBisseccao', () => {
  it('encontra a raiz de uma função linear simples', () => {
    const resultado = resolverPorBisseccao({ f: (x) => x - 5 })
    expect(resultado.valor).toBeCloseTo(5, 2)
    expect(resultado.convergiu).toBe(true)
  })

  it('expande o limite superior quando a raiz está além do hiInicial', () => {
    const resultado = resolverPorBisseccao({ f: (x) => x - 500, hiInicial: 10 })
    expect(resultado.valor).toBeCloseTo(500, 0)
    expect(resultado.convergiu).toBe(true)
  })

  it('replica o padrão de f(L) do módulo: Q(L) linear crescente menos Qcap(L) proporcional a 1/√L — monotônica, raiz única', () => {
    const f = (L: number) => 0.001 * L - 0.01 / Math.sqrt(L)
    const resultado = resolverPorBisseccao({ f })
    expect(f(resultado.valor)).toBeCloseTo(0, 3)
    expect(resultado.convergiu).toBe(true)
  })

  it('não converge (mas termina) se a raiz estiver além do hiMaximo', () => {
    const resultado = resolverPorBisseccao({ f: (x) => x - 1e9, hiMaximo: 1000 })
    expect(resultado.convergiu).toBe(false)
  })
})
