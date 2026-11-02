import { describe, expect, it } from 'vitest'
import { aplicarContratoIda, CLASSIFICACAO_POR_DISPOSITIVO, lerContratoIda, type ContratoIda } from '../contratoCivil'
import type { ResultadoImportLandXml } from '../landxml'

function resultadoBase(): ResultadoImportLandXml {
  const caixa = (nome: string) => ({ nome, tipo: 'caixa_passagem' as const, recebeVazao: false, ehTronco: false })
  const trecho = (nome: string, de: string, para: string) => ({
    nome, caixaMontanteNome: de, caixaJusanteNome: para, comprimentoM: 10, diametroM: 0.4, declividadeMM: 0.01, manningN: null, manningNOrigem: 'manual' as const,
  })
  return {
    caixas: [caixa('BS-01'), caixa('PV-01'), caixa('CT-01'), caixa('CE-01'), caixa('CE-02'), caixa('JUS-01'), caixa('BL-01')],
    trechos: [trecho('TUBO-001', 'BS-01', 'PV-01'), trecho('ESC-01', 'CE-01', 'CE-02'), trecho('TUBO-002', 'CE-02', 'PV-01')],
  }
}

function contratoBase(): ContratoIda {
  const d = (nome: string, tipo: ContratoIda['dispositivos'][number]['tipo']) => ({ handle: 'h-' + nome, nome, tipo, alinhamentoId: null, estaca: null })
  return {
    versao: 1,
    projeto: 'Teste',
    pvPvMaximoM: 60,
    dispositivos: [d('BS-01', 'BS'), d('PV-01', 'PV'), d('CT-01', 'CT'), d('CE-01', 'CE'), d('CE-02', 'CE'), d('JUS-01', 'JUS'), d('BL-01', 'BL')],
    trechos: [
      { handle: 't1', nome: 'TUBO-001', tipo: 'Normal', montante: 'h-BS-01', jusante: 'h-PV-01', material: 'Concreto', caso: null, larguraB: null, alturaH: null },
      { handle: 't2', nome: 'ESC-01', tipo: 'ESC', montante: 'h-CE-01', jusante: 'h-CE-02', material: 'Concreto', caso: 'Corte', larguraB: 0.9, alturaH: 0.5 },
      { handle: 't3', nome: 'TUBO-002', tipo: 'Normal', montante: 'h-CE-02', jusante: 'h-PV-01', material: 'Concreto', caso: null, larguraB: null, alturaH: null },
    ],
    espacamentoBsBsPorAlinhamento: { A: 38 },
  }
}

