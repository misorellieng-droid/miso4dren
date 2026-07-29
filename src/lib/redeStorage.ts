import type { ResultadoImportLandXml } from '../engine/landxml'
import type { DiffImportacao } from '../engine/reimportDiff'
import { supabase } from './supabase'

export interface CaixaRecord {
  id: string
  revisao_id: string
  nome: string
  tipo: string
  x: number | null
  y: number | null
  cota_terreno: number | null
  cota_fundo: number | null
  origem: string
  rede_nome: string | null
  recebe_vazao: boolean
}

export interface TrechoRecord {
  id: string
  revisao_id: string
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
  rede_nome: string | null
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

export async function listCaixas(revisaoId: string): Promise<CaixaRecord[]> {
  const { data, error } = await requireSupabase().from('caixas').select('*').eq('revisao_id', revisaoId).order('nome')
  if (error) throw error
  return data as CaixaRecord[]
}

export async function listTrechos(revisaoId: string): Promise<TrechoRecord[]> {
  const { data, error } = await requireSupabase().from('trechos').select('*').eq('revisao_id', revisaoId).order('nome')
  if (error) throw error
  return data as TrechoRecord[]
}

/** Guarda o texto bruto do LandXML de Pipe Network importado — usado pelo export
 * (landxmlPatch.ts) pra editar só os campos alterados dentro do arquivo original,
 * preservando a geometria da estrutura (CircStruct/RectStruct) que o app não edita
 * mas o Civil 3D exige pra reimportar sem erro. */
export async function salvarXmlOriginal(revisaoId: string, conteudo: string): Promise<void> {
  const { error } = await requireSupabase()
    .from('redes_xml_original')
    .upsert({ revisao_id: revisaoId, conteudo, atualizado_em: new Date().toISOString() })
  if (error) throw error
}

export async function getXmlOriginal(revisaoId: string): Promise<string | null> {
  const { data, error } = await requireSupabase()
    .from('redes_xml_original')
    .select('conteudo')
    .eq('revisao_id', revisaoId)
    .maybeSingle()
  if (error) throw error
  return data?.conteudo ?? null
}

export async function updateTrechoManning(id: string, manningN: number): Promise<void> {
  const { error } = await requireSupabase()
    .from('trechos')
    .update({ manning_n: manningN, manning_n_origem: 'manual' })
    .eq('id', id)
  if (error) throw error
}

export interface CaixaPatch {
  tipo?: string
  x?: number | null
  y?: number | null
  cota_terreno?: number | null
  cota_fundo?: number | null
  recebe_vazao?: boolean
}

export async function updateCaixa(id: string, patch: CaixaPatch): Promise<void> {
  const { error } = await requireSupabase().from('caixas').update(patch).eq('id', id)
  if (error) throw error
}

export async function updateCaixasTipoEmLote(ids: string[], tipo: string): Promise<void> {
  if (ids.length === 0) return
  const { error } = await requireSupabase().from('caixas').update({ tipo }).in('id', ids)
  if (error) throw error
}

export async function updateCaixasRecebeVazaoEmLote(ids: string[], recebeVazao: boolean): Promise<void> {
  if (ids.length === 0) return
  const { error } = await requireSupabase().from('caixas').update({ recebe_vazao: recebeVazao }).in('id', ids)
  if (error) throw error
}

export interface TrechoPatch {
  diametro_m?: number
  declividade_m_m?: number
  material?: string | null
  manning_n?: number
  manning_n_origem?: string
  cota_fundo_montante?: number
  cota_fundo_jusante?: number
  cota_topo_montante?: number
  cota_topo_jusante?: number
}

export async function updateTrecho(id: string, patch: TrechoPatch): Promise<void> {
  const { error } = await requireSupabase().from('trechos').update(patch).eq('id', id)
  if (error) throw error
}

export async function updateTrechosManningEmLote(ids: string[], manningN: number): Promise<void> {
  if (ids.length === 0) return
  const { error } = await requireSupabase()
    .from('trechos')
    .update({ manning_n: manningN, manning_n_origem: 'manual' })
    .in('id', ids)
  if (error) throw error
}

/**
 * Grava o resultado de parseLandXml: insere as caixas primeiro, depois
 * resolve os nomes montante/jusante dos trechos para os ids recém-criados.
 * Caixas já existentes na revisão (mesmo nome) são reaproveitadas.
 */
export async function importarRedeLandXml(revisaoId: string, resultado: ResultadoImportLandXml): Promise<void> {
  const client = requireSupabase()

  const existentes = await listCaixas(revisaoId)
  const idPorNome = new Map(existentes.map((c) => [c.nome, c.id]))

  const novasCaixas = resultado.caixas.filter((c) => !idPorNome.has(c.nome))
  if (novasCaixas.length > 0) {
    const { data, error } = await client
      .from('caixas')
      .insert(
        novasCaixas.map((c) => ({
          revisao_id: revisaoId,
          nome: c.nome,
          tipo: c.tipo,
          x: c.x ?? null,
          y: c.y ?? null,
          cota_terreno: c.cotaTerreno ?? null,
          cota_fundo: c.cotaFundo ?? null,
          origem: 'landxml',
          rede_nome: c.redeNome ?? null,
          recebe_vazao: c.recebeVazao,
        }))
      )
      .select()
    if (error) throw error
    for (const row of data as CaixaRecord[]) idPorNome.set(row.nome, row.id)
  }

  const trechosParaInserir = resultado.trechos
    .filter((t) => idPorNome.has(t.caixaMontanteNome) && idPorNome.has(t.caixaJusanteNome))
    .map((t) => ({
      revisao_id: revisaoId,
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
      rede_nome: t.redeNome ?? null,
    }))

  if (trechosParaInserir.length > 0) {
    const { error } = await client.from('trechos').insert(trechosParaInserir)
    if (error) throw error
  }
}

export type ModoReimportacao = 'atualizar' | 'sobrepor' | 'ignorar'

export interface ResumoReimportacao {
  caixasInseridas: number
  caixasAtualizadas: number
  trechosInseridos: number
  trechosAtualizados: number
  trechosNaoResolvidos: number
}

/**
 * Aplica um diff calculado por `compararImportacao` (engine/reimportDiff.ts) contra o
 * estado atual da revisão. Sempre insere itens genuinamente novos (sem conflito). Pra
 * itens já existentes (casados por nome), o comportamento depende do modo escolhido pelo
 * usuário na tela de comparação:
 * - 'ignorar': não toca em nada que já existe, só insere o que é novo.
 * - 'atualizar': sincroniza os campos vindos do XML (geometria, diâmetro, declividade,
 *   ligação montante/jusante, cotas) mas preserva edições manuais já feitas no app
 *   (manning_n quando a origem é 'manual', recebe_vazao).
 * - 'sobrepor': mesmo que 'atualizar', só que força também manning_n/manning_n_origem e
 *   recebe_vazao a partir do XML — descarta qualquer edição manual feita depois do último
 *   import.
 */
export async function aplicarReimportacao(
  revisaoId: string,
  diff: DiffImportacao,
  modo: ModoReimportacao
): Promise<ResumoReimportacao> {
  const client = requireSupabase()

  const idPorNome = new Map<string, string>()
  for (const c of diff.caixas) {
    if (c.atual) idPorNome.set(c.nome, c.atual.id)
  }

  const caixasNovas = diff.caixas.filter((c) => c.status === 'nova')
  if (caixasNovas.length > 0) {
    const { data, error } = await client
      .from('caixas')
      .insert(
        caixasNovas.map((c) => ({
          revisao_id: revisaoId,
          nome: c.novo.nome,
          tipo: c.novo.tipo,
          x: c.novo.x ?? null,
          y: c.novo.y ?? null,
          cota_terreno: c.novo.cotaTerreno ?? null,
          cota_fundo: c.novo.cotaFundo ?? null,
          origem: 'landxml',
          rede_nome: c.novo.redeNome ?? null,
          recebe_vazao: c.novo.recebeVazao,
        }))
      )
      .select()
    if (error) throw error
    for (const row of data as CaixaRecord[]) idPorNome.set(row.nome, row.id)
  }

  let caixasAtualizadas = 0
  if (modo !== 'ignorar') {
    for (const c of diff.caixas) {
      if (c.status !== 'alterada' || !c.atual) continue
      const patch: CaixaPatch = {
        tipo: c.novo.tipo,
        x: c.novo.x ?? null,
        y: c.novo.y ?? null,
        cota_terreno: c.novo.cotaTerreno ?? null,
        cota_fundo: c.novo.cotaFundo ?? null,
      }
      if (modo === 'sobrepor') patch.recebe_vazao = c.novo.recebeVazao
      await updateCaixa(c.atual.id, patch)
      caixasAtualizadas++
    }
  }

  const trechosNovos = diff.trechos.filter((t) => t.status === 'novo' && !t.semCaixaResolvivel)
  const trechosParaInserir = trechosNovos
    .filter((t) => idPorNome.has(t.novo.caixaMontanteNome) && idPorNome.has(t.novo.caixaJusanteNome))
    .map((t) => ({
      revisao_id: revisaoId,
      nome: t.novo.nome,
      caixa_montante_id: idPorNome.get(t.novo.caixaMontanteNome),
      caixa_jusante_id: idPorNome.get(t.novo.caixaJusanteNome),
      comprimento_m: t.novo.comprimentoM,
      diametro_m: t.novo.diametroM,
      declividade_m_m: t.novo.declividadeMM,
      material: t.novo.material ?? null,
      manning_n: t.novo.manningN,
      manning_n_origem: t.novo.manningNOrigem,
      cota_topo_montante: t.novo.cotaTopoMontante ?? null,
      cota_fundo_montante: t.novo.cotaFundoMontante ?? null,
      cota_topo_jusante: t.novo.cotaTopoJusante ?? null,
      cota_fundo_jusante: t.novo.cotaFundoJusante ?? null,
      rede_nome: t.novo.redeNome ?? null,
    }))
  if (trechosParaInserir.length > 0) {
    const { error } = await client.from('trechos').insert(trechosParaInserir)
    if (error) throw error
  }

  let trechosAtualizados = 0
  const trechosNaoResolvidos = diff.trechos.filter((t) => t.semCaixaResolvivel).length
  if (modo !== 'ignorar') {
    for (const t of diff.trechos) {
      if (t.status !== 'alterado' || !t.atual || t.semCaixaResolvivel) continue
      const caixaMontanteId = idPorNome.get(t.novo.caixaMontanteNome)
      const caixaJusanteId = idPorNome.get(t.novo.caixaJusanteNome)
      if (!caixaMontanteId || !caixaJusanteId) continue

      const patch: Record<string, unknown> = {
        caixa_montante_id: caixaMontanteId,
        caixa_jusante_id: caixaJusanteId,
        comprimento_m: t.novo.comprimentoM,
        diametro_m: t.novo.diametroM,
        declividade_m_m: t.novo.declividadeMM,
        material: t.novo.material ?? null,
        cota_topo_montante: t.novo.cotaTopoMontante ?? null,
        cota_fundo_montante: t.novo.cotaFundoMontante ?? null,
        cota_topo_jusante: t.novo.cotaTopoJusante ?? null,
        cota_fundo_jusante: t.novo.cotaFundoJusante ?? null,
      }
      if (modo === 'sobrepor' || t.atual.manning_n_origem !== 'manual') {
        patch.manning_n = t.novo.manningN
        patch.manning_n_origem = t.novo.manningNOrigem
      }
      const { error } = await client.from('trechos').update(patch).eq('id', t.atual.id)
      if (error) throw error
      trechosAtualizados++
    }
  }

  return {
    caixasInseridas: caixasNovas.length,
    caixasAtualizadas,
    trechosInseridos: trechosParaInserir.length,
    trechosAtualizados,
    trechosNaoResolvidos,
  }
}
