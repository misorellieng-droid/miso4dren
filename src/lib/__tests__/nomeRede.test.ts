import { describe, expect, it } from 'vitest'
import { nomeSemRede } from '../nomeRede'

describe('nomeSemRede', () => {
  it('remove o sufixo quando bate com o rede_nome', () => {
    expect(nomeSemRede('CT - 101 (REDE - 01)', 'REDE - 01')).toBe('CT - 101')
  })

  it('mantém o nome intacto quando não há rede_nome', () => {
    expect(nomeSemRede('CT - 101', null)).toBe('CT - 101')
  })

  it('mantém o nome intacto quando o sufixo não bate exatamente', () => {
    expect(nomeSemRede('CT - 101 (REDE - 02)', 'REDE - 01')).toBe('CT - 101 (REDE - 02)')
  })

  it('mantém o nome intacto quando não termina com o sufixo esperado', () => {
    expect(nomeSemRede('CT - 101', 'REDE - 01')).toBe('CT - 101')
  })
})
