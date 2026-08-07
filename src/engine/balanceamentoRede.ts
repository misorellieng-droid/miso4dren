import { ehCaixaDestinoExterno } from './rede'

export interface CaixaBalanceamento {
  id: string
  nome: string
  x: number | null
  y: number | null
  cotaFundo: number | null
}

export interface TrechoBalanceamento {
  id: string
  nome: string
  montanteId: string
  jusanteId: string
  comprimentoM: number
  cotaFundoMontante: number | null
  cotaFundoJusante: number | null
}

export interface SaidaFinalSistema {
  trechoId: string
  nomeTrecho: string
  caixaJusId: string
  nomeCaixaJus: string
  sistema: number | undefined
  vazaoM3s: number
  caAcumuladoM2: number
}

export interface CandidatoRealocacao {
  caixaDestinoId: string
  nomeCaixaDestino: string
  grupoDestinoId: string
  nomeGrupoDestino: string
  distanciaM: number
  declividadeNecessariaMM: number
  vazaoGrupoAtualM3s: number
  vazaoGrupoDestinoM3s: number
  desbalanceamentoAtualM3s: number
  desbalanceamentoProjetadoM3s: number
}

export interface ConfluenciaSuspeita {
  caixaId: string
  nomeCaixa: string
  trechoTributarioId: string
  nomeTrechoTributario: string
  sistemaTributario: number
  sistemaPrincipal: number | undefined
  degrauM: number
  vazaoTributariaM3s: number
  grupoAtualId: string
  candidatos: CandidatoRealocacao[]
}

export interface ResultadoBalanceamento {
  saidasFinais: SaidaFinalSistema[]
  confluenciasSuspeitas: ConfluenciaSuspeita[]
}

export interface OpcoesBalanceamento {
  /** Raio de busca (m, distância em linha reta) por caixas de outro grupo que poderiam receber
   * o ramal tributário -- não é uma rota executável, é só um filtro pra não sugerir religar em
   * algo do outro lado do terreno. Default 150 m (escala de quadra urbana). */
  raioBuscaM?: number
  /** Declividade mínima (m/m) que a ligação até o candidato precisaria ter pra ser fisicamente
   * plausível (morro abaixo, sem precisar aprofundar) -- default 0.004. */
  declividadeMinimaMM?: number
  /** Degrau mínimo (m) pra uma confluência valer a pena aparecer no relatório -- confluências
   * com degrau pequeno já estão razoavelmente eficientes. Default 0.15 m. */
  degrauMinimoM?: number
  /** Quantos candidatos mostrar por confluência, do melhor pro pior. Default 3. */
  maxCandidatosPorConfluencia?: number
}

/**
 * Avalia o balanceamento de carga entre os "braços" da rede -- não redesenha nada nem inventa
 * rota executável (não há modelo de terreno aqui, só coordenadas e cotas já cadastradas). Dois
 * sinais, ambos já calculáveis a partir do que a rede já tem:
 *
 * 1. `saidasFinais`: a vazão total que chega em cada caixa "JUS" (ligação com a rede externa,
 *    ver ehCaixaDestinoExterno) -- comparando entre si, mostra se um lado do projeto está
 *    carregando desproporcionalmente mais água que o outro.
 * 2. `confluenciasSuspeitas`: pontos onde um Sistema deságua no outro (mesma informação de
 *    redesQueDesaguamPorCaixa) com um degrau de cota grande entre a entrada tributária e a
 *    saída principal -- sinal de que aquele não é necessariamente o melhor lugar pra essa
 *    ligação. Pra cada uma, procura caixas de OUTRO "grupo final" (outra saída JUS) dentro de
 *    um raio, morro abaixo (cota compatível com declividade mínima), e projeta o
 *    desbalanceamento resultante SE o tributário fosse religado ali em vez de ficar onde está --
 *    só entram candidatos que de fato melhoram o desbalanceamento entre os dois grupos.
 *
 * Isso é uma SUGESTÃO heurística baseada em distância em linha reta + cota, pra apontar onde vale
 * a pena o engenheiro estudar uma religação manual -- não confirma viabilidade de execução
 * (relevo real, interferências, propriedade) nem substitui conferência no Civil 3D.
 */
