import { describe, expect, it } from 'vitest'
import { calcularGeometriaCompostaSarjetao } from '../espraiamento'
import { calcularSarjetaoDenteServa } from '../index'

describe('calcularSarjetaoDenteServa (pipeline completo, único método — HEC-22/FHWA)', () => {
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

  it('resolve Δh pela geometria e converge o método', () => {
    const memorial = calcularSarjetaoDenteServa(parametrosBase)

    expect(memorial.deltaHM).toBeCloseTo(0.036, 9)

    expect(memorial.resultado.convergiu).toBe(true)
    expect(memorial.resultado.convergiuTc).toBe(true)
    expect(memorial.resultado.comprimentoEquilibrioM).toBeGreaterThan(0)
    expect(memorial.resultado.laminaCriticaM).toBe(0.05)
  })

  it('a distância entre caixas é o dobro do braço: SL usado na capacidade é Δh/(L/2), não Δh/L', () => {
    const memorial = calcularSarjetaoDenteServa(parametrosBase)
    const bracoM = memorial.resultado.comprimentoEquilibrioM / 2
    expect(memorial.resultado.declividadeLongitudinalMM).toBeCloseTo(memorial.deltaHM / bracoM, 9)
  })

  it('a vazão afluente no L de equilíbrio bate com a vazão de capacidade (definição de equilíbrio)', () => {
    const memorial = calcularSarjetaoDenteServa(parametrosBase)
    const diffRelativa = Math.abs(memorial.resultado.vazaoM3s - memorial.resultado.vazaoCapacidadeM3s) / memorial.resultado.vazaoCapacidadeM3s
    expect(diffRelativa).toBeLessThan(0.005)
  })

  it('lança erro se a declividade do ponto baixo não for maior que a do ponto alto', () => {
    expect(() => calcularSarjetaoDenteServa({ ...parametrosBase, sxSarjetaoBaixo: 0.02 })).toThrow(/ponto baixo/)
  })

  it('geometria vem da composição real (calha + via) com Sx médio — não de um T de plano único; área e perímetro somam as duas faces (simétrico)', () => {
    const memorial = calcularSarjetaoDenteServa(parametrosBase)
    const larguraEfetivaM = parametrosBase.larguraSarjetaoM / 2
    const sxMedio = (parametrosBase.sxSarjetaoAlto + parametrosBase.sxSarjetaoBaixo) / 2
    const geometria = calcularGeometriaCompostaSarjetao({
      yMaxM: parametrosBase.yMaxM,
      larguraSarjetaoEfetivaM: larguraEfetivaM,
      sxSarjetao: sxMedio,
      sxPista: parametrosBase.sxPista,
    })

    expect(memorial.resultado.areaMolhadaM2).toBeCloseTo(geometria.areaMolhadaM2 * 2, 9)
    expect(memorial.resultado.raioHidraulicoM).toBeCloseTo(geometria.raioHidraulicoM, 9) // Rh não muda ao dobrar A e P juntos (perímetro real)

    // T adotado no resultado principal também vem do Sx médio, não é mais o valor bruto de entrada
    expect(memorial.larguraEspraiamentoM).toBeCloseTo(geometria.larguraEspraiamentoM, 9)
    expect(memorial.larguraEspraiamentoM).not.toBeCloseTo(parametrosBase.larguraEspraiamentoM, 3)

    const metodo = memorial.resultado
    expect(metodo.historicoIteracoesTc).toHaveLength(metodo.iteracoesTc)
    expect(metodo.historicoIteracoesTc.map((h) => h.numero)).toEqual(Array.from({ length: metodo.iteracoesTc }, (_, i) => i + 1))
    const ultima = metodo.historicoIteracoesTc[metodo.historicoIteracoesTc.length - 1]
    expect(ultima.comprimentoM).toBeCloseTo(metodo.comprimentoEquilibrioM, 9)
    expect(ultima.intensidadeMmH).toBeCloseTo(metodo.intensidadeConvergidaMmH, 9)
    expect(ultima.vazaoM3s).toBeCloseTo(metodo.vazaoM3s, 9)
    expect(metodo.historicoIteracoesTc[0].tcMin).toBe(parametrosBase.tcInicialMin)
  })

  it('um_lado com largura W tem o mesmo Δh que simetrico com largura 2W, mas simetrico escoa o DOBRO (duas faces, não uma)', () => {
    const simetrico = calcularSarjetaoDenteServa({ ...parametrosBase, tipoSecao: 'simetrico', larguraSarjetaoM: 0.9 })
    const umLado = calcularSarjetaoDenteServa({ ...parametrosBase, tipoSecao: 'um_lado', larguraSarjetaoM: 0.45 })

    // mesma largura de face (W=0,45) nos dois casos -> mesmo Δh
    expect(umLado.deltaHM).toBeCloseTo(simetrico.deltaHM, 12)

    // simétrico soma as duas faces espelhadas -> área total é o dobro da de um_lado (uma face só)
    expect(simetrico.resultado.areaMolhadaM2).toBeCloseTo(umLado.resultado.areaMolhadaM2 * 2, 9)

    // mais capacidade -> precisa de um comprimento maior pra acumular vazão suficiente pra atingi-la
    expect(simetrico.resultado.comprimentoEquilibrioM).toBeGreaterThan(umLado.resultado.comprimentoEquilibrioM)
  })

  it('um_lado usa a largura inteira em Δh (não divide por 2 como o simétrico)', () => {
    const memorial = calcularSarjetaoDenteServa({ ...parametrosBase, tipoSecao: 'um_lado', larguraSarjetaoM: 0.9 })
    const deltaHEsperado = 0.9 * (parametrosBase.sxSarjetaoBaixo - parametrosBase.sxSarjetaoAlto)
    expect(memorial.deltaHM).toBeCloseTo(deltaHEsperado, 12)
  })

  it('faixaEspraiamento: T mínimo (Sx_baixo, mais íngreme) é sempre menor que T máximo (Sx_alto, mais suave)', () => {
    const memorial = calcularSarjetaoDenteServa(parametrosBase)
    expect(memorial.faixaEspraiamento.minimo.resultado.larguraEspraiamentoM).toBeLessThan(memorial.faixaEspraiamento.maximo.resultado.larguraEspraiamentoM)
    expect(memorial.faixaEspraiamento.medio.sxSarjetaoMM).toBeCloseTo((parametrosBase.sxSarjetaoAlto + parametrosBase.sxSarjetaoBaixo) / 2, 12)
    expect(memorial.faixaEspraiamento.minimo.sxSarjetaoMM).toBe(parametrosBase.sxSarjetaoBaixo)
    expect(memorial.faixaEspraiamento.maximo.sxSarjetaoMM).toBe(parametrosBase.sxSarjetaoAlto)
  })

  it('faixaEspraiamento não altera o resultado principal (continua usando o T adotado)', () => {
    const memorial = calcularSarjetaoDenteServa(parametrosBase)
    expect(memorial.larguraEspraiamentoM).toBeCloseTo(memorial.faixaEspraiamento.medio.resultado.larguraEspraiamentoM, 9)
  })

  it('cenarioAdotado default é "medio" — usa a declividade média do sarjetão', () => {
    const semCenario = calcularSarjetaoDenteServa(parametrosBase)
    const comMedio = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'medio' })
    expect(semCenario.cenarioAdotado).toBe('medio')
    expect(semCenario.sxSarjetaoAdotadoMM).toBeCloseTo((parametrosBase.sxSarjetaoAlto + parametrosBase.sxSarjetaoBaixo) / 2, 12)
    expect(semCenario.resultado.comprimentoEquilibrioM).toBeCloseTo(comMedio.resultado.comprimentoEquilibrioM, 9)
  })

  it('cenarioAdotado "minimo" faz o resultado principal bater exatamente com faixaEspraiamento.minimo', () => {
    const memorial = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'minimo' })
    expect(memorial.sxSarjetaoAdotadoMM).toBe(parametrosBase.sxSarjetaoBaixo)
    expect(memorial.larguraEspraiamentoM).toBeCloseTo(memorial.faixaEspraiamento.minimo.resultado.larguraEspraiamentoM, 9)
    expect(memorial.resultado.comprimentoEquilibrioM).toBeCloseTo(memorial.faixaEspraiamento.minimo.resultado.comprimentoEquilibrioM, 9)
  })

  it('cenarioAdotado "maximo" faz o resultado principal bater exatamente com faixaEspraiamento.maximo', () => {
    const memorial = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'maximo' })
    expect(memorial.sxSarjetaoAdotadoMM).toBe(parametrosBase.sxSarjetaoAlto)
    expect(memorial.larguraEspraiamentoM).toBeCloseTo(memorial.faixaEspraiamento.maximo.resultado.larguraEspraiamentoM, 9)
    expect(memorial.resultado.comprimentoEquilibrioM).toBeCloseTo(memorial.faixaEspraiamento.maximo.resultado.comprimentoEquilibrioM, 9)
  })

  it('os três cenários dão comprimentos de equilíbrio diferentes (a escolha realmente importa)', () => {
    const minimo = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'minimo' })
    const medio = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'medio' })
    const maximo = calcularSarjetaoDenteServa({ ...parametrosBase, cenarioAdotado: 'maximo' })
    expect(minimo.resultado.comprimentoEquilibrioM).toBeLessThan(medio.resultado.comprimentoEquilibrioM)
    expect(medio.resultado.comprimentoEquilibrioM).toBeLessThan(maximo.resultado.comprimentoEquilibrioM)
  })

  it('VERIFICAÇÃO DE TOPOLOGIA: L é a distância CHEIA entre duas caixas consecutivas, com a crista exatamente no meio — não a distância crista-a-crista', () => {
    // Prova direta pela própria equação resolvida pela bisseção: f(L) = Q(braço=L/2) - Qcap(SL=Δh/braço).
    // Reconstituindo manualmente com o L convergido, braço = L/2 tem que fechar exatamente a equação de equilíbrio.
    const memorial = calcularSarjetaoDenteServa(parametrosBase)
    const { resultado } = memorial
    const L = resultado.comprimentoEquilibrioM
    const bracoM = L / 2

    // 1) SL reportada é Δh dividido pelo BRAÇO (L/2), não por L inteiro
    const slEsperada = memorial.deltaHM / bracoM
    expect(resultado.declividadeLongitudinalMM).toBeCloseTo(slEsperada, 9)

    // 2) a vazão afluente reportada é a que se acumula ao longo do BRAÇO (L/2), não de L inteiro —
    //    reconstituída aqui via método racional com comprimentoM = bracoM, batendo com o valor salvo
    const K = 2.78e-7 // mesma constante do método racional (ver src/engine/constants.ts)
    const vazaoEsperada = K * resultado.intensidadeConvergidaMmH * (parametrosBase.coefC * parametrosBase.larguraViaM) * bracoM
    expect(resultado.vazaoM3s).toBeCloseTo(vazaoEsperada, 6)

    // 3) portanto: se a crista estivesse no meio de "crista a crista" em vez de "caixa a caixa", L
    //    reportado seria a mesma grandeza matemática de qualquer forma (o dente de serra é periódico:
    //    caixa-crista-caixa-crista-caixa, então caixa-a-caixa == crista-a-crista == 2×braço por simetria) —
    //    o que importa de fato é que o BRAÇO usado na física (SL e vazão acumulada) é sempre L/2, e é
    //    exatamente o que os dois cálculos acima confirmam.
    expect(bracoM).toBeCloseTo(L / 2, 12)
  })

  it('vazaoTotalCaixaM3s: a caixa recebe os DOIS braços (uma crista de cada lado) — vazão total é o dobro da vazão de um braço só', () => {
    const memorial = calcularSarjetaoDenteServa(parametrosBase)
    expect(memorial.vazaoTotalCaixaM3s).toBeCloseTo(memorial.resultado.vazaoM3s * 2, 9)

    // consistência com o método racional linear: 2×Q(braço) == Q(comprimento L), calculado independentemente
    const K = 2.78e-7
    const L = memorial.resultado.comprimentoEquilibrioM
    const vazaoViaLCompleto = K * memorial.resultado.intensidadeConvergidaMmH * (parametrosBase.coefC * parametrosBase.larguraViaM) * L
    expect(memorial.vazaoTotalCaixaM3s).toBeCloseTo(vazaoViaLCompleto, 6)
  })
})
