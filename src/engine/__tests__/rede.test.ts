import { describe, expect, it } from 'vitest'
import { acumularVazao, calcularQEntradaBacia, calcularTcSistema, ordenarTopologicamente } from '../rede'

describe('ordenarTopologicamente', () => {
  it('ordena das cabeceiras até a saída', () => {
    const arestas = [
      { id: 't1', montanteId: 'A', jusanteId: 'C' },
      { id: 't2', montanteId: 'B', jusanteId: 'C' },
      { id: 't3', montanteId: 'C', jusanteId: 'D' },
    ]
    const ordem = ordenarTopologicamente(['A', 'B', 'C', 'D'], arestas)
    expect(ordem.indexOf('A')).toBeLessThan(ordem.indexOf('C'))
    expect(ordem.indexOf('B')).toBeLessThan(ordem.indexOf('C'))
    expect(ordem.indexOf('C')).toBeLessThan(ordem.indexOf('D'))
  })

  it('lança erro para grafo com ciclo', () => {
    const arestas = [
      { id: 't1', montanteId: 'A', jusanteId: 'B' },
      { id: 't2', montanteId: 'B', jusanteId: 'A' },
    ]
    expect(() => ordenarTopologicamente(['A', 'B'], arestas)).toThrow()
  })
})

describe('calcularQEntradaBacia', () => {
  it('aplica o método racional Q = 2.78e-7 × C × i × área', () => {
    expect(calcularQEntradaBacia(0.9, 80, 1000)).toBeCloseTo(2.78e-7 * 0.9 * 80 * 1000, 12)
  })
})

describe('acumularVazao', () => {
  it('soma corretamente a vazão em uma confluência (A e B convergem em C, que segue para D)', () => {
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'C' },
      { id: 't2', montanteId: 'B', jusanteId: 'C' },
      { id: 't3', montanteId: 'C', jusanteId: 'D' },
    ]
    const qEntrada = new Map([
      ['A', 1],
      ['B', 2],
      ['C', 0.5],
    ])
    const resultado = acumularVazao(['A', 'B', 'C', 'D'], trechos, qEntrada)

    expect(resultado.get('t1')).toBeCloseTo(1)
    expect(resultado.get('t2')).toBeCloseTo(2)
    // t3 precisa carregar a soma de t1 + t2 + a bacia própria de C — é
    // exatamente a vazão que uma soma por ordem de linha perderia se C
    // aparecesse antes de A ou B na planilha de referência.
    expect(resultado.get('t3')).toBeCloseTo(3.5)
  })

  it('não depende da ordem de entrada dos ids das caixas', () => {
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'C' },
      { id: 't2', montanteId: 'B', jusanteId: 'C' },
      { id: 't3', montanteId: 'C', jusanteId: 'D' },
    ]
    const qEntrada = new Map([
      ['A', 1],
      ['B', 2],
      ['C', 0.5],
    ])
    const resultado = acumularVazao(['D', 'C', 'B', 'A'], trechos, qEntrada)
    expect(resultado.get('t3')).toBeCloseTo(3.5)
  })
})

describe('calcularTcSistema', () => {
  it('adota o maior Tc entre os ramos que convergem numa confluência', () => {
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'C', comprimentoM: 100 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', comprimentoM: 50 },
    ]
    const velocidades = new Map([
      ['t1', 1], // Tp = 100/1/60 = 1.667 min
      ['t2', 2], // Tp = 50/2/60 = 0.417 min
    ])
    const tcInicial = new Map([
      ['A', 5],
      ['B', 8],
    ])

    const resultado = calcularTcSistema(['A', 'B', 'C'], trechos, velocidades, tcInicial)

    expect(resultado.get('A')).toBe(5)
    expect(resultado.get('B')).toBe(8)
    // via A: 5 + 1.667 = 6.667 | via B: 8 + 0.417 = 8.417 → domina B
    expect(resultado.get('C')).toBeCloseTo(8.41666667, 4)
  })
})
