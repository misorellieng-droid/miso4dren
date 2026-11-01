// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { aplicarContratoIda, lerContratoIda } from '../contratoCivil'
import { parseLandXml } from '../landxml'

// Os dois arquivos foram gerados pelo CÓDIGO do plugin (MISO4DrenDesenho.Dominio: LandXml.Exportar e ContratoJson.Serializar)
// a partir de uma rede de teste. Este teste prova que o miso4dren lê o que o plugin escreve, ponta a ponta.
// Para regenerar: ver miso4dren-desenho/docs/ESTADO.md (gerador de fixtures do contrato).
const dir = join(__dirname, 'fixtures')
const xml = readFileSync(join(dir, 'plugin-rede.xml'), 'utf8')
const json = readFileSync(join(dir, 'plugin-ida.json'), 'utf8')

describe('arquivos gerados pelo plugin Civil', () => {
  const lido = parseLandXml(xml, new Map([['CONCRETO', 0.013]]))
  const contrato = lerContratoIda(json)

  it('o LandXML do plugin é lido: caixas, trechos, diâmetro em m, cotas e posição (N E)', () => {
    expect(lido.caixas).toHaveLength(7)
    expect(lido.trechos).toHaveLength(5)
    const pv2 = lido.caixas.find((c) => c.nome === 'PV-02')!
    expect(pv2.x).toBe(150)
    expect(pv2.y).toBe(150)
    expect(pv2.cotaTerreno).toBe(107)
    const t = lido.trechos.find((x) => x.nome === 'TUBO-002')!
    expect(t.diametroM).toBeCloseTo(0.6, 6)
    expect(t.caixaMontanteNome).toBe('PV-01')
    expect(t.caixaJusanteNome).toBe('PV-02')
    expect(t.cotaFundoMontante).toBe(100)
    expect(t.manningN).toBe(0.013)            // material CONCRETO casa com a tabela interna
  })

  it('o JSON do plugin é lido e aplicado: tipos de caixa e escada com B e H', () => {
    const { resultado, avisos, contagemPorTipo, escadas } = aplicarContratoIda(lido, contrato)
    expect(avisos).toEqual([])
    expect(contagemPorTipo).toEqual({ BS: 1, PV: 2, CT: 1, CE: 2, JUS: 1 })
    const por = (n: string) => resultado.caixas.find((c) => c.nome === n)!
    expect(por('BS-01').tipo).toBe('boca_de_lobo')
    expect(por('PV-02').tipo).toBe('pv')
    expect(por('CT-01')).toMatchObject({ tipo: 'caixa_passagem', recebeVazao: true })
    expect(escadas).toBe(1)
    const esc = resultado.trechos.find((t) => t.nome === 'ESC-01')!
    expect(esc).toMatchObject({ ehEscadaHidraulica: true, escadaLarguraM: 0.9, escadaAlturaFluxoM: 0.5 })
    expect(resultado.trechos.filter((t) => t.ehEscadaHidraulica)).toHaveLength(1)
  })

  it('o contrato traz o espaçamento por alinhamento e o padrão do projeto', () => {
    expect(contrato.pvPvMaximoM).toBe(60)
    expect(contrato.espacamentoBsBsPorAlinhamento).toEqual({ ALINH: 38 })
    expect(contrato.trechos.find((t) => t.nome === 'ESC-01')).toMatchObject({ tipo: 'ESC', caso: 'Corte' })
  })
})
