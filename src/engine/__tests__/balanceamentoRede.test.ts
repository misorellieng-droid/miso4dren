import { describe, expect, it } from 'vitest'
import { avaliarBalanceamentoRede, type CaixaBalanceamento, type TrechoBalanceamento } from '../balanceamentoRede'

describe('avaliarBalanceamentoRede', () => {
  const caixa = (id: string, x: number, y: number, cotaFundo: number, nome = id): CaixaBalanceamento => ({
    id,
    nome,
    x,
    y,
    cotaFundo,
  })

  it('identifica a vazão total em cada saída JUS', () => {
    const caixas = [caixa('PV-1', 0, 0, 100), caixa('JUS - 1', 0, -50, 90)]
    const trechos: TrechoBalanceamento[] = [
      { id: 't1', nome: 'T1', montanteId: 'PV-1', jusanteId: 'JUS - 1', comprimentoM: 50, cotaFundoMontante: 100, cotaFundoJusante: 90 },
    ]
    const redePorTrecho = new Map([['t1', 1]])
    const vazaoPorTrecho = new Map([['t1', 0.5]])
    const caPorTrecho = new Map([['t1', 1000]])
    const { saidasFinais } = avaliarBalanceamentoRede(caixas, trechos, redePorTrecho, new Map(), vazaoPorTrecho, caPorTrecho)
    expect(saidasFinais).toEqual([
      { trechoId: 't1', nomeTrecho: 'T1', caixaJusId: 'JUS - 1', nomeCaixaJus: 'JUS - 1', sistema: 1, vazaoM3s: 0.5, caAcumuladoM2: 1000 },
    ])
  })

  it('detecta confluência com degrau grande e sugere um candidato que melhora o desbalanceamento', () => {
    // Dois braços saindo em JUS diferentes, bem desbalanceados (0.5 vs 0.1 m³/s). O Sistema 2
    // desagua no Sistema 1 em X com um degrau grande. Existe uma caixa "CANDIDATA" perto de X,
    // morro abaixo, que pertence ao grupo do JUS-2 (menos carregado) -- deveria ser sugerida.
    const caixas = [
      caixa('CAB-1', 0, 0, 100), // cabeceira sistema 1
      caixa('X', 0, -100, 90), // confluência: sistema 2 desagua aqui, sistema 1 continua
      caixa('JUS - 1', 0, -200, 80),
      caixa('CAB-2', 100, -80, 95), // cabeceira sistema 2 (tributário)
      caixa('CANDIDATA', 10, -95, 88), // pertence ao grupo JUS-2, pertinho de X, morro abaixo
      caixa('JUS - 2', 200, -150, 70),
    ]
    const trechos: TrechoBalanceamento[] = [
      { id: 't_cab1_x', nome: 'T-CAB1-X', montanteId: 'CAB-1', jusanteId: 'X', comprimentoM: 100, cotaFundoMontante: 100, cotaFundoJusante: 90 },
      { id: 't_x_jus1', nome: 'T-X-JUS1', montanteId: 'X', jusanteId: 'JUS - 1', comprimentoM: 100, cotaFundoMontante: 89, cotaFundoJusante: 80 },
      {
        id: 't_cab2_x',
        nome: 'T-CAB2-X',
        montanteId: 'CAB-2',
        jusanteId: 'X',
        comprimentoM: 30,
        cotaFundoMontante: 95,
        cotaFundoJusante: 93, // bem mais alto que a saída principal (89) -> degrau grande
      },
      {
        id: 't_candidata_jus2',
        nome: 'T-CANDIDATA-JUS2',
        montanteId: 'CANDIDATA',
        jusanteId: 'JUS - 2',
        comprimentoM: 120,
        cotaFundoMontante: 88,
        cotaFundoJusante: 70,
      },
    ]
    const redePorTrecho = new Map([
      ['t_cab1_x', 1],
      ['t_x_jus1', 1],
      ['t_cab2_x', 2],
      ['t_candidata_jus2', 3],
    ])
    const redesQueDesaguamPorCaixa = new Map([['X', [2]]])
    const vazaoPorTrecho = new Map([
      ['t_cab1_x', 0.4],
      ['t_x_jus1', 0.5],
      ['t_cab2_x', 0.1],
      ['t_candidata_jus2', 0.1],
    ])
    const caPorTrecho = new Map<string, number>()

    const { confluenciasSuspeitas } = avaliarBalanceamentoRede(
      caixas,
      trechos,
      redePorTrecho,
      redesQueDesaguamPorCaixa,
      vazaoPorTrecho,
      caPorTrecho
    )

    expect(confluenciasSuspeitas).toHaveLength(1)
    const suspeita = confluenciasSuspeitas[0]
    expect(suspeita.caixaId).toBe('X')
    expect(suspeita.sistemaTributario).toBe(2)
    expect(suspeita.degrauM).toBeCloseTo(93 - 89, 5) // cotaFundoJusante do tributário - cotaFundoMontante da saída principal
    expect(suspeita.candidatos.length).toBeGreaterThan(0)
    expect(suspeita.candidatos[0].caixaDestinoId).toBe('CANDIDATA')
    expect(suspeita.candidatos[0].desbalanceamentoProjetadoM3s).toBeLessThan(suspeita.candidatos[0].desbalanceamentoAtualM3s)
  })

  it('não sugere religar no mesmo grupo, fora do raio, morro acima, ou se não melhora o desbalanceamento', () => {
    const caixas = [
      caixa('CAB-1', 0, 0, 100),
      caixa('X', 0, -100, 90),
      caixa('JUS - 1', 0, -200, 80),
      caixa('CAB-2', 100, -80, 95),
      caixa('MESMO-GRUPO', 5, -101, 85), // mesmo grupo do JUS-1 -- não deve ajudar a balancear
      caixa('MORRO-ACIMA', 5, -102, 92), // mais alto que a cota de chegada do tributário -- inviável
      caixa('LONGE', 5000, -5000, 50), // fora do raio de busca
      caixa('JUS - 1b', 500, -500, 40),
      caixa('JUS - 2', 200, -150, 70),
    ]
    const trechos: TrechoBalanceamento[] = [
      { id: 't_cab1_x', nome: 'T-CAB1-X', montanteId: 'CAB-1', jusanteId: 'X', comprimentoM: 100, cotaFundoMontante: 100, cotaFundoJusante: 90 },
      { id: 't_x_jus1', nome: 'T-X-JUS1', montanteId: 'X', jusanteId: 'JUS - 1', comprimentoM: 100, cotaFundoMontante: 89, cotaFundoJusante: 80 },
      { id: 't_cab2_x', nome: 'T-CAB2-X', montanteId: 'CAB-2', jusanteId: 'X', comprimentoM: 30, cotaFundoMontante: 95, cotaFundoJusante: 93 },
      {
        id: 't_mesmo_grupo',
        nome: 'T-MESMO-GRUPO',
        montanteId: 'MESMO-GRUPO',
        jusanteId: 'JUS - 1',
        comprimentoM: 20,
        cotaFundoMontante: 85,
        cotaFundoJusante: 80,
      },
      {
        id: 't_longe',
        nome: 'T-LONGE',
        montanteId: 'LONGE',
        jusanteId: 'JUS - 1b',
        comprimentoM: 100,
        cotaFundoMontante: 50,
        cotaFundoJusante: 40,
      },
    ]
    const redePorTrecho = new Map([
      ['t_cab1_x', 1],
      ['t_x_jus1', 1],
      ['t_cab2_x', 2],
      ['t_mesmo_grupo', 1],
      ['t_longe', 4],
    ])
    const redesQueDesaguamPorCaixa = new Map([['X', [2]]])
    const vazaoPorTrecho = new Map([
      ['t_cab1_x', 0.11],
      ['t_x_jus1', 0.12],
      ['t_cab2_x', 0.01], // tributário pequeno -- dificilmente melhora o desbalanceamento contra JUS-2 (sem saída própria aqui)
      ['t_mesmo_grupo', 0.01],
      ['t_longe', 0.01],
    ])
    const caPorTrecho = new Map<string, number>()

    const { confluenciasSuspeitas } = avaliarBalanceamentoRede(
      caixas,
      trechos,
      redePorTrecho,
      redesQueDesaguamPorCaixa,
      vazaoPorTrecho,
      caPorTrecho
    )

    expect(confluenciasSuspeitas).toHaveLength(1)
    const idsCandidatos = confluenciasSuspeitas[0].candidatos.map((c) => c.caixaDestinoId)
    expect(idsCandidatos).not.toContain('MESMO-GRUPO')
    expect(idsCandidatos).not.toContain('MORRO-ACIMA')
    expect(idsCandidatos).not.toContain('LONGE')
  })

  it('ignora confluência com degrau abaixo do mínimo configurado', () => {
    const caixas = [caixa('CAB-1', 0, 0, 100), caixa('X', 0, -100, 90), caixa('JUS - 1', 0, -200, 80), caixa('CAB-2', 100, -80, 95)]
    const trechos: TrechoBalanceamento[] = [
      { id: 't_cab1_x', nome: 'T-CAB1-X', montanteId: 'CAB-1', jusanteId: 'X', comprimentoM: 100, cotaFundoMontante: 100, cotaFundoJusante: 90 },
      { id: 't_x_jus1', nome: 'T-X-JUS1', montanteId: 'X', jusanteId: 'JUS - 1', comprimentoM: 100, cotaFundoMontante: 89.95, cotaFundoJusante: 80 },
      {
        id: 't_cab2_x',
        nome: 'T-CAB2-X',
        montanteId: 'CAB-2',
        jusanteId: 'X',
        comprimentoM: 30,
        cotaFundoMontante: 95,
        cotaFundoJusante: 90, // degrau de só 0.05 m contra a saída principal -- abaixo do default (0.15)
      },
    ]
    const redePorTrecho = new Map([
      ['t_cab1_x', 1],
      ['t_x_jus1', 1],
      ['t_cab2_x', 2],
    ])
    const redesQueDesaguamPorCaixa = new Map([['X', [2]]])
    const vazaoPorTrecho = new Map([
      ['t_cab1_x', 0.1],
      ['t_x_jus1', 0.11],
      ['t_cab2_x', 0.01],
    ])
    const { confluenciasSuspeitas } = avaliarBalanceamentoRede(
      caixas,
      trechos,
      redePorTrecho,
      redesQueDesaguamPorCaixa,
      vazaoPorTrecho,
      new Map()
    )
    expect(confluenciasSuspeitas).toEqual([])
  })
})
