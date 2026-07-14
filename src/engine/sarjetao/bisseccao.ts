// Bisseção genérica em f: number => number, monotônica crescente — usada pra
// achar o comprimento de equilíbrio L tal que Q(L) - Qcap(L) = 0 no módulo de
// sarjetão em dente de serra. Diferente de src/engine/bissecao.ts::resolverLamina
// (que embute a geometria de uma seção circular), esta não sabe nada sobre
// hidráulica — só busca raiz.

const HI_MAXIMO_PADRAO = 10000 // m — expansão do limite superior não passa disso; sinal de parâmetros incoerentes se chegar lá

export interface ResolverPorBisseccaoParams {
  f: (x: number) => number // negativo = capacidade sobra (x pode crescer); positivo = vazão supera capacidade (x precisa diminuir)
  loInicial?: number
  hiInicial?: number
  hiMaximo?: number
  toleranciaRelativa?: number // sobre a largura do intervalo, relativa ao ponto médio
  maxIteracoes?: number
}

export interface ResolverPorBisseccaoResultado {
  valor: number
  iteracoes: number
  convergiu: boolean
}

/**
 * Busca a raiz de `f` por bisseção, expandindo o limite superior
 * geometricamente até enquadrar a raiz (assume f(loInicial) < 0 < f(hi) pra
 * algum hi alcançável). Critério de parada: largura do intervalo menor que
 * `toleranciaRelativa` do ponto médio, ou `maxIteracoes`. Se a expansão
 * esbarrar em `hiMaximo` sem que `f` mude de sinal, a raiz não está
 * enquadrada — retorna `convergiu: false` em vez de deixar a bisseção
 * "convergir" para o próprio limite hi por engano (a largura do intervalo
 * encolhe de qualquer forma, mesmo sem ter encontrado uma raiz real).
 */
export function resolverPorBisseccao(params: ResolverPorBisseccaoParams): ResolverPorBisseccaoResultado {
  const { f, loInicial = 0.1, hiInicial = 200, hiMaximo = HI_MAXIMO_PADRAO, toleranciaRelativa = 0.001, maxIteracoes = 50 } = params

  const lo0 = loInicial
  let hi = hiInicial
  while (f(hi) < 0 && hi < hiMaximo) hi *= 2

  if (f(hi) < 0) {
    return { valor: hi, iteracoes: 0, convergiu: false }
  }

  let lo = lo0
  let mid = (lo + hi) / 2
  let iteracoes = 0
  for (iteracoes = 1; iteracoes <= maxIteracoes; iteracoes++) {
    mid = (lo + hi) / 2
    if ((hi - lo) / mid < toleranciaRelativa) break
    if (f(mid) < 0) lo = mid
    else hi = mid
  }

  const convergiu = (hi - lo) / mid < toleranciaRelativa
  return { valor: mid, iteracoes, convergiu }
}