describe('aplicarContratoIda', () => {
  it('lista as caixas provisórias (CE-P) e mantém a classificação de CE', () => {
    const r = resultadoBase()
    r.caixas.push({ nome: 'CE-P-01', tipo: 'caixa_passagem', recebeVazao: false, ehTronco: false })
    const c = contratoBase()
    c.dispositivos.push({ handle: 'h-cep', nome: 'CE-P-01', tipo: 'CE', alinhamentoId: null, estaca: null, provisorio: true })
    const { resultado, provisorias, avisos } = aplicarContratoIda(r, c)
    expect(provisorias).toEqual(['CE-P-01'])
    expect(resultado.caixas.find((x) => x.nome === 'CE-P-01')).toMatchObject({ tipo: 'caixa_passagem', ehTronco: true })
    expect(avisos).toEqual([])
    expect(aplicarContratoIda(resultadoBase(), contratoBase()).provisorias).toEqual([])
  })

  it('define tipo, recebe vazão e tronco de cada caixa pelo tipo do dispositivo', () => {
    const { resultado, avisos, contagemPorTipo } = aplicarContratoIda(resultadoBase(), contratoBase())
    const por = (n: string) => resultado.caixas.find((c) => c.nome === n)!
    expect(por('PV-01')).toMatchObject({ tipo: 'pv', recebeVazao: false, ehTronco: true })
    expect(por('BS-01')).toMatchObject({ tipo: 'boca_de_lobo', recebeVazao: true, ehTronco: true })
    expect(por('BL-01')).toMatchObject({ tipo: 'boca_de_lobo', recebeVazao: true, ehTronco: true })
    expect(por('CT-01')).toMatchObject({ tipo: 'caixa_passagem', recebeVazao: true, ehTronco: false })
    expect(por('CE-01')).toMatchObject({ tipo: 'caixa_passagem', recebeVazao: false, ehTronco: true })
    expect(por('JUS-01')).toMatchObject({ tipo: 'caixa_passagem', ehTronco: true })
    expect(avisos).toEqual([])
    expect(contagemPorTipo).toEqual({ BS: 1, PV: 1, CT: 1, CE: 2, JUS: 1, BL: 1 })
  })

  it('marca a escada com largura e altura de fluxo e não mexe nos tubos normais', () => {
    const { resultado, escadas } = aplicarContratoIda(resultadoBase(), contratoBase())
    expect(escadas).toBe(1)
    const esc = resultado.trechos.find((t) => t.nome === 'ESC-01')!
    expect(esc.ehEscadaHidraulica).toBe(true)
    expect(esc.escadaLarguraM).toBe(0.9)
    expect(esc.escadaAlturaFluxoM).toBe(0.5)
    expect(resultado.trechos.find((t) => t.nome === 'TUBO-001')!.ehEscadaHidraulica).toBeUndefined()
  })

  it('escada com espelho, degrau e perfil do talude leva tudo para o trecho importado', () => {
    const c = contratoBase()
    c.trechos[1] = { ...c.trechos[1], espelho: 0.2, degrau: 0.4, faces: [{ comprimentoM: 9, desnivelM: 4 }, { comprimentoM: 6, desnivelM: 2 }], bermasM: [3] }
    const esc = aplicarContratoIda(resultadoBase(), c).resultado.trechos.find((t) => t.nome === 'ESC-01')!
    expect(esc.escadaEspelhoM).toBe(0.2)
    expect(esc.escadaDegrauM).toBe(0.4)
    expect(esc.escadaPerfil).toEqual({ faces: [{ comprimentoM: 9, desnivelM: 4 }, { comprimentoM: 6, desnivelM: 2 }], bermasM: [3] })
  })

  it('arquivo antigo, sem espelho e perfil, deixa esses campos nulos', () => {
    const esc = aplicarContratoIda(resultadoBase(), contratoBase()).resultado.trechos.find((t) => t.nome === 'ESC-01')!
    expect(esc.escadaEspelhoM).toBeNull()
    expect(esc.escadaDegrauM).toBeNull()
    expect(esc.escadaPerfil).toBeNull()
  })
  it('escada ainda sem dimensões entra marcada, com B e H nulos', () => {
    const c = contratoBase()
    c.trechos[1] = { ...c.trechos[1], larguraB: null, alturaH: null }
    const esc = aplicarContratoIda(resultadoBase(), c).resultado.trechos.find((t) => t.nome === 'ESC-01')!
    expect(esc.ehEscadaHidraulica).toBe(true)
    expect(esc.escadaLarguraM).toBeNull()
    expect(esc.escadaAlturaFluxoM).toBeNull()
  })

  it('o que não casa por nome fica como o LandXML inferiu e vira aviso', () => {
    const r = resultadoBase()
    r.caixas.push({ nome: 'X-99', tipo: 'caixa_passagem', recebeVazao: false, ehTronco: false })
    const c = contratoBase()
    c.dispositivos.push({ handle: 'h', nome: 'PV-77', tipo: 'PV', alinhamentoId: null, estaca: null })
    const { resultado, avisos } = aplicarContratoIda(r, c)
    expect(resultado.caixas.find((x) => x.nome === 'X-99')!.tipo).toBe('caixa_passagem')
    expect(avisos.some((a) => a.includes('X-99'))).toBe(true)
    expect(avisos.some((a) => a.includes('PV-77'))).toBe(true)
  })

  it('não altera o resultado original (função pura)', () => {
    const r = resultadoBase()
    const copia = JSON.parse(JSON.stringify(r))
    aplicarContratoIda(r, contratoBase())
    expect(r).toEqual(copia)
  })

  it('classifica todos os seis tipos', () => {
    expect(Object.keys(CLASSIFICACAO_POR_DISPOSITIVO).sort()).toEqual(['BL', 'BS', 'CE', 'CT', 'JUS', 'PV'])
  })
})

describe('lerContratoIda', () => {
  it('lê o JSON do plugin (camelCase, com BOM)', () => {
    const texto = '﻿' + JSON.stringify(contratoBase())
    const c = lerContratoIda(texto)
    expect(c.dispositivos).toHaveLength(7)
    expect(c.espacamentoBsBsPorAlinhamento.A).toBe(38)
  })

  it('recusa JSON inválido, sem as listas, tipo desconhecido e versão mais nova', () => {
    expect(() => lerContratoIda('isto não é json')).toThrow(/não é um JSON/)
    expect(() => lerContratoIda('{"versao":1}')).toThrow(/faltam/)
    const c = contratoBase()
    ;(c.dispositivos[0] as { tipo: string }).tipo = 'XX'
    expect(() => lerContratoIda(JSON.stringify(c))).toThrow(/desconhecido/)
    expect(() => lerContratoIda(JSON.stringify({ ...contratoBase(), versao: 99 }))).toThrow(/mais nova/)
  })
})
