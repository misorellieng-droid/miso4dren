import type { CaixaRecord, TrechoRecord } from '../lib/redeStorage'
import type { CaixaImportada, ResultadoImportLandXml, TrechoImportado } from './landxml'

// Tolerâncias pra não acusar "alterado" por ruído de arredondamento entre
// exports sucessivos do Civil 3D (conversão de unidade, ponto flutuante).
const EPS_COORD = 0.01 // m
const EPS_COTA = 0.005 // m
const EPS_DIAM = 0.001 // m
const EPS_DECL = 0.0001 // m/m
const EPS_COMPRIMENTO = 0.01 // m
const EPS_MANNING = 0.0005

function diferente(a: number | null | undefined, b: number | null | undefined, eps: number): boolean {
  if (a == null && b == null) return false
  if (a == null || b == null) return true
  return Math.abs(a - b) > eps
}

export interface DiffCaixa {
  nome: string
  status: 'nova' | 'alterada' | 'igual'
  camposAlterados: string[]
  atual: CaixaRecord | null
  novo: CaixaImportada
}

export interface DiffTrecho {
  nome: string
  status: 'novo' | 'alterado' | 'igual'
  camposAlterados: string[]
  ligacaoAlterada: boolean
  /** true quando a caixa montante ou jusante referenciada pelo XML não existe nem no banco nem no próprio XML — o trecho não pode ser gravado. */
  semCaixaResolvivel: boolean
  atual: TrechoRecord | null
  novo: TrechoImportado
}

export interface DiffImportacao {
  caixas: DiffCaixa[]
  trechos: DiffTrecho[]
}

/**
 * Compara o resultado de um novo parse de LandXML contra as caixas/trechos já
 * salvos na revisão (casando por `nome`, que é o identificador estável do
 * Civil 3D) — usado pra reimportar um XML atualizado sem duplicar tudo ou
 * perder edições manuais silenciosamente.
 */
export function compararImportacao(
  resultado: ResultadoImportLandXml,
  caixasExistentes: CaixaRecord[],
  trechosExistentes: TrechoRecord[]
): DiffImportacao {
  const caixaPorNome = new Map(caixasExistentes.map((c) => [c.nome, c]))
  const trechoPorNome = new Map(trechosExistentes.map((t) => [t.nome, t]))
  const nomeCaixaPorId = new Map(caixasExistentes.map((c) => [c.id, c.nome]))
  const nomesCaixasNoXml = new Set(resultado.caixas.map((c) => c.nome))

  const caixas: DiffCaixa[] = resultado.caixas.map((novo) => {
    const atual = caixaPorNome.get(novo.nome) ?? null
    if (!atual) {
      return { nome: novo.nome, status: 'nova', camposAlterados: [], atual: null, novo }
    }
    const campos: string[] = []
    if (atual.tipo !== novo.tipo) campos.push('tipo')
    if (diferente(atual.x, novo.x ?? null, EPS_COORD)) campos.push('x')
    if (diferente(atual.y, novo.y ?? null, EPS_COORD)) campos.push('y')
    if (diferente(atual.cota_terreno, novo.cotaTerreno ?? null, EPS_COTA)) campos.push('cota do terreno')
    if (diferente(atual.cota_fundo, novo.cotaFundo ?? null, EPS_COTA)) campos.push('cota de fundo')
    return { nome: novo.nome, status: campos.length > 0 ? 'alterada' : 'igual', camposAlterados: campos, atual, novo }
  })

  const trechos: DiffTrecho[] = resultado.trechos.map((novo) => {
    const semCaixaResolvivel =
      (!nomesCaixasNoXml.has(novo.caixaMontanteNome) && !caixaPorNome.has(novo.caixaMontanteNome)) ||
      (!nomesCaixasNoXml.has(novo.caixaJusanteNome) && !caixaPorNome.has(novo.caixaJusanteNome))

    const atual = trechoPorNome.get(novo.nome) ?? null
    if (!atual) {
      return { nome: novo.nome, status: 'novo', camposAlterados: [], ligacaoAlterada: false, semCaixaResolvivel, atual: null, novo }
    }

    const campos: string[] = []
    const nomeMontanteAtual = nomeCaixaPorId.get(atual.caixa_montante_id)
    const nomeJusanteAtual = nomeCaixaPorId.get(atual.caixa_jusante_id)
    const ligacaoAlterada = nomeMontanteAtual !== novo.caixaMontanteNome || nomeJusanteAtual !== novo.caixaJusanteNome
    if (ligacaoAlterada) campos.push('ligação (caixa montante/jusante)')
    if (diferente(atual.comprimento_m, novo.comprimentoM, EPS_COMPRIMENTO)) campos.push('comprimento')
    if (diferente(atual.diametro_m, novo.diametroM, EPS_DIAM)) campos.push('diâmetro')
    if (diferente(atual.declividade_m_m, novo.declividadeMM, EPS_DECL)) campos.push('declividade')
    if ((atual.material ?? '') !== (novo.material ?? '')) campos.push('material')
    if (atual.manning_n_origem !== 'manual' && diferente(atual.manning_n, novo.manningN, EPS_MANNING)) campos.push('manning n')
    if (diferente(atual.cota_fundo_montante, novo.cotaFundoMontante ?? null, EPS_COTA)) campos.push('cota de fundo montante')
    if (diferente(atual.cota_fundo_jusante, novo.cotaFundoJusante ?? null, EPS_COTA)) campos.push('cota de fundo jusante')

    return {
      nome: novo.nome,
      status: campos.length > 0 ? 'alterado' : 'igual',
      camposAlterados: campos,
      ligacaoAlterada,
      semCaixaResolvivel,
      atual,
      novo,
    }
  })

  return { caixas, trechos }
}

export function resumoDiff(diff: DiffImportacao) {
  return {
    caixasNovas: diff.caixas.filter((c) => c.status === 'nova').length,
    caixasAlteradas: diff.caixas.filter((c) => c.status === 'alterada').length,
    caixasIguais: diff.caixas.filter((c) => c.status === 'igual').length,
    trechosNovos: diff.trechos.filter((t) => t.status === 'novo').length,
    trechosAlterados: diff.trechos.filter((t) => t.status === 'alterado').length,
    trechosIguais: diff.trechos.filter((t) => t.status === 'igual').length,
  }
}

/** true quando existe pelo menos uma caixa ou trecho novo ou alterado — se tudo for igual, reimportar não faz nada. */
export function temMudancas(diff: DiffImportacao): boolean {
  return diff.caixas.some((c) => c.status !== 'igual') || diff.trechos.some((t) => t.status !== 'igual')
}
