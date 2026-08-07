import { describe, expect, it } from 'vitest'
import {
  acumularVazao,
  calcularQEntradaBacia,
  calcularQProjeto,
  calcularTcSistema,
  corrigirRecobrimentoCabeceiras,
  ehCaixaDestinoExterno,
  GrafoCicloError,
  identificarCaixasComMultiplasSaidas,
  identificarCaixasIsoladas,
  identificarCaixasSemJusante,
  identificarRecobrimentoInsuficiente,
  identificarRedesPorPvCabeceira,
  identificarTroncoRede,
  ordenarTopologicamente,
  ordenarTrechosPorFluxo,
  recalcularPerfilRedeUniforme,
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

  it('lança GrafoCicloError com os ids presos no ciclo', () => {
    const arestas = [
      { id: 't1', montanteId: 'A', jusanteId: 'B' },
      { id: 't2', montanteId: 'B', jusanteId: 'A' },
    ]
    expect(() => ordenarTopologicamente(['A', 'B'], arestas)).toThrow(GrafoCicloError)
    try {
      ordenarTopologicamente(['A', 'B'], arestas)
    } catch (e) {
      expect(e).toBeInstanceOf(GrafoCicloError)
      expect((e as GrafoCicloError).idsNoCiclo.sort()).toEqual(['A', 'B'])
    }
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

  it('com diâmetros todos iguais, usa a classificação de rede tronco (ehTronco) em vez do nome pra decidir quem é a continuação do tronco', () => {
    // reproduz o caso real: PV-48 -> PV-49 -> PV-50 -> PV-51 é o tronco de verdade (cabeceira lá
    // atrás, em PV-48), mas PV-49 também recebe um ramalzinho de captação (CT-81 -> CT-82 ->
    // CT-83 -> PV-49) com o MESMO diâmetro 0.6 -- sem classificação de tronco, o desempate por
    // nome do trecho ("TUBO-256" do ramal vs "TUBO-249" do tronco, por exemplo) podia mandar a
    // tabela começar pelo ramal de captação em vez da cabeceira real do tronco.
    const caixa = (id: string, ehTronco: boolean) => ({ id, nome: id, ehTronco })
    const caixas = [
      caixa('PV-48', true),
      caixa('PV-49', true),
      caixa('PV-50', true),
      caixa('PV-51', true),
      caixa('CT-81', false),
      caixa('CT-82', false),
      caixa('CT-83', false),
    ]
    const trechos = [
      // nomeado de propósito pra vir DEPOIS dos ramais em ordem alfabética -- só a classificação
      // de tronco (não o nome) deve decidir a ordem aqui.
      { id: 'troncoA', montanteId: 'PV-48', jusanteId: 'PV-49', nome: 'TUBO-Z-tronco-A', diametroM: 0.6 },
      { id: 'troncoB', montanteId: 'PV-49', jusanteId: 'PV-50', nome: 'TUBO-Z-tronco-B', diametroM: 0.6 },
      { id: 'troncoC', montanteId: 'PV-50', jusanteId: 'PV-51', nome: 'TUBO-Z-tronco-C', diametroM: 0.6 },
      { id: 'ramal1', montanteId: 'CT-81', jusanteId: 'CT-82', nome: 'TUBO-A-ramal-1', diametroM: 0.6 },
      { id: 'ramal2', montanteId: 'CT-82', jusanteId: 'CT-83', nome: 'TUBO-A-ramal-2', diametroM: 0.6 },
      { id: 'ramal3', montanteId: 'CT-83', jusanteId: 'PV-49', nome: 'TUBO-A-ramal-3', diametroM: 0.6 },
    ]
    const ordem = ordenarTrechosPorFluxo(caixas, trechos)
    // o tronco que chega em PV-49 (troncoA) tem que vir ANTES do ramal de captação que também
    // desagua em PV-49 (ramal1), mesmo o ramal tendo nome alfabeticamente anterior.
    expect(ordem.get('troncoA')).toBeLessThan(ordem.get('ramal1')!)
    // e o resto do tronco rio abaixo de PV-49 continua depois do ramal já ter sido emitido ali
    expect(ordem.get('ramal3')).toBeLessThan(ordem.get('troncoB')!)
  })
})

describe('identificarTroncoRede', () => {
  const caixa = (id: string, ehTronco: boolean) => ({ id, nome: id, ehTronco })

  it('inclui um trecho quando a caixa de montante dele é classificada como rede tronco', () => {
    const caixas = [caixa('A', true), caixa('B', false), caixa('C', false), caixa('X', true)]
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

  it('inclui os DOIS ramais grandes de uma confluência quando as duas caixas de montante são tronco -- não escolhe só um por diâmetro', () => {
    // reproduz o caso real do PV-21: TUBO-18 (de BL-11, boca de lobo) e TUBO-17 (de BL-1, boca
    // de lobo) convergindo, mais TUBO-167/169 vindo de caixas de passagem (CT) -- com BL e PV
    // classificados como tronco por padrão e CT não, tronco pega os dois BL, não só o de maior
    // diâmetro.
    const caixas = [
      caixa('BL-11', true),
      caixa('BL-1', true),
      caixa('CT-21', false),
      caixa('CT-22', false),
      caixa('PV-21', true),
    ]
    const trechos = [
      { id: 'tubo18', montanteId: 'BL-11', jusanteId: 'PV-21', nome: 'TUBO-18', diametroM: 0.4 },
      { id: 'tubo167', montanteId: 'CT-21', jusanteId: 'PV-21', nome: 'TUBO-167', diametroM: 0.6 },
      { id: 'tubo169', montanteId: 'CT-22', jusanteId: 'PV-21', nome: 'TUBO-169', diametroM: 0.3 },
      { id: 'tubo17', montanteId: 'BL-1', jusanteId: 'PV-21', nome: 'TUBO-17', diametroM: 0.4 },
    ]
    const tronco = identificarTroncoRede(caixas, trechos)
    expect(tronco.has('tubo18')).toBe(true)
    expect(tronco.has('tubo17')).toBe(true)
    expect(tronco.has('tubo167')).toBe(false)
    expect(tronco.has('tubo169')).toBe(false)
  })

  it('uma caixa não-tronco no meio do caminho não interrompe a exploração rio acima -- só o trecho que sai dela fica de fora', () => {
    // A (tronco) -> B (NÃO tronco, só repassa) -> X (tronco): o trecho A->B é tronco (montante A
    // é tronco), o trecho B->X não é (montante B não é tronco) -- mesmo assim a função continua
    // explorando pra trás de B e inclui A->B corretamente.
    const caixas = [caixa('A', true), caixa('B', false), caixa('X', true)]
    const trechos = [
      { id: 'ab', montanteId: 'A', jusanteId: 'B', nome: 'T-AB', diametroM: 0.3 },
      { id: 'bx', montanteId: 'B', jusanteId: 'X', nome: 'T-BX', diametroM: 0.3 },
    ]
    const tronco = identificarTroncoRede(caixas, trechos)
    expect(tronco.has('ab')).toBe(true)
    expect(tronco.has('bx')).toBe(false)
  })

  it('reproduz o tronco da rede real (cadeia de PVs, sem os ramais de BLCS)', () => {
    const nomesPv = new Set(['PV-001', 'PV-002', 'PV-003', 'PV-004', 'PV-005', 'StartNullStruct0', 'EndNullStruct0'])
    const caixas = [
      'BLCS-06', 'BLCS-08', 'BLCS-09', 'BLCS-10', 'BLCS-11', 'BLCS-12', 'BLCS-13',
      'PV-001', 'PV-002', 'PV-003', 'PV-004', 'PV-005',
      'StartNullStruct0', 'EndNullStruct0',
    ].map((id) => caixa(id, nomesPv.has(id)))
    const trechos = [
      { id: 'pvc5', montanteId: 'BLCS-06', jusanteId: 'PV-001', nome: 'PVC-5', diametroM: 0.2 },
      { id: 'bstc1', montanteId: 'PV-001', jusanteId: 'EndNullStruct0', nome: 'BSTC-1', diametroM: 0.6 },
      { id: 'bstc1b', montanteId: 'StartNullStruct0', jusanteId: 'PV-002', nome: 'BSTC-1(1)', diametroM: 0.6 },
      { id: 'pvc6', montanteId: 'BLCS-08', jusanteId: 'PV-002', nome: 'PVC-6', diametroM: 0.4 },
      { id: 'pvc7', montanteId: 'BLCS-09', jusanteId: 'PV-002', nome: 'PVC-7', diametroM: 0.5 },
      { id: 'bstc2', montanteId: 'PV-002', jusanteId: 'PV-003', nome: 'BSTC-2', diametroM: 0.6 },
      { id: 'pvc9', montanteId: 'BLCS-11', jusanteId: 'PV-003', nome: 'PVC-9', diametroM: 0.5 },
      { id: 'bstc3', montanteId: 'PV-003', jusanteId: 'PV-004', nome: 'BSTC-3', diametroM: 0.6 },
      { id: 'pvc10', montanteId: 'BLCS-12', jusanteId: 'PV-004', nome: 'PVC-10', diametroM: 0.2 },
      { id: 'bstc4', montanteId: 'PV-004', jusanteId: 'PV-005', nome: 'BSTC-4', diametroM: 1.0 },
      { id: 'pvc11', montanteId: 'BLCS-13', jusanteId: 'PV-005', nome: 'PVC-11', diametroM: 0.4 },
    ]
    const tronco = identificarTroncoRede(caixas, trechos)
    expect([...tronco].sort()).toEqual(['bstc1', 'bstc1b', 'bstc2', 'bstc3', 'bstc4'].sort())
  })
})

describe('identificarRedesPorPvCabeceira', () => {
  const caixa = (id: string, tipo: string = 'pv') => ({ id, nome: id, tipo })

  it('grafo com ciclo: mensagem cita os nomes das caixas presas, não os ids internos', () => {
    const caixas = [
      { id: 'id-1', nome: 'PV-01', tipo: 'pv' },
      { id: 'id-2', nome: 'PV-02', tipo: 'pv' },
    ]
    const trechos = [
      { id: 't1', montanteId: 'id-1', jusanteId: 'id-2', nome: 'T1', diametroM: 0.3 },
      { id: 't2', montanteId: 'id-2', jusanteId: 'id-1', nome: 'T2', diametroM: 0.3 },
    ]
    expect(() => identificarRedesPorPvCabeceira(caixas, trechos)).toThrow('PV-01')
    expect(() => identificarRedesPorPvCabeceira(caixas, trechos)).toThrow('PV-02')
  })

  it('retropropaga a rede pra cadeia inteira de caixas de captação em fila (2+ hops antes do PV), não só a última', () => {
    // reproduz o caso real: CT-19 -> CT-20 -> CT-21 -> PV-21 (cabeceira). Quando CT-20 e CT-21
    // são processadas (antes de PV-21, em ordem topológica), ainda não existe rede nenhuma pra
    // herdar -- só quando PV-21 é processada e vira cabeceira que a rede aparece, e só o trecho
    // que desagua DIRETO nela (CT-21->PV-21) seria adotado sem a retropropagação. Os trechos do
    // meio (CT-19->CT-20, CT-20->CT-21) precisam herdar a mesma rede.
    const caixas = [
      caixa('CT-19', 'caixa_passagem'),
      caixa('CT-20', 'caixa_passagem'),
      caixa('CT-21', 'caixa_passagem'),
      caixa('PV-21', 'pv'),
    ]
    const trechos = [
      { id: 't1', montanteId: 'CT-19', jusanteId: 'CT-20', nome: 'TUBO-165', diametroM: 0.3 },
      { id: 't2', montanteId: 'CT-20', jusanteId: 'CT-21', nome: 'TUBO-166', diametroM: 0.3 },
      { id: 't3', montanteId: 'CT-21', jusanteId: 'PV-21', nome: 'TUBO-167', diametroM: 0.6 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    expect(redes.get('t3')).toBeDefined()
    expect(redes.get('t2')).toBe(redes.get('t3'))
    expect(redes.get('t1')).toBe(redes.get('t3'))
  })

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

  it('PV que só recebe de caixas não-PV não corta a rede se uma delas já carrega rede vinda de outro PV mais a montante', () => {
    // reproduz o bug real: PV-61 (rede 1, grande) -> ... -> BL-12 (não-pv, só repassa) -> PV-22.
    // PV-22 só tem entradas não-pv diretas (BL-12 e CT-47), então seria "candidato" a cabeceira
    // -- mas BL-12 já carrega a rede de PV-61 (que vem de trás), então PV-22 tem que herdar essa
    // rede, não criar uma segunda do zero.
    const caixas = [caixa('PV-61'), caixa('BL-12', 'boca_de_lobo'), caixa('CT-47', 'caixa_transicao'), caixa('PV-22'), caixa('Saida')]
    const trechos = [
      { id: 'tubo18', montanteId: 'PV-61', jusanteId: 'BL-12', nome: 'TUBO-18', diametroM: 0.6 },
      { id: 'tubo19', montanteId: 'BL-12', jusanteId: 'PV-22', nome: 'TUBO-19', diametroM: 0.6 },
      { id: 'tubo207', montanteId: 'CT-47', jusanteId: 'PV-22', nome: 'TUBO-207', diametroM: 0.6 },
      { id: 'tubo20', montanteId: 'PV-22', jusanteId: 'Saida', nome: 'TUBO-20', diametroM: 0.6 },
    ]
    const { redePorTrecho: redes } = identificarRedesPorPvCabeceira(caixas, trechos)
    const redePv61 = redes.get('tubo18')!
    expect(redePv61).toBeDefined()
    // TUBO-20 (saída de PV-22) continua a rede de PV-61 -- PV-22 NÃO criou uma rede nova
    expect(redes.get('tubo20')).toBe(redePv61)
    expect(new Set(redes.values()).size).toBe(1)
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

describe('identificarCaixasSemJusante', () => {
  const caixa = (id: string) => ({ id, nome: id })

  it('identifica a saída real do terreno (recebe água, não tem pra onde mandar)', () => {
    const caixas = ['A', 'B'].map(caixa)
    const trechos = [{ id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 }]
    expect(identificarCaixasSemJusante(caixas, trechos)).toEqual(['B'])
  })

  it('não aponta uma cabeceira pura (sem entrada nenhuma) como "sem jusante" -- ela nunca recebeu água', () => {
    const caixas = ['A'].map(caixa)
    const trechos: { id: string; montanteId: string; jusanteId: string; nome: string; diametroM: number }[] = []
    expect(identificarCaixasSemJusante(caixas, trechos)).toEqual([])
  })

  it('não acusa falso positivo num par Start/EndNullStruct (emenda sem estrutura real)', () => {
    const caixas = [caixa('PV-001'), caixa('StartNullStruct0'), caixa('EndNullStruct0'), caixa('PV-002')]
    const trechos = [
      { id: 'bstc1', montanteId: 'PV-001', jusanteId: 'EndNullStruct0', nome: 'BSTC-1', diametroM: 0.6 },
      { id: 'bstc1b', montanteId: 'StartNullStruct0', jusanteId: 'PV-002', nome: 'BSTC-1(1)', diametroM: 0.6 },
    ]
    // EndNullStruct0/StartNullStruct0 são o mesmo ponto físico (fundidos) -- só PV-002 (saída
    // real) deveria aparecer, não a emenda no meio do caminho.
    expect(identificarCaixasSemJusante(caixas, trechos)).toEqual(['PV-002'])
  })

  it('lista mais de uma caixa sem jusante quando a rede tem mais de uma saída/quebra', () => {
    const caixas = ['A', 'B', 'C', 'D'].map(caixa)
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 },
      { id: 't2', montanteId: 'C', jusanteId: 'D', nome: 'T2', diametroM: 0.3 },
    ]
    expect(identificarCaixasSemJusante(caixas, trechos).sort()).toEqual(['B', 'D'])
  })

  it('não acusa uma caixa "JUS" -- é a ligação declarada com a rede externa, fim de projeto de propósito', () => {
    const caixas = [caixa('A'), { id: 'B', nome: 'JUS - 1' }]
    const trechos = [{ id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 }]
    expect(identificarCaixasSemJusante(caixas, trechos)).toEqual([])
  })

  it('numa rede com mais de uma quebra, só a que NÃO é JUS aparece na lista', () => {
    const caixas = ['A', 'C'].map(caixa).concat([{ id: 'B', nome: 'JUS - 1' }, { id: 'D', nome: 'D' }])
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 }, // termina em JUS -- ok
      { id: 't2', montanteId: 'C', jusanteId: 'D', nome: 'T2', diametroM: 0.3 }, // termina numa caixa qualquer -- suspeito
    ]
    expect(identificarCaixasSemJusante(caixas, trechos)).toEqual(['D'])
  })
})

describe('ehCaixaDestinoExterno', () => {
  it('reconhece variações comuns de nome da caixa JUS', () => {
    expect(ehCaixaDestinoExterno('JUS - 1')).toBe(true)
    expect(ehCaixaDestinoExterno('JUS-01')).toBe(true)
    expect(ehCaixaDestinoExterno('jus 1')).toBe(true)
    expect(ehCaixaDestinoExterno('JUS_1')).toBe(true)
    expect(ehCaixaDestinoExterno('JUS1')).toBe(true)
  })

  it('não confunde com nomes que só começam parecido', () => {
    expect(ehCaixaDestinoExterno('Justino - 1')).toBe(false)
    expect(ehCaixaDestinoExterno('PV - 1')).toBe(false)
  })
})

describe('identificarCaixasIsoladas', () => {
  const caixa = (id: string) => ({ id, nome: id })

  it('identifica uma caixa sem nenhum trecho ligado (nem montante, nem jusante)', () => {
    const caixas = [caixa('A'), caixa('B'), caixa('CT-24')]
    const trechos = [{ id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 }]
    expect(identificarCaixasIsoladas(caixas, trechos)).toEqual(['CT-24'])
  })

  it('não aponta uma caixa que tem entrada ou saída, mesmo que só uma das duas', () => {
    const caixas = [caixa('A'), caixa('B'), caixa('C')]
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 }, // A: só saída; B: só entrada
    ]
    expect(identificarCaixasIsoladas(caixas, trechos)).not.toContain('A')
    expect(identificarCaixasIsoladas(caixas, trechos)).not.toContain('B')
    expect(identificarCaixasIsoladas(caixas, trechos)).toEqual(['C'])
  })

  it('não acusa falso positivo num par Start/EndNullStruct (emenda sem estrutura real)', () => {
    const caixas = [caixa('PV-001'), caixa('StartNullStruct0'), caixa('EndNullStruct0'), caixa('PV-002')]
    const trechos = [
      { id: 'bstc1', montanteId: 'PV-001', jusanteId: 'EndNullStruct0', nome: 'BSTC-1', diametroM: 0.6 },
      { id: 'bstc1b', montanteId: 'StartNullStruct0', jusanteId: 'PV-002', nome: 'BSTC-1(1)', diametroM: 0.6 },
    ]
    expect(identificarCaixasIsoladas(caixas, trechos)).toEqual([])
  })
})

describe('identificarCaixasComMultiplasSaidas', () => {
  const caixa = (id: string) => ({ id, nome: id })

  it('identifica uma caixa com 2 trechos de saída', () => {
    const caixas = [caixa('A'), caixa('B'), caixa('C')]
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 },
      { id: 't2', montanteId: 'A', jusanteId: 'C', nome: 'T2', diametroM: 0.3 },
    ]
    expect(identificarCaixasComMultiplasSaidas(caixas, trechos)).toEqual([{ caixaId: 'A', quantidade: 2 }])
  })

  it('não acusa caixa com só 1 saída', () => {
    const caixas = [caixa('A'), caixa('B')]
    const trechos = [{ id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.3 }]
    expect(identificarCaixasComMultiplasSaidas(caixas, trechos)).toEqual([])
  })

  it('não acusa falso positivo num par Start/EndNullStruct (emenda sem estrutura real) mesmo com outro trecho saindo da mesma caixa fundida', () => {
    // StartNullStruct0/EndNullStruct0 é o MESMO ponto físico (fundido) -- a saída dele
    // (bstc1b, StartNullStruct0->PV-002) não deveria contar como uma segunda saída de PV-001.
    const caixas = [caixa('PV-001'), caixa('StartNullStruct0'), caixa('EndNullStruct0'), caixa('PV-002')]
    const trechos = [
      { id: 'bstc1', montanteId: 'PV-001', jusanteId: 'EndNullStruct0', nome: 'BSTC-1', diametroM: 0.6 },
      { id: 'bstc1b', montanteId: 'StartNullStruct0', jusanteId: 'PV-002', nome: 'BSTC-1(1)', diametroM: 0.6 },
    ]
    expect(identificarCaixasComMultiplasSaidas(caixas, trechos)).toEqual([])
  })
})

describe('recalcularPerfilRedeUniforme', () => {
  const caixa = (id: string, cotaTerreno: number | null = 100) => ({ id, nome: id, cotaTerreno })

  it('aplica recobrimento na cabeceira e a mesma declividade rio abaixo, em cascata', () => {
    const caixas = [caixa('A', 100), caixa('B', 98), caixa('C', 96)]
    const trechos = [
      { id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.4, comprimentoM: 20 },
      { id: 't2', montanteId: 'B', jusanteId: 'C', nome: 'T2', diametroM: 0.4, comprimentoM: 20 },
    ]
    const { patches, cabeceirasSemCotaTerreno } = recalcularPerfilRedeUniforme(caixas, trechos, 0.01, 1.2)
    expect(cabeceirasSemCotaTerreno).toEqual([])

    const p1 = patches.find((p) => p.id === 't1')!
    // cabeceira A: terreno 100 - recobrimento 1.2 - diâmetro 0.4 = cota de fundo 98.4
    expect(p1.cotaFundoMontante).toBeCloseTo(98.4)
    expect(p1.declividadeMM).toBe(0.01)
    // cota de fundo jusante = 98.4 - 0.01*20 = 98.2
    expect(p1.cotaFundoJusante).toBeCloseTo(98.2)
    expect(p1.cotaTopoMontante).toBeCloseTo(98.8)

    const p2 = patches.find((p) => p.id === 't2')!
    // t2 continua exatamente de onde t1 parou (mesma cota, mesma declividade uniforme)
    expect(p2.cotaFundoMontante).toBeCloseTo(p1.cotaFundoJusante)
    expect(p2.declividadeMM).toBe(0.01)
    expect(p2.cotaFundoJusante).toBeCloseTo(98.2 - 0.01 * 20)
  })

  it('numa confluência, a cota que continua rio abaixo é a MENOR entre as entradas', () => {
    const caixas = [caixa('A', 100), caixa('B', 100), caixa('X', 90), caixa('Saida', 85)]
    const trechos = [
      { id: 'ta', montanteId: 'A', jusanteId: 'X', nome: 'TA', diametroM: 0.4, comprimentoM: 10 },
      { id: 'tb', montanteId: 'B', jusanteId: 'X', nome: 'TB', diametroM: 0.3, comprimentoM: 30 }, // mais comprido -> chega mais baixo
      { id: 'tx', montanteId: 'X', jusanteId: 'Saida', nome: 'TX', diametroM: 0.4, comprimentoM: 10 },
    ]
    const { patches } = recalcularPerfilRedeUniforme(caixas, trechos, 0.01, 1.0)
    const pa = patches.find((p) => p.id === 'ta')!
    const pb = patches.find((p) => p.id === 'tb')!
    const px = patches.find((p) => p.id === 'tx')!
    expect(pb.cotaFundoJusante).toBeLessThan(pa.cotaFundoJusante) // TB é o mais fundo em X
    expect(px.cotaFundoMontante).toBeCloseTo(pb.cotaFundoJusante) // TX continua do mais fundo, não do TA
  })

  it('cabeceira sem cota de terreno cadastrada entra em cabeceirasSemCotaTerreno e fica fora dos patches', () => {
    const caixas = [caixa('A', null), caixa('B', 90)]
    const trechos = [{ id: 't1', montanteId: 'A', jusanteId: 'B', nome: 'T1', diametroM: 0.4, comprimentoM: 20 }]
    const { patches, cabeceirasSemCotaTerreno } = recalcularPerfilRedeUniforme(caixas, trechos, 0.01, 1.2)
    expect(cabeceirasSemCotaTerreno).toEqual(['A'])
    expect(patches).toEqual([])
  })
})

describe('identificarRecobrimentoInsuficiente', () => {
  const caixa = (id: string, cotaTerreno: number | null) => ({ id, nome: id, cotaTerreno })
  const trecho = (over: Partial<ReturnType<typeof trechoBase>>) => ({ ...trechoBase(), ...over })
  const trechoBase = () => ({
    id: 't1',
    nome: 'T1',
    montanteId: 'A',
    jusanteId: 'B',
    diametroM: 0.3,
    comprimentoM: 20,
    declividadeMM: 0.005,
    cotaTopoMontante: 99,
    cotaTopoJusante: 98.9,
  })

  it('acusa recobrimento negativo (tubo acima da cota de terreno) na cabeceira -- o caso relatado (BS acima da superfície)', () => {
    // cabeceira (A sem entrada nenhuma): terreno 99.5, topo do tubo 99.6 -> recobrimento -0.1 m.
    // B com terreno bem acima do topo jusante (98.9), só pra essa violação não disparar junto.
    const caixas = [caixa('A', 99.5), caixa('B', 100.5)]
    const trechos = [trecho({ cotaTopoMontante: 99.6 })]
    const violacoes = identificarRecobrimentoInsuficiente(caixas, trechos, 1.2)
    expect(violacoes).toHaveLength(1)
    expect(violacoes[0]).toMatchObject({ trechoId: 't1', extremidade: 'montante', caixaId: 'A', ehCabeceira: true })
    expect(violacoes[0].recobrimentoM).toBeCloseTo(-0.1)
  })

  it('não acusa quando o recobrimento está dentro do mínimo', () => {
    const caixas = [caixa('A', 100), caixa('B', 95)]
    const trechos = [trecho({ cotaTopoMontante: 98.5, cotaTopoJusante: 93 })] // recobrimento 1.5 e 2.0, acima do mínimo 1.2
    expect(identificarRecobrimentoInsuficiente(caixas, trechos, 1.2)).toEqual([])
  })

  it('marca ehCabeceira=false quando a violação é no meio do caminho (caixa com entrada)', () => {
    const caixas = [caixa('A', 100), caixa('B', 100), caixa('C', 95)]
    const trechos = [
      trecho({ id: 't0', montanteId: 'Z', jusanteId: 'B', cotaTopoMontante: 98, cotaTopoJusante: 96 }), // dá entrada em B
      trecho({ id: 't1', montanteId: 'B', jusanteId: 'C', cotaTopoMontante: 99.5, cotaTopoJusante: 94 }), // B agora TEM entrada
    ]
    const caixasComZ = [...caixas, caixa('Z', 100)]
    const violacoes = identificarRecobrimentoInsuficiente(caixasComZ, trechos, 1.2)
    const violacaoMontanteT1 = violacoes.find((v) => v.trechoId === 't1' && v.extremidade === 'montante')
    expect(violacaoMontanteT1?.ehCabeceira).toBe(false)
  })
})

describe('corrigirRecobrimentoCabeceiras', () => {
  const caixa = (id: string, cotaTerreno: number | null) => ({ id, nome: id, cotaTerreno })

  it('empurra a cota de fundo da cabeceira pra baixo até garantir o recobrimento mínimo, preservando a declividade', () => {
    const caixas = [caixa('A', 99.5), caixa('B', 95)]
    const trechos = [
      {
        id: 't1',
        nome: 'T1',
        montanteId: 'A',
        jusanteId: 'B',
        diametroM: 0.3,
        comprimentoM: 20,
        declividadeMM: 0.005,
        cotaTopoMontante: 99.6, // recobrimento -0.1 m (acima do terreno) -- o caso relatado
        cotaTopoJusante: 99.5,
      },
    ]
    const correcoes = corrigirRecobrimentoCabeceiras(caixas, trechos, 1.2)
    expect(correcoes).toHaveLength(1)
    const c = correcoes[0]
    // terreno 99.5 - recobrimento 1.2 = topo 98.3; fundo = topo - diâmetro 0.3 = 98.0
    expect(c.cotaTopoMontante).toBeCloseTo(98.3)
    expect(c.cotaFundoMontante).toBeCloseTo(98.0)
    // declividade preservada: fundo jusante = 98.0 - 0.005*20 = 97.9
    expect(c.cotaFundoJusante).toBeCloseTo(97.9)
    expect(c.cotaTopoJusante).toBeCloseTo(97.9 + 0.3)
  })

  it('não mexe em violação que não é de cabeceira', () => {
    const caixas = [caixa('A', 100), caixa('B', 100), caixa('C', 95)]
    const trechos = [
      { id: 't0', nome: 'T0', montanteId: 'Z', jusanteId: 'B', diametroM: 0.3, comprimentoM: 10, declividadeMM: 0.005, cotaTopoMontante: 98, cotaTopoJusante: 96 },
      { id: 't1', nome: 'T1', montanteId: 'B', jusanteId: 'C', diametroM: 0.3, comprimentoM: 20, declividadeMM: 0.005, cotaTopoMontante: 99.5, cotaTopoJusante: 94 },
    ]
    const caixasComZ = [...caixas, caixa('Z', 100)]
    expect(corrigirRecobrimentoCabeceiras(caixasComZ, trechos, 1.2)).toEqual([])
  })

  it('não corrige cabeceira cuja caixa não tem cota de terreno cadastrada', () => {
    const caixas = [caixa('A', null), caixa('B', 90)]
    const trechos = [
      { id: 't1', nome: 'T1', montanteId: 'A', jusanteId: 'B', diametroM: 0.3, comprimentoM: 20, declividadeMM: 0.005, cotaTopoMontante: 91, cotaTopoJusante: 89 },
    ]
    expect(corrigirRecobrimentoCabeceiras(caixas, trechos, 1.2)).toEqual([])
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
