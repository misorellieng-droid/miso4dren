import { describe, expect, it } from 'vitest'
import { calcularSarjetaoDenteServa } from '../index'

describe('calcularSarjetaoDenteServa (pipeline completo)', () => {
  // Caso de referência: sarjetão de 0,90m (2%→10%), via de 20m contribuinte,
  // y_max=0,05m, Sx da pista=2% (T=2,5m auto), n=0,016, C=0,9, IDF k=800
  // a=0,15 b=10 c=0,75, TR=10 anos — valores conferidos por script
  // independente replicando a mesma sequência de cálculo (ver histórico do
  // commit que introduziu este arquivo).
  const parametrosBase = {
    larguraViaM: 20,
    coefC: 0.9,
    telhadoAtivo: false,
    larguraSarjetaoM: 0.9,
    sxSarjetaoAlto: 0.02,
    sxSarjetaoBaixo: 0.1,
    yMaxM: 0.05,
    sxPista: 0.02,
    larguraEspraiamentoM: 2.5,
    manningN: 0.016,
    equacaoIdf: { k: 800, a: 0.15, b: 10, c: 0.75 },
    tempoRetornoAnos: 10,
    tcInicialMin: 10,
  }

  it('resolve Δh pela geometria e converge os dois métodos, cada um com seu próprio Tc/L', () => {
    const resultado = calcularSarjetaoDenteServa(parametrosBase)

    expect(resultado.deltaHM).toBeCloseTo(0.036, 9)

    // comprimentoEquilibrioM é a distância CHEIA entre caixas — o ponto alto fica
    // no meio, então a verificação de capacidade internamente usa o braço (L/2)
    expect(resultado.metodo1.convergiu).toBe(true)
    expect(resultado.metodo1.convergiuTc).toBe(true)
    expect(resultado.metodo1.comprimentoEquilibrioM).toBeCloseTo(56.151062011718736, 3)
    expect(resultado.metodo1.laminaCriticaM).toBe(0.05)

    expect(resultado.metodo2.convergiu).toBe(true)
    expect(resultado.metodo2.convergiuTc).toBe(true)
    expect(resultado.metodo2.comprimentoEquilibrioM).toBeCloseTo(37.52024536132812, 3)

    // os dois métodos divergem bastante para essa geometria — é o ponto central do módulo
    expect(resultado.diferencaPercentual).toBeCloseTo(33.179811713093436, 1)
    expect(resultado.comprimentoRecomendadoM).toBeCloseTo(resultado.metodo2.comprimentoEquilibrioM, 9)
    expect(resultado.metodoRecomendado).toBe('hec22')
  })

  it('a distância entre caixas é o dobro do braço: dobrar Δh dobra SL, então L cai por ~2^(2/3) mas o braço continua sendo L/2', () => {
    const resultado = calcularSarjetaoDenteServa(parametrosBase)
    // verificação direta: SL usado na capacidade corresponde a Δh / (L/2), não Δh / L
    const bracoM1 = resultado.metodo1.comprimentoEquilibrioM / 2
    expect(resultado.metodo1.declividadeLongitudinalMM).toBeCloseTo(resultado.deltaHM / bracoM1, 9)
    const bracoM2 = resultado.metodo2.comprimentoEquilibrioM / 2
    expect(resultado.metodo2.declividadeLongitudinalMM).toBeCloseTo(resultado.deltaHM / bracoM2, 9)
  })

  it('em cada método, a vazão afluente no L de equilíbrio bate com a vazão de capacidade (definição de equilíbrio)', () => {
    const resultado = calcularSarjetaoDenteServa(parametrosBase)
    for (const metodo of [resultado.metodo1, resultado.metodo2]) {
      const diffRelativa = Math.abs(metodo.vazaoM3s - metodo.vazaoCapacidadeM3s) / metodo.vazaoCapacidadeM3s
      expect(diffRelativa).toBeLessThan(0.005)
    }
  })

  it('lança erro se a declividade do ponto baixo não for maior que a do ponto alto', () => {
    expect(() => calcularSarjetaoDenteServa({ ...parametrosBase, sxSarjetaoBaixo: 0.02 })).toThrow(/ponto baixo/)
  })
})
