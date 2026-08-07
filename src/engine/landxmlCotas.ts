import type { TrechoRecord } from '../lib/redeStorage'

/**
 * Cota de fundo (Sump) real de uma caixa pro LandXML -- deriva dos inverts dos
 * trechos de fato conectados a ela (a menor cota_fundo entre os que chegam/saem
 * dali), em vez de usar o campo `cota_fundo` da caixa isoladamente.
 *
 * `cota_fundo` é editável direto na tela (Rede Importada) mas não é
 * reajustado quando os cálculos em cascata alteram as cotas dos trechos --
 * fica desatualizado depois de qualquer recálculo (energia, perfil uniforme,
 * correção de recobrimento). Exportar esse valor obsoleto como elevSump gera
 * uma estrutura no Civil 3D com fundo em cota diferente da dos tubos que
 * chegam nela -- os desníveis/"disniveis" reportados no desenho. Cai pro
 * `cota_fundo` cadastrado só quando a caixa não tem nenhum trecho com invert
 * conhecido (caixa isolada, ou ainda sem cálculo rodado).
 */
export function cotaFundoEstruturaConectada(
  caixaId: string,
  cotaFundoCaixa: number | null,
  trechos: Pick<TrechoRecord, 'caixa_montante_id' | 'caixa_jusante_id' | 'cota_fundo_montante' | 'cota_fundo_jusante'>[]
): number | null {
  let menor: number | null = null
  for (const t of trechos) {
    if (t.caixa_montante_id === caixaId && t.cota_fundo_montante != null) {
      menor = menor == null ? t.cota_fundo_montante : Math.min(menor, t.cota_fundo_montante)
    }
    if (t.caixa_jusante_id === caixaId && t.cota_fundo_jusante != null) {
      menor = menor == null ? t.cota_fundo_jusante : Math.min(menor, t.cota_fundo_jusante)
    }
  }
  return menor ?? cotaFundoCaixa
}
