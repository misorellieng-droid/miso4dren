import { describe, expect, it } from 'vitest'
import { filtrarProjetosVisiveis, projetoOculto } from './projetosOcultos'

const lista = [
  { id: 'a', ativo: true, status_central: 'em_andamento' },
  { id: 'b', ativo: true, status_central: 'cancelada' },
  { id: 'c', ativo: false, status_central: 'concluida' },
  { id: 'd', ativo: true, status_central: 'pausada' },
]

describe('projetosOcultos', () => {
  it('oculta cancelados e excluídos por padrão', () => {
    expect(filtrarProjetosVisiveis(lista, false).map((p) => p.id)).toEqual(['a', 'd'])
  })
  it('mostra todos com o controle ligado', () => {
    expect(filtrarProjetosVisiveis(lista, true)).toHaveLength(4)
  })
  it('pausada não é oculta', () => {
    expect(projetoOculto({ ativo: true, status_central: 'pausada' })).toBe(false)
  })
})
