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
