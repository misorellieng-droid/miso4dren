import type { CenarioEspraiamento, TipoSecaoSarjetao } from '../engine/sarjetao'
import { supabase } from './supabase'

export interface ResultadoSarjetaoRecord {
  id: string
  revisao_id: string
  nome_trecho: string
  tipo_secao: TipoSecaoSarjetao
  cenario_espraiamento: CenarioEspraiamento

  largura_via_m: number
  coef_c: number
  telhado_ativo: boolean
  largura_telhado_m: number | null
  coef_c_telhado: number | null

  largura_sarjetao_m: number
  sx_sarjetao_alto_m_m: number
  sx_sarjetao_baixo_m_m: number

  lamina_max_m: number
  sx_pista_m_m: number
  espraiamento_m: number
  espraiamento_editado: boolean
  manning_n: number

  tempo_retorno_anos: number
  tc_inicial_min: number

  delta_h_m: number

  comprimento_m: number
  iteracoes: number
  convergiu: boolean
  iteracoes_tc: number
  convergiu_tc: boolean
  lamina_critica_m: number
  velocidade_ms: number
  vazao_m3s: number
  declividade_longitudinal_m_m: number
  tc_convergido_min: number
  intensidade_mm_h: number

  arquivado: boolean
  created_at: string
}

/** Registro arquivado com o nome do projeto/revisão já resolvidos — pra listagem global fora do contexto de uma revisão. */
export interface ResultadoSarjetaoArquivadoRecord extends ResultadoSarjetaoRecord {
  revisao_nome: string
  projeto_nome: string | null
  equacao_idf_id: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function saveResultadoSarjetao(
  input: Omit<ResultadoSarjetaoRecord, 'id' | 'created_at'>
): Promise<ResultadoSarjetaoRecord> {
  const { data, error } = await requireSupabase().from('resultados_sarjetao_dente_serra').insert(input).select().single()
  if (error) throw error
  return data as ResultadoSarjetaoRecord
}

export async function listResultadosSarjetao(revisaoId: string): Promise<ResultadoSarjetaoRecord[]> {
  const { data, error } = await requireSupabase()
    .from('resultados_sarjetao_dente_serra')
    .select('*')
    .eq('revisao_id', revisaoId)
    .eq('arquivado', false)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ResultadoSarjetaoRecord[]
}

export async function arquivarResultadoSarjetao(id: string, arquivado: boolean): Promise<void> {
  const { error } = await requireSupabase().from('resultados_sarjetao_dente_serra').update({ arquivado }).eq('id', id)
  if (error) throw error
}

/** Todos os registros arquivados de todos os projetos/revisões — pra página global "Arquivo". */
export async function listResultadosSarjetaoArquivados(): Promise<ResultadoSarjetaoArquivadoRecord[]> {
  const { data, error } = await requireSupabase()
    .from('resultados_sarjetao_dente_serra')
    .select('*, revisoes(nome, equacao_idf_id, projetos(nome))')
    .eq('arquivado', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((r) => ({
    ...r,
    revisao_nome: r.revisoes?.nome ?? '—',
    projeto_nome: r.revisoes?.projetos?.nome ?? null,
    equacao_idf_id: r.revisoes?.equacao_idf_id ?? null,
  }))
}
