import type { OrigemPercentual } from '../engine/types'
import { supabase } from './supabase'

export interface CaptacaoRecord {
  id: string
  bacia_id: string
  dispositivo_id: string
  percentual: number
  origem: OrigemPercentual
  atualizado_em: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

/** Todas as captações das bacias de uma revisão — via join em bacias(revisao_id). */
export async function listCaptacoesPorRevisao(revisaoId: string): Promise<CaptacaoRecord[]> {
  const { data, error } = await requireSupabase()
    .from('bacia_dispositivo')
    .select('*, bacias!inner(revisao_id)')
    .eq('bacias.revisao_id', revisaoId)
  if (error) throw error
  return (data as Array<CaptacaoRecord & { bacias: unknown }>).map(({ bacias: _bacias, ...rest }) => rest)
}

export async function listCaptacoesPorBacia(baciaId: string): Promise<CaptacaoRecord[]> {
  const { data, error } = await requireSupabase().from('bacia_dispositivo').select('*').eq('bacia_id', baciaId)
  if (error) throw error
  return data as CaptacaoRecord[]
}

/**
 * Cria ou atualiza o percentual de captação de um dispositivo sobre uma
 * bacia. A constraint `unique(bacia_id, dispositivo_id)` do banco garante
 * upsert idempotente; o trigger `trg_check_percentual_bacia` rejeita se a
 * soma da bacia passar de 100% (ver 009_bacia_dispositivo_rateio.sql).
 */
export async function upsertCaptacao(
  baciaId: string,
  dispositivoId: string,
  percentual: number,
  origem: OrigemPercentual
): Promise<CaptacaoRecord> {
  const { data, error } = await requireSupabase()
    .from('bacia_dispositivo')
    .upsert(
      { bacia_id: baciaId, dispositivo_id: dispositivoId, percentual, origem, atualizado_em: new Date().toISOString() },
      { onConflict: 'bacia_id,dispositivo_id' }
    )
    .select()
    .single()
  if (error) throw error
  return data as CaptacaoRecord
}

export async function deleteCaptacao(id: string): Promise<void> {
  const { error } = await requireSupabase().from('bacia_dispositivo').delete().eq('id', id)
  if (error) throw error
}
