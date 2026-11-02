import type { ResultadoImportLandXml } from './landxml'
import type { TipoCaixa } from './types'

// Contrato com o plugin MISO4Dren Desenho (Civil 3D): arquivo JSON complementar de IDA, entregue junto com o LandXML.
// O LandXML não leva o tipo do dispositivo (PV, BS, BL, CT, CE, JUS) nem a marca de escada hidráulica; este arquivo leva.
// Formato definido em miso4dren-desenho/src/MISO4DrenDesenho.Dominio/ContratoJson.cs (camelCase, versão 1).

export type TipoDispositivoCivil = 'PV' | 'BS' | 'BL' | 'CT' | 'CE' | 'JUS'

export interface DispositivoContrato {
  handle: string
  nome: string
  tipo: TipoDispositivoCivil
  alinhamentoId: string | null
  estaca: number | null
  /** Se o tipo deste dispositivo foi marcado, na configuração do plugin, como podendo captar de bacia; quando vem, vale no lugar da classificação padrão do tipo. */
  recebeVazao?: boolean
  /** CE-P: caixa só indicativa na crista do talude (início da escada), que não será construída. Ausente nos arquivos antigos. */
  provisorio?: boolean
}

export interface TrechoContrato {
  handle: string
  nome: string
  /** 'Normal' ou 'ESC' (escada hidráulica). */
  tipo: string
  montante: string
  jusante: string
  material: string
  caso: string | null
  larguraB: number | null
  alturaH: number | null
  /** Só escadas, versões novas do plugin: espelho, degrau e o perfil do talude (faces com comprimento horizontal e desnível; bermas planas entre elas). */
  espelho?: number | null
  degrau?: number | null
  faces?: { comprimentoM: number; desnivelM: number }[] | null
  bermasM?: number[] | null
}

export interface ContratoIda {
  versao: number
  projeto: string
  pvPvMaximoM: number
  dispositivos: DispositivoContrato[]
  trechos: TrechoContrato[]
  espacamentoBsBsPorAlinhamento: Record<string, number>
}

export const VERSAO_CONTRATO_SUPORTADA = 1

const TIPOS_VALIDOS: TipoDispositivoCivil[] = ['PV', 'BS', 'BL', 'CT', 'CE', 'JUS']

interface ClassificacaoCaixa {
  tipo: TipoCaixa
  recebeVazao: boolean
  ehTronco: boolean
}

/**
 * Como cada dispositivo do Civil vira caixa no miso4dren (decisão de 2026-11-01):
 * PV poço de visita; BS boca de lobo (recebe vazão); BL boca de leão do sarjetão (recebe vazão e age como PV, por isso é tronco);
 * CT caixa de telhado (recebe vazão do telhado, não é tronco); CE caixa da escada hidráulica (tronco; recebe vazão das bacias, pois capta a água da escada e dos taludes); JUS final da rede.
 */
export const CLASSIFICACAO_POR_DISPOSITIVO: Record<TipoDispositivoCivil, ClassificacaoCaixa> = {
  PV: { tipo: 'pv', recebeVazao: false, ehTronco: true },
  BS: { tipo: 'boca_de_lobo', recebeVazao: true, ehTronco: true },
  BL: { tipo: 'boca_de_lobo', recebeVazao: true, ehTronco: true },
  CT: { tipo: 'caixa_passagem', recebeVazao: true, ehTronco: false },
  CE: { tipo: 'caixa_passagem', recebeVazao: true, ehTronco: true },
  JUS: { tipo: 'caixa_passagem', recebeVazao: false, ehTronco: true },
}

