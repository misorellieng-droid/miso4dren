import type { ResultadoImportLandXml } from '../engine/landxml'
import type { DiffImportacao } from '../engine/reimportDiff'
import { criarImportacao } from './importacoesStorage'
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
  eh_tronco: boolean
  importacao_id: string | null
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
  importacao_id: string | null
  /** Escada hidráulica (dissipador em degraus) -- não é um tubo circular, hidráulica própria (ver
   * engine/escadaHidraulica.ts e a página Escadas Hidráulicas), fora do memorial justificativo.
   * Ver migração 027_escada_hidraulica.sql. */
  eh_escada_hidraulica: boolean
  escada_largura_m: number | null
  escada_altura_fluxo_m: number | null
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
  eh_tronco?: boolean
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

export async function updateCaixasEhTroncoEmLote(ids: string[], ehTronco: boolean): Promise<void> {
  if (ids.length === 0) return
  const { error } = await requireSupabase().from('caixas').update({ eh_tronco: ehTronco }).in('id', ids)
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
  eh_escada_hidraulica?: boolean
  escada_largura_m?: number | null
  escada_altura_fluxo_m?: number | null
}

export async function updateTrechosEhEscadaHidraulicaEmLote(ids: string[], ehEscadaHidraulica: boolean): Promise<void> {
  if (ids.length === 0) return
  const { error } = await requireSupabase().from('trechos').update({ eh_escada_hidraulica: ehEscadaHidraulica }).in('id', ids)
  if (error) throw error
}

export async function updateTrecho(id: string, patch: TrechoPatch): Promise<void> {
  const { error } = await requireSupabase().from('trechos').update(patch).eq('id', id)
  if (error) throw error
}

/** Aplica um patch de perfil (declividade + cotas) por trecho, em paralelo -- usado pelo
 * recálculo de perfil da rede inteira (declividade/recobrimento uniformes), que tipicamente
 * mexe em uma centena de trechos de uma vez; um loop sequencial de updateTrecho seria lento
 * demais pra isso. */
export async function updateTrechosPerfilEmLote(
  patches: { id: string; declividadeM_m: number; cotaFundoMontante: number; cotaFundoJusante: number; cotaTopoMontante: number; cotaTopoJusante: number }[]
): Promise<void> {
  const client = requireSupabase()
  const resultados = await Promise.all(
    patches.map((p) =>
      client
        .from('trechos')
        .update({
          declividade_m_m: p.declividadeM_m,
          cota_fundo_montante: p.cotaFundoMontante,
          cota_fundo_jusante: p.cotaFundoJusante,
          cota_topo_montante: p.cotaTopoMontante,
          cota_topo_jusante: p.cotaTopoJusante,
        })
        .eq('id', p.id)
    )
  )
  const primeiroErro = resultados.find((r) => r.error)?.error
  if (primeiroErro) throw primeiroErro
}

/**
 * Exclui uma caixa (estrutura). Caixa_montante_id/caixa_jusante_id em `trechos` são
 * NOT NULL, então qualquer trecho ligado nela (montante ou jusante) tem que ser excluído
 * junto -- não dá pra "desligar" o trecho e manter só a caixa órfã. Útil pra limpar
 * estruturas fantasma do Civil3D (ex.: EndNullStructN sem par StartNullStructN
 * correspondente, sem coordenada, que acabam gerando ciclo na topologia da rede).
 */
export async function excluirCaixa(caixaId: string): Promise<void> {
  const client = requireSupabase()

  const { data: trechosLigados, error: errTrechos } = await client
    .from('trechos')
    .select('id')
    .or(`caixa_montante_id.eq.${caixaId},caixa_jusante_id.eq.${caixaId}`)
  if (errTrechos) throw errTrechos
  const trechoIds = (trechosLigados ?? []).map((t: { id: string }) => t.id)

  if (trechoIds.length > 0) {
    const { error: errResultados } = await client.from('resultados_rede').delete().in('trecho_id', trechoIds)
    if (errResultados) throw errResultados
    const { error: errDelTrechos } = await client.from('trechos').delete().in('id', trechoIds)
    if (errDelTrechos) throw errDelTrechos
  }

  const { error: errDelCaixa } = await client.from('caixas').delete().eq('id', caixaId)
  if (errDelCaixa) throw errDelCaixa
}

export async function updateTrechosManningEmLote(ids: string[], manningN: number): Promise<void> {
  if (ids.length === 0) return
  const { error } = await requireSupabase()
    .from('trechos')
    .update({ manning_n: manningN, manning_n_origem: 'manual' })
    .in('id', ids)
  if (error) throw error
}

export interface ResultadoRenomeMaterial {
  trechosRenomeados: number
  manningAtualizados: number
}

