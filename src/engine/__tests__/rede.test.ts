import { describe, expect, it } from 'vitest'
import {
  acumularVazao,
  calcularQEntradaBacia,
  calcularQProjeto,
  calcularTcSistema,
  identificarRedesPorPvCabeceira,
  identificarTroncoRede,
  ordenarTopologicamente,
  ordenarTrechosPorFluxo,
} from '../rede'

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

describe('ordenarTrechosPorFluxo', () => {
  const caixa = (id: string) => ({ id, nome: id })

  it('ordena uma rede linear estritamente montante -> jusante', () => {
    const caixas = ['A', 'B', 'C', 'D'].map(caixa)
    const trechos = [
      { id: 't3', montanteId: 'C', jusanteId: 'D', nome: 'T3', diametroM: 0.3 },
      { id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', nome: 'T2', diametroM: 0.3 },
    ]
    const ordem = ordenarTrechosPorFluxo(caixas, trechos)
    expect(ordem.get('t1')).toBeLessThan(ordem.get('t2')!)
    expect(ordem.get('t2')).toBeLessThan(ordem.get('t3')!)
  })

  it('prioriza o tronco (maior diâmetro) sobre os ramais em cada confluência, fundindo pares Start/EndNullStruct', () => {
    // Reproduz a rede real reportada: tronco de concreto (BSTC) PV-001 -> [emenda sem
    // estrutura] -> PV-002 -> PV-003 -> PV-004 -> PV-005, com ramais de PVC (menor
    // diâmetro) desaguando em cada PV do tronco. Esperado: PVC-5, BSTC-1, BSTC-1(1),
    // PVC-6/7 (ordem entre eles livre), BSTC-2, PVC-8, PVC-9, BSTC-3, PVC-10, BSTC-4, PVC-11.
    const caixas = [
      'BLCS-06', 'BLCS-08', 'BLCS-09', 'BLCS-10', 'BLCS-11', 'BLCS-12', 'BLCS-13',
      'PV-001', 'PV-002', 'PV-003', 'PV-004', 'PV-005',
      'StartNullStruct0', 'EndNullStruct0',
    ].map(caixa)
    const trechos = [
      { id: 'pvc5', montanteId: 'BLCS-06', jusanteId: 'PV-001', nome: 'PVC-5', diametroM: 0.2 },
      { id: 'bstc1', montanteId: 'PV-001', jusanteId: 'EndNullStruct0', nome: 'BSTC-1', diametroM: 0.6 },
      { id: 'bstc1b', montanteId: 'StartNullStruct0', jusanteId: 'PV-002', nome: 'BSTC-1(1)', diametroM: 0.6 },
      { id: 'pvc6', montanteId: 'BLCS-08', jusanteId: 'PV-002', nome: 'PVC-6', diametroM: 0.4 },
      { id: 'pvc7', montanteId: 'BLCS-09', jusanteId: 'PV-002', nome: 'PVC-7', diametroM: 0.5 },
      { id: 'bstc2', montanteId: 'PV-002', jusanteId: 'PV-003', nome: 'BSTC-2', diametroM: 0.6 },
      { id: 'pvc8', montanteId: 'BLCS-10', jusanteId: 'BLCS-11', nome: 'PVC-8', diametroM: 0.2 },
      { id: 'pvc9', montanteId: 'BLCS-11', jusanteId: 'PV-003', nome: 'PVC-9', diametroM: 0.5 },
      { id: 'bstc3', montanteId: 'PV-003', jusanteId: 'PV-004', nome: 'BSTC-3', diametroM: 0.6 },
      { id: 'pvc10', montanteId: 'BLCS-12', jusanteId: 'PV-004', nome: 'PVC-10', diametroM: 0.2 },
      { id: 'bstc4', montanteId: 'PV-004', jusanteId: 'PV-005', nome: 'BSTC-4', diametroM: 1.0 },
      { id: 'pvc11', montanteId: 'BLCS-13', jusanteId: 'PV-005', nome: 'PVC-11', diametroM: 0.4 },
    ]
    const ordem = ordenarTrechosPorFluxo(caixas, trechos)

    expect(ordem.get('pvc5')).toBe(0)
    expect(ordem.get('bstc1')).toBe(1)
    expect(ordem.get('bstc1b')).toBe(2)
    // pvc6/pvc7 vêm logo depois, em qualquer ordem entre si, mas antes de bstc2
    expect(Math.max(ordem.get('pvc6')!, ordem.get('pvc7')!)).toBeLessThan(ordem.get('bstc2')!)
    expect(Math.min(ordem.get('pvc6')!, ordem.get('pvc7')!)).toBeGreaterThan(ordem.get('bstc1b')!)
    // ramal encadeado (pvc8 -> pvc9) aparece entre bstc2 e bstc3, na ordem certa entre si
    expect(ordem.get('pvc8')).toBeLessThan(ordem.get('pvc9')!)
    expect(ordem.get('bstc2')).toBeLessThan(ordem.get('pvc8')!)
    expect(ordem.get('pvc9')).toBeLessThan(ordem.get('bstc3')!)
    expect(ordem.get('bstc3')).toBeLessThan(ordem.get('pvc10')!)
    expect(ordem.get('pvc10')).toBeLessThan(ordem.get('bstc4')!)
    expect(ordem.get('bstc4')).toBeLessThan(ordem.get('pvc11')!)
  })

  it('resolve empate de diâmetro pelo nome do trecho', () => {
    const caixas = ['A', 'B', 'X'].map(caixa)
    const trechos = [
      { id: 't_z', montanteId: 'A', jusanteId: 'X', nome: 'Z-trecho', diametroM: 0.3 },
      { id: 't_a', montanteId: 'B', jusanteId: 'X', nome: 'A-trecho', diametroM: 0.3 },
    ]
    const ordem = ordenarTrechosPorFluxo(caixas, trechos)
    expect(ordem.get('t_a')).toBeLessThan(ordem.get('t_z')!)
  })
})

describe('identificarTroncoRede', () => {
  const caixa = (id: string) => ({ id, nome: id })

  it('inclui só o trecho de maior diâmetro em cada confluência, deixando ramais menores de fora', () => {
    const caixas = ['A', 'B', 'C', 'X'].map(caixa)
    const trechos = [
      { id: 'tronco', montanteId: 'A', jusanteId: 'X', nome: 'BSTC-1', diametroM: 0.6 },
      { id: 'ramal1', montanteId: 'B', jusanteId: 'X', nome: 'PVC-1', diametroM: 0.2 },
      { id: 'ramal2', montanteId: 'C', jusanteId: 'X', nome: 'PVC-2', diametroM: 0.3 },
    ]
    const tronco = identificarTroncoRede(caixas, trechos)
    expect(tronco.has('tronco')).toBe(true)
    expect(tronco.has('ramal1')).toBe(false)
    expect(tronco.has('ramal2')).toBe(false)
  })

  it('reproduz o tronco da rede real (cadeia de BSTC, sem os ramais de PVC)', () => {
    const caixas = [
      'BLCS-06', 'BLCS-08', 'BLCS-09', 'BLCS-10', 'BLCS-11', 'BLCS-12', 'BLCS-13',
      'PV-001', 'PV-002', 'PV-003', 'PV-004', 'PV-005',
      'StartNullStruct0', 'EndNullStruct0',
    ].map(caixa)
    const trechos = [
      { id: 'pvc5', montanteId: 'BLCS-06', jusanteId: 'PV-001', nome: 'PVC-5', diametroM: 0.2 },
      { id: 'bstc1', montanteId: 'PV-001', jusanteId: 'EndNullStruct0', nome: 'BSTC-1', diametroM: 0.6 },
      { id: 'bstc1b', montanteId: 'StartNullStruct0', jusanteId: 'PV-002', nome: 'BSTC-1(1)', diametroM: 0.6 },
      { id: 'pvc6', montanteId: 'BLCS-08', jusanteId: 'PV-002', nome: 'PVC-6', diametroM: 0.4 },
      { id: 'pvc7', montanteId: 'BLCS-09', jusanteId: 'PV-002', nome: 'PVC-7', diametroM: 0.5 },
      { id: 'bstc2', montanteId: 'PV-002', jusanteId: 'PV-003', nome: 'BSTC-2', diametroM: 0.6 },
      { id: 'pvc8', montanteId: 'BLCS-10', jusanteId: 'BLCS-11', nome: 'PVC-8', diametroM: 0.2 },
      { id: 'pvc9', montanteId: 'BLCS-11', jusanteId: 'PV-003', nome: 'PVC-9', diametroM: 0.5 },
      { id: 'bstc3', montanteId: 'PV-003', jusanteId: 'PV-004', nome: 'BSTC-3', diametroM: 0.6 },
      { id: 'pvc10', montanteId: 'BLCS-12', jusanteId: 'PV-004', nome: 'PVC-10', diametroM: 0.2 },
      { id: 'bstc4', montanteId: 'PV-004', jusanteId: 'PV-005', nome: 'BSTC-4', diametroM: 1.0 },
      { id: 'pvc11', montanteId: 'BLCS-13', jusanteId: 'PV-005', nome: 'PVC-11', diametroM: 0.4 },
    ]
    const tronco = identificarTroncoRede(caixas, trechos)
    expect([...tronco].sort()).toEqual(['bstc1', 'bstc1b', 'bstc2', 'bstc3', 'bstc4', 'pvc5'].sort())
  })
})

describe('identificarRedesPorPvCabeceira', () => {
  const caixa = (id: string, tipo: string = 'pv') => ({ id, nome: id, tipo })

  it('cada PV de cabeceira gera uma rede independente', () => {
    const caixas = [caixa('PV-A'), caixa('PV-B'), caixa('X'), caixa('Y')]
    const trechos = [
      { id: 't1', montanteId: 'PV-A', jusanteId: 'X', nome: 'T1', diametroM: 0.3 },
      { id: 't2', montanteId: 'PV-B', jusanteId: 'Y', nome: 'T2', diametroM: 0.3 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    expect(redes.get('t1')).not.toBe(redes.get('t2'))
    expect(redes.get('t1')).toBeDefined()
    expect(redes.get('t2')).toBeDefined()
  })

  it('quando uma rede deságua em outra (confluência), a rede dominante (maior diâmetro) continua rio abaixo', () => {
    // PV-A (rede 1, tronco maior) e PV-B (rede 2, ramal menor) convergem em X; dali em diante
    // segue como a rede de PV-A (dominante) -- a rede de PV-B "termina" ali, desaguada na de A.
    const caixas = [caixa('PV-A'), caixa('PV-B'), caixa('X'), caixa('Saida')]
    const trechos = [
      { id: 'tA', montanteId: 'PV-A', jusanteId: 'X', nome: 'BSTC-A', diametroM: 0.6 },
      { id: 'tB', montanteId: 'PV-B', jusanteId: 'X', nome: 'BSTC-B', diametroM: 0.3 },
      { id: 'tX', montanteId: 'X', jusanteId: 'Saida', nome: 'BSTC-X', diametroM: 0.6 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    const redeA = redes.get('tA')!
    const redeB = redes.get('tB')!
    expect(redeA).not.toBe(redeB)
    // rio abaixo da confluência, segue a rede da entrada dominante (PV-A, maior diâmetro)
    expect(redes.get('tX')).toBe(redeA)
  })

  it('registra em redesQueDesaguamPorCaixa o ponto (e o número da rede) onde uma rede deságua em outra', () => {
    const caixas = [caixa('PV-A'), caixa('PV-B'), caixa('X'), caixa('Saida')]
    const trechos = [
      { id: 'tA', montanteId: 'PV-A', jusanteId: 'X', nome: 'BSTC-A', diametroM: 0.6 },
      { id: 'tB', montanteId: 'PV-B', jusanteId: 'X', nome: 'BSTC-B', diametroM: 0.3 },
      { id: 'tX', montanteId: 'X', jusanteId: 'Saida', nome: 'BSTC-X', diametroM: 0.6 },
    ]
    const { redePorTrecho: redes, redesQueDesaguamPorCaixa } = identificarRedesPorPvCabeceira(caixas, trechos)
    const redeB = redes.get('tB')!
    expect(redesQueDesaguamPorCaixa.get('X')).toEqual([redeB])
    // caixas que não são ponto de confluência entre redes diferentes não aparecem no map
    expect(redesQueDesaguamPorCaixa.has('PV-A')).toBe(false)
    expect(redesQueDesaguamPorCaixa.has('PV-B')).toBe(false)
  })

  it('cabeceira que NÃO é PV (boca de lobo etc.) não gera rede própria -- se nunca chega a um PV, fica sem rede', () => {
    const caixas = [caixa('BL-01', 'boca_de_lobo'), caixa('X', 'caixa_passagem')]
    const trechos = [{ id: 't1', montanteId: 'BL-01', jusanteId: 'X', nome: 'T1', diametroM: 0.2 }]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    expect(redes.get('t1')).toBeUndefined()
  })

  it('PV que recebe DIRETO de boca de lobo/grelha ainda é considerado cabeceira e gera rede -- na prática todo PV recebe contribuição', () => {
    const caixas = [caixa('BL-01', 'boca_de_lobo'), caixa('PV-A'), caixa('Saida')]
    const trechos = [
      { id: 'tBl', montanteId: 'BL-01', jusanteId: 'PV-A', nome: 'PVC-1', diametroM: 0.2 },
      { id: 'tA', montanteId: 'PV-A', jusanteId: 'Saida', nome: 'BSTC-1', diametroM: 0.4 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    expect(redes.get('tA')).toBeDefined() // PV-A gera rede mesmo recebendo direto do inlet
    expect(redes.get('tBl')).toBe(redes.get('tA')) // e a boca de lobo que o alimenta entra na mesma rede
  })

  it('PV que recebe de OUTRO PV não é cabeceira -- é continuação da rede que já existe, não gera uma segunda', () => {
    const caixas = [caixa('PV-A'), caixa('PV-B'), caixa('Saida')]
    const trechos = [
      { id: 'tA', montanteId: 'PV-A', jusanteId: 'PV-B', nome: 'BSTC-A', diametroM: 0.4 },
      { id: 'tB', montanteId: 'PV-B', jusanteId: 'Saida', nome: 'BSTC-B', diametroM: 0.4 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    expect(redes.get('tA')).toBe(redes.get('tB')) // mesma rede -- PV-B não inicia uma nova
    expect(new Set(redes.values()).size).toBe(1)
  })

  it('boca de lobo que deságua numa rede de PV passa a integrar aquela rede a partir dali', () => {
    const caixas = [caixa('PV-A'), caixa('BL-01', 'boca_de_lobo'), caixa('X'), caixa('Saida')]
    const trechos = [
      { id: 'tA', montanteId: 'PV-A', jusanteId: 'X', nome: 'BSTC-A', diametroM: 0.6 },
      { id: 'tBl', montanteId: 'BL-01', jusanteId: 'X', nome: 'PVC-BL', diametroM: 0.2 },
      { id: 'tX', montanteId: 'X', jusanteId: 'Saida', nome: 'BSTC-X', diametroM: 0.6 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    // a boca de lobo não GERA rede própria, mas passa a integrar a rede em que deságua
    expect(redes.get('tBl')).toBe(redes.get('tA'))
    expect(redes.get('tX')).toBe(redes.get('tA')) // e o trecho depois da confluência também segue a rede do PV
  })

  it('numera os PVs de cabeceira em ordem alfabética do nome', () => {
    const caixas = [caixa('PV-002'), caixa('PV-001'), caixa('X'), caixa('Y')]
    const trechos = [
      { id: 't_002', montanteId: 'PV-002', jusanteId: 'Y', nome: 'T-002', diametroM: 0.3 },
      { id: 't_001', montanteId: 'PV-001', jusanteId: 'X', nome: 'T-001', diametroM: 0.3 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    expect(redes.get('t_001')).toBe(1) // PV-001 vem antes de PV-002 alfabeticamente
    expect(redes.get('t_002')).toBe(2)
  })

  it('funde pares Start/EndNullStruct pro mesmo lado da rede (mesmo critério de ordenarTrechosPorFluxo)', () => {
    const caixas = [caixa('PV-001'), caixa('StartNullStruct0'), caixa('EndNullStruct0'), caixa('PV-002')]
    const trechos = [
      { id: 'bstc1', montanteId: 'PV-001', jusanteId: 'EndNullStruct0', nome: 'BSTC-1', diametroM: 0.6 },
      { id: 'bstc1b', montanteId: 'StartNullStruct0', jusanteId: 'PV-002', nome: 'BSTC-1(1)', diametroM: 0.6 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    expect(redes.get('bstc1')).toBe(redes.get('bstc1b'))
  })
})

describe('calcularQEntradaBacia', () => {
  it('aplica o método racional Q = 2.78e-7 × C × i × área', () => {
    expect(calcularQEntradaBacia(0.9, 80, 1000)).toBeCloseTo(2.78e-7 * 0.9 * 80 * 1000, 12)
  })
})

describe('calcularQProjeto', () => {
  it('aplica Q = 2.78e-7 × ΣCA × intensidade do Tc do sistema', () => {
    expect(calcularQProjeto(900, 80)).toBeCloseTo(2.78e-7 * 900 * 80, 12)
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
