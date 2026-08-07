import { supabase } from './supabase'

export interface RevisaoRecord {
  id: string
  projeto_id: string | null
  nome: string
  descricao: string | null
  equacao_idf_id: string | null
  tempo_retorno_anos: number | null
  /** Critérios de conformidade da rede pluvial (y/D, velocidade, declividade, diâmetro mínimo
   * por categoria, escopo do EGL) -- vinculados à revisão, então todo estudo desta versão adota
   * os mesmos valores. Null nas revisões criadas antes da migração 025 (cai pro padrão do
   * sistema, ver DEFAULT_LIMITES em RedePluvialPage.tsx). */
  criterio_limite_yd: number | null
  criterio_vel_min_ms: number | null
  criterio_vel_max_ms: number | null
  criterio_decl_min_mm: number | null
  criterio_decl_max_mm: number | null
  criterio_diametro_min_tronco_m: number | null
  criterio_diametro_min_ramal_m: number | null
  criterio_energia_so_tronco: boolean | null
  /** Mínimo de recobrimento (m) usado pelo alerta/correção de recobrimento insuficiente da tela
   * Rede Pluvial -- ver migração 026_criterio_recobrimento_minimo.sql. */
  criterio_recobrimento_minimo_m: number | null
  created_at: string
}

/** Revisão com o nome do projeto já resolvido — usada no seletor do cabeçalho, agrupado por projeto. */
export interface RevisaoComProjeto extends RevisaoRecord {
  projeto_nome: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listRevisoesPorProjeto(projetoId: string): Promise<RevisaoRecord[]> {
  const { data, error } = await requireSupabase()
    .from('revisoes')
    .select('*')
    .eq('projeto_id', projetoId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as RevisaoRecord[]
}

/** Todas as revisões de todos os projetos, com o nome do projeto — pro seletor global do cabeçalho. */
export async function listTodasRevisoes(): Promise<RevisaoComProjeto[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('revisoes')
    .select('*, projetos(nome)')
    .order('created_at', { ascending: false })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({ ...r, projeto_nome: r.projetos?.nome ?? null }))
}

export async function getRevisao(id: string): Promise<RevisaoRecord> {
  const { data, error } = await requireSupabase().from('revisoes').select('*').eq('id', id).single()
  if (error) throw error
  return data as RevisaoRecord
}

export async function createRevisao(input: {
  projetoId: string
  nome: string
  descricao?: string | null
  equacaoIdfId?: string | null
  tempoRetornoAnos?: number
}): Promise<RevisaoRecord> {
  const { data, error } = await requireSupabase()
    .from('revisoes')
    .insert({
      projeto_id: input.projetoId,
      nome: input.nome,
      descricao: input.descricao ?? null,
      equacao_idf_id: input.equacaoIdfId ?? null,
      tempo_retorno_anos: input.tempoRetornoAnos ?? 10,
    })
    .select()
    .single()
  if (error) throw error
  return data as RevisaoRecord
}

export async function updateRevisao(
  id: string,
  input: Partial<{ nome: string; descricao: string | null; equacaoIdfId: string | null; tempoRetornoAnos: number }>
): Promise<void> {
  const patch: Record<string, unknown> = {}
  if (input.nome !== undefined) patch.nome = input.nome
  if (input.descricao !== undefined) patch.descricao = input.descricao
  if (input.equacaoIdfId !== undefined) patch.equacao_idf_id = input.equacaoIdfId
  if (input.tempoRetornoAnos !== undefined) patch.tempo_retorno_anos = input.tempoRetornoAnos

  const { error } = await requireSupabase().from('revisoes').update(patch).eq('id', id)
  if (error) throw error
}

export interface CriteriosConformidade {
  limiteYD: number
  velMinMs: number
  velMaxMs: number
  declMinMM: number
  declMaxMM: number
  diametroMinTroncoM: number
  diametroMinRamalM: number
  energiaSoTronco: boolean
  recobrimentoMinimoM: number
}

/** Persiste os critérios de conformidade da rede pluvial na própria revisão -- ver
 * migração 025_criterios_conformidade.sql e 026_criterio_recobrimento_minimo.sql. */
export async function updateCriteriosConformidade(id: string, criterios: CriteriosConformidade): Promise<void> {
  const { error } = await requireSupabase()
    .from('revisoes')
    .update({
      criterio_limite_yd: criterios.limiteYD,
      criterio_vel_min_ms: criterios.velMinMs,
      criterio_vel_max_ms: criterios.velMaxMs,
      criterio_decl_min_mm: criterios.declMinMM,
      criterio_decl_max_mm: criterios.declMaxMM,
      criterio_diametro_min_tronco_m: criterios.diametroMinTroncoM,
      criterio_diametro_min_ramal_m: criterios.diametroMinRamalM,
      criterio_energia_so_tronco: criterios.energiaSoTronco,
      criterio_recobrimento_minimo_m: criterios.recobrimentoMinimoM,
    })
    .eq('id', id)
  if (error) throw error
}

export async function deleteRevisao(id: string): Promise<void> {
  const { error } = await requireSupabase().from('revisoes').delete().eq('id', id)
  if (error) throw error
}
