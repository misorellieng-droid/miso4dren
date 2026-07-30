import { describe, expect, it } from 'vitest'
import { compararDiametros, gerarCsvDiferencasDiametro } from '../relatorioDiametros'

describe('compararDiametros', () => {
  it('detecta trechos com diâmetro alterado', () => {
    const originais = [
      { nome: 'T1', diametroM: 0.6, material: 'CONCRETO' },
      { nome: 'T2', diametroM: 0.4, material: 'CONCRETO' },
    ]
    const atuais = [
      { nome: 'T1', diametroM: 0.8, material: 'CONCRETO' },
      { nome: 'T2', diametroM: 0.4, material: 'CONCRETO' }, // não mudou
    ]
    const diferencas = compararDiametros(originais, atuais)
    expect(diferencas).toHaveLength(1)
    expect(diferencas[0]).toMatchObject({ trecho: 'T1', diametroAntigoM: 0.6, diametroNovoM: 0.8 })
  })

  it('ignora trecho novo (sem correspondente no original)', () => {
    const diferencas = compararDiametros([], [{ nome: 'NOVO', diametroM: 0.5, material: null }])
    expect(diferencas).toHaveLength(0)
  })

  it('não acusa diferença dentro da tolerância de arredondamento', () => {
    const originais = [{ nome: 'T1', diametroM: 0.6, material: 'CONCRETO' }]
    const atuais = [{ nome: 'T1', diametroM: 0.6001, material: 'CONCRETO' }]
    expect(compararDiametros(originais, atuais)).toHaveLength(0)
  })
})

describe('gerarCsvDiferencasDiametro', () => {
  it('gera CSV com cabeçalho e diâmetros convertidos pra mm', () => {
    const csv = gerarCsvDiferencasDiametro([{ trecho: 'T1', material: 'CONCRETO', diametroAntigoM: 0.6, diametroNovoM: 0.8 }])
    expect(csv).toContain('Trecho;Material;Diametro atual no Civil (mm);Diametro novo (mm)')
    expect(csv).toContain('T1;CONCRETO;600;800')
  })
})