/**
 * Renomeia o material de vários trechos de uma vez, dentro de uma revisão -- útil pra unificar
 * grafias diferentes vindas do Civil 3D (ex.: "CONCRETO" e "Reinforced Concrete" acabam sem
 * bater com o mesmo item da biblioteca de peças nem com a mesma linha de materiais_manning, por
 * mais que sejam o mesmo material na prática) ou pra converter a rede inteira de uma vez pra um
 * estudo alternativo (ex.: refazer em PEAD). `materialAntigo` null renomeia TODO trecho da
 * revisão, independente do material atual; caso contrário casa por texto (case-insensitive,
 * igual o resto do app).
 *
 * Também atualiza o manning_n dos trechos afetados cujo manning_n_origem NÃO é 'manual' (edição
 * explícita do engenheiro é preservada) pro valor do material novo em `manningNovoMaterial`,
 * quando informado -- senão o Manning ficaria "preso" no material antigo até rodar o cálculo de
 * novo e mesmo assim não teria de onde vir o valor certo automaticamente.
 */
export async function renomearMaterialEmLote(
  revisaoId: string,
  materialAntigo: string | null,
  materialNovo: string,
  manningNovoMaterial: number | null
): Promise<ResultadoRenomeMaterial> {
  const client = requireSupabase()
  let query = client.from('trechos').update({ material: materialNovo }).eq('revisao_id', revisaoId)
  if (materialAntigo != null) query = query.ilike('material', materialAntigo)
  const { data, error } = await query.select('id, manning_n_origem')
  if (error) throw error
  const afetados = (data ?? []) as { id: string; manning_n_origem: string }[]

  let manningAtualizados = 0
  if (manningNovoMaterial != null) {
    const idsParaAtualizarManning = afetados.filter((t) => t.manning_n_origem !== 'manual').map((t) => t.id)
    if (idsParaAtualizarManning.length > 0) {
      const { error: errManning } = await client
        .from('trechos')
        .update({ manning_n: manningNovoMaterial, manning_n_origem: 'tabela_interna' })
        .in('id', idsParaAtualizarManning)
      if (errManning) throw errManning
      manningAtualizados = idsParaAtualizarManning.length
    }
  }

  return { trechosRenomeados: afetados.length, manningAtualizados }
}

/**
 * Grava o resultado de parseLandXml: insere as caixas primeiro, depois
 * resolve os nomes montante/jusante dos trechos para os ids recém-criados.
 * Caixas já existentes na revisão (mesmo nome) são reaproveitadas. Cria um
 * registro em `importacoes` e marca cada linha nova com o importacao_id —
 * dá pra ver o histórico de importações e excluir o lote inteiro depois
 * (ver importacoesStorage.ts).
 */
export async function importarRedeLandXml(
  revisaoId: string,
  resultado: ResultadoImportLandXml,
  nomeArquivo: string | null = null
): Promise<void> {
  const client = requireSupabase()

  const importacaoId = await criarImportacao(
    revisaoId,
    'rede_landxml',
    nomeArquivo,
    `${resultado.caixas.length} caixa(s), ${resultado.trechos.length} trecho(s)`
  )

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
          eh_tronco: c.ehTronco,
          importacao_id: importacaoId,
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
      importacao_id: importacaoId,
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
 *   (manning_n quando a origem é 'manual', recebe_vazao, eh_tronco).
 * - 'sobrepor': mesmo que 'atualizar', só que força também manning_n/manning_n_origem,
 *   recebe_vazao e eh_tronco a partir do XML — descarta qualquer edição manual feita depois
 *   do último import.
 */
export async function aplicarReimportacao(
  revisaoId: string,
  diff: DiffImportacao,
  modo: ModoReimportacao,
  nomeArquivo: string | null = null
): Promise<ResumoReimportacao> {
  const client = requireSupabase()

  const caixasNovas = diff.caixas.filter((c) => c.status === 'nova')
  const trechosNovosPreview = diff.trechos.filter((t) => t.status === 'novo' && !t.semCaixaResolvivel)
  const importacaoId = await criarImportacao(
    revisaoId,
    'rede_landxml',
    nomeArquivo,
    `reimportação (${modo}): ${caixasNovas.length} caixa(s) nova(s), ${trechosNovosPreview.length} trecho(s) novo(s)`
  )

  const idPorNome = new Map<string, string>()
  for (const c of diff.caixas) {
    if (c.atual) idPorNome.set(c.nome, c.atual.id)
  }

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
          importacao_id: importacaoId,
          origem: 'landxml',
          rede_nome: c.novo.redeNome ?? null,
          recebe_vazao: c.novo.recebeVazao,
          eh_tronco: c.novo.ehTronco,
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
      if (modo === 'sobrepor') {
        patch.recebe_vazao = c.novo.recebeVazao
        patch.eh_tronco = c.novo.ehTronco
      }
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
      importacao_id: importacaoId,
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
