import { describe, expect, it } from 'vitest'
import { calcularGeometriaCompostaSarjetao } from '../espraiamento'
import { calcularSarjetaoDenteServa } from '../index'

describe('calcularSarjetaoDenteServa (pipeline completo)', () => {
  // Sarjetão de 0,90m (2%→10%), via de 20m contribuinte, y_max=0,05m,
  // Sx da pista=2%, n=0,016, C=0,9, IDF k=800 a=0,15 b=10 c=0,75, TR=10 anos.
  // larguraEspraiamentoM aqui é só um valor legado de entrada — o motor
  // recalcula T internamente pela composição de dois planos (ver
  // calcularGeometriaCompostaSarjetao), não usa mais este campo pra capacidade.
  const parametrosBase = {
    tipoSecao: 'simetrico' as const,
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

    expect(resultado.metodo1.convergiu).toBe(true)
    expect(resultado.metodo1.convergiuTc).toBe(true)
    expect(resultado.metodo1.comprimentoEquilibrioM).toBeGreaterThan(0)
    expect(resultado.metodo1.laminaCriticaM).toBe(0.05)

    expect(resultado.metodo2.convergiu).toBe(true)
    expect(resultado.metodo2.convergiuTc).toBe(true)
    expect(resultado.metodo2.comprimentoEquilibrioM).toBeGreaterThan(0)

    expect(resultado.comprimentoRecomendadoM).toBeCloseTo(Math.min(resultado.metodo1.comprimentoEquilibrioM, resultado.metodo2.comprimentoEquilibrioM), 9)
    expect(resultado.metodoRecomendado).toBe(resultado.metodo1.comprimentoEquilibrioM <= resultado.metodo2.comprimentoEquilibrioM ? 'manning_generico' : 'hec22')
  })

  it('a distância entre caixas é o dobro do braço: SL usado na capacidade é Δh/(L/2), não Δh/L', () => {
    const resultado = calcularSarjetaoDenteServa(parametrosBase)
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

  it('geometria dos dois métodos vem da composição real (calha + via) com Sx médio — não de um T de plano único', () => {
    const resultado = calcularSarjetaoDenteServa(parametrosBase)
    const larguraEfetivaM = parametrosBase.larguraSarjetaoM / 2
    const sxMedio = (parametrosBase.sxSarjetaoAlto + parametrosBase.sxSarjetaoBaixo) / 2
    const geometria = calcularGeometriaCompostaSarjetao({
      yMaxM: parametrosBase.yMaxM,
      larguraSarjetaoEfetivaM: larguraEfetivaM,
      sxSarjetao: sxMedio,
      sxPista: parametrosBase.sxPista,
    })

    // Método 1 e Método 2 usam a MESMA área real composta — só o perímetro difere (2T vs. arco real)
    expect(resultado.metodo1.areaMolhadaM2).toBeCloseTo(geometria.areaMolhadaM2, 9)
    expect(resultado.metodo2.areaMolhadaM2).toBeCloseTo(geometria.areaMolhadaM2, 9)
    expect(resultado.metodo2.raioHidraulicoM).toBeCloseTo(geometria.raioHidraulicoM, 9)
    expect(resultado.metodo1.raioHidraulicoM).not.toBeCloseTo(resultado.metodo2.raioHidraulicoM, 6)

    // T adotado no resultado principal também vem do Sx médio, não é mais o valor bruto de entrada
    expect(resultado.larguraEspraiamentoM).toBeCloseTo(geometria.larguraEspraiamentoM, 9)
    expect(resultado.larguraEspraiamentoM).not.toBeCloseTo(parametrosBase.larguraEspraiamentoM, 3)

    for (const metodo of [resultado.metodo1, resultado.metodo2]) {
      expect(metodo.historicoIteracoesTc).toHaveLength(metodo.iteracoesTc)
      expect(metodo.historicoIteracoesTc.map((h) => h.numero)).toEqual(
        Array.from({ length: metodo.iteracoesTc }, (_, i) => i + 1)
      )
      const ultima = metodo.historicoIteracoesTc[metodo.historicoIteracoesTc.length - 1]
      expect(ultima.comprimentoM).toBeCloseTo(metodo.comprimentoEquilibrioM, 9)
      expect(ultima.intensidadeMmH).toBeCloseTo(metodo.intensidadeConvergidaMmH, 9)
      expect(ultima.vazaoM3s).toBeCloseTo(metodo.vazaoM3s, 9)
      expect(metodo.historicoIteracoesTc[0].tcMin).toBe(parametrosBase.tcInicialMin)
    }
  })

  it('um_lado com largura W dá resultado idêntico a simetrico com largura 2W (mesmo Δh, só muda o fator da fórmula)', () => {
    const simetrico = calcularSarjetaoDenteServa({ ...parametrosBase, tipoSecao: 'simetrico', larguraSarjetaoM: 0.9 })
    const umLado = calcularSarjetaoDenteServa({ ...parametrosBase, tipoSecao: 'um_lado', larguraSarjetaoM: 0.45 })

    expect(umLado.deltaHM).toBeCloseTo(simetrico.deltaHM, 12)
    expect(umLado.metodo1.comprimentoEquilibrioM).toBeCloseTo(simetrico.metodo1.comprimentoEquilibrioM, 9)
    expect(umLado.metodo2.comprimentoEquilibrioM).toBeCloseTo(simetrico.metodo2.comprimentoEquilibrioM, 9)
  })

  it('um_lado usa a largura inteira em Δh (não divide por 2 como o simétrico)', () => {
    const resultado = calcularSarjetaoDenteServa({ ...parametrosBase, tipoSecao: 'um_lado', larguraSarjetaoM: 0.9 })
    const deltaHEsperado = 0.9 * (parametrosBase.sxSarjetaoBaixo - parametrosBase.sxSarjetaoAlto)
    expect(resultado.deltaHM).toBeCloseTo(deltaHEsperado, 12)
  })

  it('faixaEspraiamento: T mínimo (Sx_baixo, mais íngreme) é sempre menor que T máximo (Sx_alto, mais suave)', () => {
    const resultado = calcularSarjetaoDenteServa(parametrosBase)
    expect(resultado.faixaEspraiamento.minimo.metodo1.larguraEspraiamentoM).toBeLessThan(resultado.faixaEspraiamento.maximo.metodo1.larguraEspraiamentoM)
    expect(resultado.faixaEspraiamento.medio.sxSarjetaoMM).toBeCloseTo((parametrosBase.sxSarjetaoAlto + parametrosBase.sxSarjetaoBaixo) / 2, 12)
    expect(resultado.faixaEspraiamento.minimo.sxSarjetaoMM).toBe(parametrosBase.sxSarjetaoBaixo)
    expect(resultado.faixaEspraiamento.maximo.sxSarjetaoMM).toBe(parametrosBase.sxSarjetaoAlto)
  })

  it('faixaEspraiamento não altera o resultado principal (metodo1/metodo2 continuam usando o T adotado)', () => {
    const resultado = calcularSarjetaoDenteServa(parametrosBase)
    expect(resultado.larguraEspraiamentoM).toBeCloseTo(resultado.faixaEspraiamento.medio.metodo1.larguraEspraiamentoM, 9)
  })

  it('cenarioAdotado default é "medio" — usa a declividade média do sarjetão', () => {
    const semCenario = calcularSarjetaoDenteServa(parametrosBase)
    const comMedio = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'medio' })
    expect(semCenario.cenarioAdotado).toBe('medio')
    expect(semCenario.sxSarjetaoAdotadoMM).toBeCloseTo((parametrosBase.sxSarjetaoAlto + parametrosBase.sxSarjetaoBaixo) / 2, 12)
    expect(semCenario.metodo1.comprimentoEquilibrioM).toBeCloseTo(comMedio.metodo1.comprimentoEquilibrioM, 9)
  })

  it('cenarioAdotado "minimo" faz o resultado principal bater exatamente com faixaEspraiamento.minimo', () => {
    const resultado = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'minimo' })
    expect(resultado.sxSarjetaoAdotadoMM).toBe(parametrosBase.sxSarjetaoBaixo)
    expect(resultado.larguraEspraiamentoM).toBeCloseTo(resultado.faixaEspraiamento.minimo.metodo1.larguraEspraiamentoM, 9)
    expect(resultado.metodo1.comprimentoEquilibrioM).toBeCloseTo(resultado.faixaEspraiamento.minimo.metodo1.comprimentoEquilibrioM, 9)
    expect(resultado.metodo2.comprimentoEquilibrioM).toBeCloseTo(resultado.faixaEspraiamento.minimo.metodo2.comprimentoEquilibrioM, 9)
  })

  it('cenarioAdotado "maximo" faz o resultado principal bater exatamente com faixaEspraiamento.maximo', () => {
    const resultado = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'maximo' })
    expect(resultado.sxSarjetaoAdotadoMM).toBe(parametrosBase.sxSarjetaoAlto)
    expect(resultado.larguraEspraiamentoM).toBeCloseTo(resultado.faixaEspraiamento.maximo.metodo1.larguraEspraiamentoM, 9)
    expect(resultado.metodo1.comprimentoEquilibrioM).toBeCloseTo(resultado.faixaEspraiamento.maximo.metodo1.comprimentoEquilibrioM, 9)
    expect(resultado.metodo2.comprimentoEquilibrioM).toBeCloseTo(resultado.faixaEspraiamento.maximo.metodo2.comprimentoEquilibrioM, 9)
  })

  it('os três cenários dão comprimentos de equilíbrio diferentes (a escolha realmente importa)', () => {
    const minimo = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'minimo' })
    const medio = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'medio' })
    const maximo = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'maximo' })
    expect(minimo.metodo1.comprimentoEquilibrioM).toBeLessThan(medio.metodo1.comprimentoEquilibrioM)
    expect(medio.metodo1.comprimentoEquilibrioM).toBeLessThan(maximo.metodo1.comprimentoEquilibrioM)
  })
})
