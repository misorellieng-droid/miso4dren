import { describe, expect, it } from 'vitest'
import { calcularEspraiamentoComposto, calcularLaminaParaEspraiamentoComposto, pontosPerfilCompostoSarjetao } from '../espraiamento'

describe('calcularEspraiamentoComposto', () => {
  it('Caso B — lâmina contida dentro da própria calha (Sx do sarjetão íngreme o bastante)', () => {
    // y_max=4,5cm, calha de 0,45m a 10% -> y na borda da calha = 0,045 - 0,10*0,45 = 0 (limite exato)
    const T = calcularEspraiamentoComposto({ yMaxM: 0.045, larguraSarjetaoEfetivaM: 0.45, sxSarjetao: 0.1, sxPista: 0.01 })
    expect(T).toBeCloseTo(0.45, 9)
  })

  it('Caso A — espraiamento avança pra pista (Sx do sarjetão suave demais pra conter a lâmina)', () => {
    // y_max=4,5cm, calha de 0,45m a 2% -> y na borda da calha = 0,045 - 0,02*0,45 = 0,036 > 0
    const T = calcularEspraiamentoComposto({ yMaxM: 0.045, larguraSarjetaoEfetivaM: 0.45, sxSarjetao: 0.02, sxPista: 0.01 })
    expect(T).toBeCloseTo(0.45 + 0.036 / 0.01, 9)
    expect(T).toBeCloseTo(4.05, 9)
  })

  it('ignorar a calha (Sx do sarjetão = Sx da pista) degenera na fórmula simples T = y_max/Sx', () => {
    const T = calcularEspraiamentoComposto({ yMaxM: 0.045, larguraSarjetaoEfetivaM: 0.45, sxSarjetao: 0.01, sxPista: 0.01 })
    expect(T).toBeCloseTo(0.045 / 0.01, 9)
  })
})

describe('calcularLaminaParaEspraiamentoComposto', () => {
  it('é a inversa de calcularEspraiamentoComposto no Caso A', () => {
    const params = { larguraSarjetaoEfetivaM: 0.45, sxSarjetao: 0.02, sxPista: 0.01 }
    const T = calcularEspraiamentoComposto({ yMaxM: 0.045, ...params })
    const yMaxDeVolta = calcularLaminaParaEspraiamentoComposto({ larguraEspraiamentoM: T, ...params })
    expect(yMaxDeVolta).toBeCloseTo(0.045, 9)
  })

  it('é a inversa de calcularEspraiamentoComposto no Caso B', () => {
    const params = { larguraSarjetaoEfetivaM: 0.45, sxSarjetao: 0.1, sxPista: 0.01 }
    const T = calcularEspraiamentoComposto({ yMaxM: 0.03, ...params })
    const yMaxDeVolta = calcularLaminaParaEspraiamentoComposto({ larguraEspraiamentoM: T, ...params })
    expect(yMaxDeVolta).toBeCloseTo(0.03, 9)
  })
})

describe('pontosPerfilCompostoSarjetao', () => {
  it('Caso A — três pontos: ápice da calha, o "kink" na borda dela (x=W), e a borda do espraiamento (x=T)', () => {
    const pontos = pontosPerfilCompostoSarjetao({ yMaxM: 0.045, larguraSarjetaoEfetivaM: 0.45, sxSarjetao: 0.02, sxPista: 0.01 })
    expect(pontos).toHaveLength(3)
    expect(pontos[0]).toEqual({ x: 0, y: 0.045 })
    expect(pontos[1].x).toBeCloseTo(0.45, 9) // W — fim da calha
    expect(pontos[1].y).toBeCloseTo(0.036, 9) // y na borda da calha
    expect(pontos[2].x).toBeCloseTo(4.05, 9) // T — fim do espraiamento
    expect(pontos[2].y).toBeCloseTo(0, 9)
  })

  it('Caso B — dois pontos só: a lâmina não sai da calha, não há kink', () => {
    const pontos = pontosPerfilCompostoSarjetao({ yMaxM: 0.045, larguraSarjetaoEfetivaM: 0.45, sxSarjetao: 0.1, sxPista: 0.01 })
    expect(pontos).toHaveLength(2)
    expect(pontos[0]).toEqual({ x: 0, y: 0.045 })
    expect(pontos[1].x).toBeCloseTo(0.45, 9)
    expect(pontos[1].y).toBeCloseTo(0, 9)
  })
})