export function avaliarBalanceamentoRede(
  caixas: CaixaBalanceamento[],
  trechos: TrechoBalanceamento[],
  redePorTrecho: Map<string, number>,
  redesQueDesaguamPorCaixa: Map<string, number[]>,
  vazaoPorTrecho: Map<string, number>,
  caAcumuladoPorTrecho: Map<string, number>,
  opcoes: OpcoesBalanceamento = {}
): ResultadoBalanceamento {
  const raioBuscaM = opcoes.raioBuscaM ?? 150
  const declividadeMinimaMM = opcoes.declividadeMinimaMM ?? 0.004
  const degrauMinimoM = opcoes.degrauMinimoM ?? 0.15
  const maxCandidatos = opcoes.maxCandidatosPorConfluencia ?? 3

  const caixaPorId = new Map(caixas.map((c) => [c.id, c]))
  const saidaPorCaixa = new Map<string, TrechoBalanceamento>()
  const entradasPorCaixa = new Map<string, TrechoBalanceamento[]>()
  for (const t of trechos) {
    saidaPorCaixa.set(t.montanteId, t)
    if (!entradasPorCaixa.has(t.jusanteId)) entradasPorCaixa.set(t.jusanteId, [])
    entradasPorCaixa.get(t.jusanteId)!.push(t)
  }

  // 1. Saídas finais (caixas JUS) -- vazão total que chega em cada uma.
  const saidasFinais: SaidaFinalSistema[] = []
  for (const t of trechos) {
    const caixaJus = caixaPorId.get(t.jusanteId)
    if (!caixaJus || !ehCaixaDestinoExterno(caixaJus.nome)) continue
    saidasFinais.push({
      trechoId: t.id,
      nomeTrecho: t.nome,
      caixaJusId: t.jusanteId,
      nomeCaixaJus: caixaJus.nome,
      sistema: redePorTrecho.get(t.id),
      vazaoM3s: vazaoPorTrecho.get(t.id) ?? 0,
      caAcumuladoM2: caAcumuladoPorTrecho.get(t.id) ?? 0,
    })
  }
  const vazaoPorGrupo = new Map(saidasFinais.map((s) => [s.caixaJusId, s.vazaoM3s]))

  // Grupo final (id da caixa JUS/terminal alcançada) de cada caixa -- segue a própria saída até
  // achar uma JUS ou um beco sem saída (memoizado, a rede é uma árvore: sem ciclo, no máximo 1
  // saída por caixa).
  const grupoFinalCache = new Map<string, string>()
  const grupoFinal = (caixaId: string): string => {
    if (grupoFinalCache.has(caixaId)) return grupoFinalCache.get(caixaId)!
    grupoFinalCache.set(caixaId, caixaId) // guarda de ciclo (não deveria acontecer, mas evita loop infinito)
    const saida = saidaPorCaixa.get(caixaId)
    if (!saida) return caixaId
    const nomeJusante = caixaPorId.get(saida.jusanteId)?.nome ?? ''
    const resultado = ehCaixaDestinoExterno(nomeJusante) ? saida.jusanteId : grupoFinal(saida.jusanteId)
    grupoFinalCache.set(caixaId, resultado)
    return resultado
  }

  const distanciaM = (a: CaixaBalanceamento, b: CaixaBalanceamento): number | null => {
    if (a.x == null || a.y == null || b.x == null || b.y == null) return null
    return Math.hypot(a.x - b.x, a.y - b.y)
  }

  // 2. Confluências suspeitas (degrau grande numa junção de Sistemas) + candidatos de religação.
  const confluenciasSuspeitas: ConfluenciaSuspeita[] = []
  for (const [caixaId, sistemasTributarios] of redesQueDesaguamPorCaixa) {
    const saida = saidaPorCaixa.get(caixaId)
    if (!saida || saida.cotaFundoMontante == null) continue
    const entradas = entradasPorCaixa.get(caixaId) ?? []
    const caixaAtual = caixaPorId.get(caixaId)
    const grupoAtualId = grupoFinal(caixaId)
    const vazaoGrupoAtual = vazaoPorGrupo.get(grupoAtualId)

    for (const sistemaTributario of sistemasTributarios) {
      const trechoTributario = entradas.find((e) => redePorTrecho.get(e.id) === sistemaTributario)
      if (!trechoTributario || trechoTributario.cotaFundoJusante == null) continue

      const degrauM = trechoTributario.cotaFundoJusante - saida.cotaFundoMontante
      if (degrauM < degrauMinimoM) continue

      const vazaoTributaria = vazaoPorTrecho.get(trechoTributario.id) ?? 0
      const caixaOrigem = caixaPorId.get(caixaId)

      const candidatos: CandidatoRealocacao[] = []
      if (vazaoGrupoAtual != null && caixaOrigem?.x != null && caixaOrigem.y != null) {
        for (const candidato of caixas) {
          if (candidato.id === caixaId || candidato.cotaFundo == null) continue
          const grupoCandidatoId = grupoFinal(candidato.id)
          if (grupoCandidatoId === grupoAtualId) continue // mesmo grupo -- não ajuda a balancear
          const vazaoGrupoDestino = vazaoPorGrupo.get(grupoCandidatoId)
          if (vazaoGrupoDestino == null) continue // grupo sem saída JUS identificada -- não dá pra comparar

          const dist = distanciaM(caixaOrigem, candidato)
          if (dist == null || dist === 0 || dist > raioBuscaM) continue

          const declividadeNecessaria = (trechoTributario.cotaFundoJusante - candidato.cotaFundo) / dist
          if (declividadeNecessaria < declividadeMinimaMM) continue // não dá morro abaixo suficiente

          const desbalanceamentoAtual = Math.abs(vazaoGrupoAtual - vazaoGrupoDestino)
          const desbalanceamentoProjetado = Math.abs(
            vazaoGrupoAtual - vazaoTributaria - (vazaoGrupoDestino + vazaoTributaria)
          )
          if (desbalanceamentoProjetado >= desbalanceamentoAtual) continue // não melhora

          const grupoDestino = caixaPorId.get(grupoCandidatoId)
          candidatos.push({
            caixaDestinoId: candidato.id,
            nomeCaixaDestino: candidato.nome,
            grupoDestinoId: grupoCandidatoId,
            nomeGrupoDestino: grupoDestino?.nome ?? grupoCandidatoId,
            distanciaM: dist,
            declividadeNecessariaMM: declividadeNecessaria,
            vazaoGrupoAtualM3s: vazaoGrupoAtual,
            vazaoGrupoDestinoM3s: vazaoGrupoDestino,
            desbalanceamentoAtualM3s: desbalanceamentoAtual,
            desbalanceamentoProjetadoM3s: desbalanceamentoProjetado,
          })
        }
        candidatos.sort((a, b) => a.desbalanceamentoProjetadoM3s - b.desbalanceamentoProjetadoM3s)
      }

      confluenciasSuspeitas.push({
        caixaId,
        nomeCaixa: caixaAtual?.nome ?? caixaId,
        trechoTributarioId: trechoTributario.id,
        nomeTrechoTributario: trechoTributario.nome,
        sistemaTributario,
        sistemaPrincipal: redePorTrecho.get(saida.id),
        degrauM,
        vazaoTributariaM3s: vazaoTributaria,
        grupoAtualId,
        candidatos: candidatos.slice(0, maxCandidatos),
      })
    }
  }
  confluenciasSuspeitas.sort((a, b) => b.vazaoTributariaM3s - a.vazaoTributariaM3s)

  return { saidasFinais, confluenciasSuspeitas }
}
