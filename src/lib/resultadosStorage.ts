import { supabase } from './supabase'

export interface ResultadoSarjetaRecord {
  id: string
  obra_id: string
  nome_via: string
  y0_m: number
  z: number | null // obsoleto — ver 003_sarjeta_manning_completo.sql
  largura_sarjeta_m: number | null
  declividade_transversal_via_m_m: number | null
  declividade_transversal_sarjeta_m_m: number | null
  declividade_longitudinal: number
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
  created_at: string
}

export interface ResultadoRedeRecord {
  id: string
  trecho_id: string
  q_entrada_m3s: number | null
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

export async function listResultadosSarjeta(obraId: string): Promise<ResultadoSarjetaRecord[]> {
  const { data, error } = await requireSupabase()
    .from('resultados_sarjeta')
    .select('*')
    .eq('obra_id', obraId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as ResultadoSarjetaRecord[]
}

export async function saveResultadoRede(input: Omit<ResultadoRedeRecord, 'id'>): Promise<ResultadoRedeRecord> {
  const { data, error } = await requireSupabase().from('resultados_rede').insert(input).select().single()
  if (error) throw error
  return data as ResultadoRedeRecord
}

export async function listResultadosRedeByObra(
  obraId: string
): Promise<(ResultadoRedeRecord & { trecho_nome: string })[]> {
  const { data, error } = await requireSupabase()
    .from('resultados_rede')
    .select('*, trechos!inner(nome, obra_id)')
    .eq('trechos.obra_id', obraId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as Array<ResultadoRedeRecord & { trechos: { nome: string } }>).map((r) => ({
    ...r,
    trecho_nome: r.trechos.nome,
  }))
}
