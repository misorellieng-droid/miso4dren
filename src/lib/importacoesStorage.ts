import { supabase } from './supabase'

export type TipoImportacao = 'rede_landxml' | 'bacias_parcel_landxml' | 'bacias_csv' | 'bacia_dispositivo_planilha'

export interface ImportacaoRecord {
  id: string
  revisao_id: string
  tipo: TipoImportacao
  nome_arquivo: string | null
  resumo: string
  criado_em: string
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listImportacoes(revisaoId: string): Promise<ImportacaoRecord[]> {
  const { data, error } = await requireSupabase()
    .from('importacoes')
    .select('*')
    .eq('revisao_id', revisaoId)
    .order('criado_em', { ascending: false })
  if (error) throw error
  return data as ImportacaoRecord[]
}

/** Cria o registro do lote — chamar antes de gravar as linhas importadas, pra poder marcar cada uma com o importacao_id. */
export async function criarImportacao(
  revisaoId: string,
  tipo: TipoImportacao,
  nomeArquivo: string | null,
  resumo: string
): Promise<string> {
  const { data, error } = await requireSupabase()
    .from('importacoes')
    .insert({ revisao_id: revisaoId, tipo, nome_arquivo: nomeArquivo, resumo })
    .select()
    .single()
  if (error) throw error
  return (data as ImportacaoRecord).id
}

/**
 * Exclui um lote de importação inteiro, em ordem explícita (resultados_rede
 * -> trechos -> caixas -> bacias -> o próprio lote) — se algo desse lote foi
 * referenciado por uma importação/edição posterior (ex.: um trecho novo
 * ligado numa caixa antiga), a exclusão falha com erro de chave estrangeira
 * em vez de cascatear silenciosamente e corromper a outra importação.
 */
export async function excluirImportacao(importacaoId: string): Promise<void> {
  const client = requireSupabase()

  const { data: trechosDoLote, error: errTrechos } = await client.from('trechos').select('id').eq('importacao_id', importacaoId)
  if (errTrechos) throw errTrechos
  const trechoIds = (trechosDoLote ?? []).map((t: { id: string }) => t.id)

  if (trechoIds.length > 0) {
    const { error: errResultados } = await client.from('resultados_rede').delete().in('trecho_id', trechoIds)
    if (errResultados) throw errResultados
    const { error: errDelTrechos } = await client.from('trechos').delete().eq('importacao_id', importacaoId)
    if (errDelTrechos) throw errDelTrechos
  }

  const { error: errDelCaixas } = await client.from('caixas').delete().eq('importacao_id', importacaoId)
  if (errDelCaixas) throw errDelCaixas

  const { error: errDelBacias } = await client.from('bacias').delete().eq('importacao_id', importacaoId)
  if (errDelBacias) throw errDelBacias

  const { error: errDelImportacao } = await client.from('importacoes').delete().eq('id', importacaoId)
  if (errDelImportacao) throw errDelImportacao
}
