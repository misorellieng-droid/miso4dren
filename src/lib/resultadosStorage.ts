import { supabase } from './supabase'

export interface ResultadoSarjetaRecord {
  id: string
  revisao_id: string
  nome_via: string
  tipo_secao: string // 'triangular' | 'triangular_simetrica'
  y0_m: number
  z: number | null // obsoleto — ver 003_sarjeta_manning_completo.sql
  largura_sarjeta_m: number | null
  declividade_transversal_via_m_m: number | null
  declividade_transversal_sarjeta_m_m: number | null
  declividade_longitudinal: number
  declividade_calculada_por_velocidade: boolean
  modo_declividade: string // 'informada' | 'velocidade_minima' | 'desnivel_fixo'
  velocidade_minima_ms: number | null
  desnivel_m: number | null
  declividade_transversal_min_m_m: number | null
  coef_c: number
  largura_impluvio_m: number
  manning_n: number
  intensidade_mm_h: number
  area_molhada_m2: number | null
  perimetro_molhado_m: number | null
  raio_hidraulico_m: number | null
  velocidade_ms: number | null
  vazao_m3s: number | null
  comprimento_critico_m: number | null
  tc_min: number | null
  arquivado: boolean
  created_at: string
}

/** Registro arquivado com o nome do projeto/revisão já resolvidos — pra listagem global fora do contexto de uma revisão. */
export interface ResultadoSarjetaArquivadoRecord extends ResultadoSarjetaRecord {
  revisao_nome: string
  projeto_nome: string | null
}

export interface ResultadoRedeRecord {
  id: string
  trecho_id: string
  q_entrada_m3s: number | null
  ca_acumulado: number | null
  q_projeto_m3s: number | null
  tc_sistema_min: number | null
  intensidade_mm_h: number | null
  lamina_m: number | null
  y_sobre_d_pct: number | null
  raio_hidraulico_m: number | null
  velocidade_ms: number | null
  vazao_calculada_m3s: number | null
  conforme: boolean | null
  motivo_nao_conformidade: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function saveResultadoSarjeta(input: Omit<ResultadoSarjetaRecord, 'id' | 'created_at'>): Promise<ResultadoSarjetaRecord> {
  const { data, error } = await requireSupabase().from('resultados_sarjeta').insert(input).select().single()
  if (error) throw error
  return data as ResultadoSarjetaRecord
}

export async function listResultadosSarjeta(revisaoId: string): Promise<ResultadoSarjetaRecord[]> {
  const { data, error } = await requireSupabase()
    .from('resultados_sarjeta')
    .select('*')
    .eq('revisao_id', revisaoId)
    .eq('arquivado', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ResultadoSarjetaRecord[]
}

export async function arquivarResultadoSarjeta(id: string, arquivado: boolean): Promise<void> {
  const { error } = await requireSupabase().from('resultados_sarjeta').update({ arquivado }).eq('id', id)
  if (error) throw error
}

/** Todos os registros arquivados de todos os projetos/revisões — pra página global "Arquivo". */
export async function listResultadosSarjetaArquivados(): Promise<ResultadoSarjetaArquivadoRecord[]> {
  const { data, error } = await requireSupabase()
    .from('resultados_sarjeta')
    .select('*, revisoes(nome, projetos(nome))')
    .eq('arquivado', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    ...r,
    revisao_nome: r.revisoes?.nome ?? '—',
    projeto_nome: r.revisoes?.projetos?.nome ?? null,
  }))
}

/** Upsert por trecho_id (precisa da constraint unique de 024_dedupe_resultados_rede.sql) --
 * defesa extra contra duplicata além do delete-antes-de-inserir em deleteResultadosRedeByTrechoIds
 * e do lock de serialização em RedePluvialPage.tsx: mesmo que as duas escapem (ex.: corrida
 * entre duas chamadas concorrentes), uma segunda gravação do mesmo trecho SUBSTITUI a primeira
 * em vez de criar uma segunda linha. */
export async function saveResultadoRede(input: Omit<ResultadoRedeRecord, 'id'>): Promise<ResultadoRedeRecord> {
  const { data, error } = await requireSupabase().from('resultados_rede').upsert(input, { onConflict: 'trecho_id' }).select().single()
  if (error) throw error
  return data as ResultadoRedeRecord
}

/** Remove resultados anteriores desses trechos antes de gravar um novo cálculo —
 * sem isso, cada "Rodar cálculo" apenas acumula linhas em cima das rodadas anteriores. */
export async function deleteResultadosRedeByTrechoIds(trechoIds: string[]): Promise<void> {
  if (trechoIds.length === 0) return
  const { error } = await requireSupabase().from('resultados_rede').delete().in('trecho_id', trechoIds)
  if (error) throw error
}

export async function listResultadosRedeByRevisao(
  revisaoId: string
): Promise<(ResultadoRedeRecord & { trecho_nome: string })[]> {
  const { data, error } = await requireSupabase()
    .from('resultados_rede')
    .select('*, trechos!inner(nome, revisao_id)')
    .eq('trechos.revisao_id', revisaoId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Array<ResultadoRedeRecord & { trechos: { nome: string } }>).map((r) => ({
    ...r,
    trecho_nome: r.trechos.nome,
  }))
}
