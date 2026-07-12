import type { ResultadoImportLandXml } from '../engine/landxml'
import { supabase } from './supabase'

export interface CaixaRecord {
  id: string
  obra_id: string
  nome: string
  tipo: string
  x: number | null
  y: number | null
  cota_terreno: number | null
  cota_fundo: number | null
  origem: string
}

export interface TrechoRecord {
  id: string
  obra_id: string
  nome: string
  caixa_montante_id: string
  caixa_jusante_id: string
  comprimento_m: number
  diametro_m: number
  declividade_m_m: number
  material: string | null
  manning_n: number | null
  manning_n_origem: string
  cota_topo_montante: number | null
  cota_fundo_montante: number | null
  cota_topo_jusante: number | null
  cota_fundo_jusante: number | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listCaixas(obraId: string): Promise<CaixaRecord[]> {
  const { data, error } = await requireSupabase().from('caixas').select('*').eq('obra_id', obraId).order('nome')
  if (error) throw error
  return data as CaixaRecord[]
}

export async function listTrechos(obraId: string): Promise<TrechoRecord[]> {
  const { data, error } = await requireSupabase().from('trechos').select('*').eq('obra_id', obraId).order('nome')
  if (error) throw error
  return data as TrechoRecord[]
}

export async function updateTrechoManning(id: string, manningN: number): Promise<void> {
  const { error } = await requireSupabase()
    .from('trechos')
    .update({ manning_n: manningN, manning_n_origem: 'manual' })
    .eq('id', id)
  if (error) throw error
}

/**
 * Grava o resultado de parseLandXml: insere as caixas primeiro, depois
 * resolve os nomes montante/jusante dos trechos para os ids recém-criados.
 * Caixas já existentes na obra (mesmo nome) são reaproveitadas.
 */
export async function importarRedeLandXml(obraId: string, resultado: ResultadoImportLandXml): Promise<void> {
  const client = requireSupabase()

  const existentes = await listCaixas(obraId)
  const idPorNome = new Map(existentes.map((c) => [c.nome, c.id]))

  const novasCaixas = resultado.caixas.filter((c) => !idPorNome.has(c.nome))
  if (novasCaixas.length > 0) {
    const { data, error } = await client
      .from('caixas')
      .insert(
        novasCaixas.map((c) => ({
          obra_id: obraId,
          nome: c.nome,
          tipo: c.tipo,
          x: c.x ?? null,
          y: c.y ?? null,
          cota_terreno: c.cotaTerreno ?? null,
          cota_fundo: c.cotaFundo ?? null,
          origem: 'landxml',
        }))
      )
      .select()
    if (error) throw error
    for (const row of data as CaixaRecord[]) idPorNome.set(row.nome, row.id)
  }

  const trechosParaInserir = resultado.trechos
    .filter((t) => idPorNome.has(t.caixaMontanteNome) && idPorNome.has(t.caixaJusanteNome))
    .map((t) => ({
      obra_id: obraId,
      nome: t.nome,
      caixa_montante_id: idPorNome.get(t.caixaMontanteNome),
      caixa_jusante_id: idPorNome.get(t.caixaJusanteNome),
      comprimento_m: t.comprimentoM,
      diametro_m: t.diametroM,
      declividade_m_m: t.declividadeMM,
      material: t.material ?? null,
      manning_n: t.manningN,
      manning_n_origem: t.manningNOrigem,
      cota_topo_montante: t.cotaTopoMontante ?? null,
      cota_fundo_montante: t.cotaFundoMontante ?? null,
      cota_topo_jusante: t.cotaTopoJusante ?? null,
      cota_fundo_jusante: t.cotaFundoJusante ?? null,
    }))

  if (trechosParaInserir.length > 0) {
    const { error } = await client.from('trechos').insert(trechosParaInserir)
    if (error) throw error
  }
}
