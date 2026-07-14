import { supabase } from './supabase'

export interface ResultadoSarjetaoRecord {
  id: string
  revisao_id: string
  nome_trecho: string

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

  m1_comprimento_m: number
  m1_iteracoes: number
  m1_convergiu: boolean
  m1_iteracoes_tc: number
  m1_convergiu_tc: boolean
  m1_lamina_critica_m: number
  m1_velocidade_ms: number
  m1_vazao_m3s: number
  m1_declividade_longitudinal_m_m: number
  m1_tc_convergido_min: number
  m1_intensidade_mm_h: number

  m2_comprimento_m: number
  m2_iteracoes: number
  m2_convergiu: boolean
  m2_iteracoes_tc: number
  m2_convergiu_tc: boolean
  m2_lamina_critica_m: number
  m2_velocidade_ms: number
  m2_vazao_m3s: number
  m2_declividade_longitudinal_m_m: number
  m2_tc_convergido_min: number
  m2_intensidade_mm_h: number

  diferenca_percentual: number
  comprimento_recomendado_m: number
  metodo_recomendado: string

  created_at: string
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
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ResultadoSarjetaoRecord[]
}
