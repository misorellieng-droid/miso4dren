import { RATIONAL_METHOD_K } from '../constants'

/**
 * Vazão afluente pelo método racional, Q = K·i·Σ(Cj·Lj)·comprimento — versão
 * ponderada por C quando há mais de uma superfície contribuinte (pista +,
 * opcionalmente, cobertura de galpão descarregando direto na sarjeta, cada
 * uma com seu próprio C). Mesma constante K usada em rede.ts e
 * sarjeta/comprimentoCritico.ts, com área em m² (equivalente a
 * C·i·A(ha)/360, só que consistente com a convenção de unidades do resto
 * do app).
 */
export interface ParametrosVazaoAfluente {
  larguraViaM: number
  coefC: number
  larguraTelhadoM?: number
  coefCTelhado?: number
  intensidadeMmH: number
  comprimentoM: number
}

export interface ResultadoVazaoAfluente {
  areaContribuinteM2: number
  vazaoM3s: number
}

export function calcularVazaoAfluente(params: ParametrosVazaoAfluente): ResultadoVazaoAfluente {
  const { larguraViaM, coefC, larguraTelhadoM = 0, coefCTelhado = 0, intensidadeMmH, comprimentoM } = params
  const larguraPonderada = coefC * larguraViaM + coefCTelhado * larguraTelhadoM
  const areaContribuinteM2 = (larguraViaM + larguraTelhadoM) * comprimentoM
  const vazaoM3s = RATIONAL_METHOD_K * intensidadeMmH * larguraPonderada * comprimentoM
  return { areaContribuinteM2, vazaoM3s }
}