export function lerContratoIda(texto: string): ContratoIda {
  let bruto: unknown
  try {
    bruto = JSON.parse(texto.replace(/^﻿/, ''))
  } catch {
    throw new Error('Arquivo complementar do plugin inválido: não é um JSON.')
  }
  const c = bruto as Partial<ContratoIda>
  if (!c || typeof c !== 'object' || !Array.isArray(c.dispositivos) || !Array.isArray(c.trechos)) {
    throw new Error('Arquivo complementar do plugin inválido: faltam "dispositivos" e "trechos".')
  }
  const versao = Number(c.versao ?? 0)
  if (versao > VERSAO_CONTRATO_SUPORTADA) {
    throw new Error(`O arquivo complementar é da versão ${versao} do contrato, mais nova que a suportada aqui (${VERSAO_CONTRATO_SUPORTADA}). Atualize o miso4dren.`)
  }
  for (const d of c.dispositivos) {
    if (!TIPOS_VALIDOS.includes(d.tipo)) throw new Error(`Tipo de dispositivo desconhecido no arquivo complementar: "${d.tipo}" (${d.nome}).`)
  }
  return {
    versao,
    projeto: c.projeto ?? '',
    pvPvMaximoM: Number(c.pvPvMaximoM ?? 0),
    dispositivos: c.dispositivos,
    trechos: c.trechos,
    espacamentoBsBsPorAlinhamento: c.espacamentoBsBsPorAlinhamento ?? {},
  }
}

export interface ResultadoContrato {
  resultado: ResultadoImportLandXml
  avisos: string[]
  contagemPorTipo: Partial<Record<TipoDispositivoCivil, number>>
  escadas: number
  /** Nomes das caixas provisórias (CE-P): entram na rede para o cálculo, mas não são construídas. */
  provisorias: string[]
}

/**
 * Aplica o contrato ao que foi lido do LandXML: define o tipo, "recebe vazão" e "é tronco" de cada caixa pelo tipo do dispositivo
 * e marca os trechos de escada (com largura B e altura de fluxo H, quando o plugin já as conhece). Casa por NOME (o que está no
 * LandXML é o nome do momento da exportação, o mesmo que está no arquivo). O que não casar fica como o LandXML inferiu e vira aviso.
 */
export function aplicarContratoIda(resultado: ResultadoImportLandXml, contrato: ContratoIda): ResultadoContrato {
  const avisos: string[] = []
  const dispPorNome = new Map(contrato.dispositivos.map((d) => [d.nome, d]))
  const trechoPorNome = new Map(contrato.trechos.map((t) => [t.nome, t]))
  const contagemPorTipo: Partial<Record<TipoDispositivoCivil, number>> = {}
  const nomesCaixas = new Set(resultado.caixas.map((c) => c.nome))
  const provisorias = contrato.dispositivos.filter((d) => d.provisorio === true && nomesCaixas.has(d.nome)).map((d) => d.nome)

  const caixas = resultado.caixas.map((c) => {
    const d = dispPorNome.get(c.nome)
    if (!d) {
      avisos.push(`Caixa "${c.nome}" não está no arquivo complementar: mantido o tipo inferido pelo LandXML.`)
      return c
    }
    contagemPorTipo[d.tipo] = (contagemPorTipo[d.tipo] ?? 0) + 1
    const classificacao = CLASSIFICACAO_POR_DISPOSITIVO[d.tipo]
    return { ...c, ...classificacao, recebeVazao: typeof d.recebeVazao === 'boolean' ? d.recebeVazao : classificacao.recebeVazao }
  })
  for (const d of contrato.dispositivos) {
    if (!nomesCaixas.has(d.nome)) avisos.push(`Dispositivo "${d.nome}" do arquivo complementar não está no LandXML.`)
  }

  let escadas = 0
  const trechos = resultado.trechos.map((t) => {
    const ct = trechoPorNome.get(t.nome)
    if (!ct) {
      avisos.push(`Trecho "${t.nome}" não está no arquivo complementar.`)
      return t
    }
    if (ct.tipo !== 'ESC') return t
    escadas++
    return {
      ...t,
      ehEscadaHidraulica: true,
      escadaLarguraM: ct.larguraB ?? null,
      escadaAlturaFluxoM: ct.alturaH ?? null,
      escadaEspelhoM: ct.espelho ?? null,
      escadaDegrauM: ct.degrau ?? null,
      escadaPerfil: ct.faces && ct.faces.length > 0 ? { faces: ct.faces, bermasM: ct.bermasM ?? [] } : null,
    }
  })

  return { resultado: { caixas, trechos }, avisos, contagemPorTipo, escadas, provisorias }
}
