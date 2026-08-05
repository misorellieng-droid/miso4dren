/**
 * Remove o sufixo " (nome da rede)" que o Civil3D emenda no nome de caixa/trecho (ex.:
 * "CT - 101 (REDE - 01)") quando bate exatamente com o rede_nome daquele registro -- é só
 * exibição, o nome gravado no banco (usado pra casar com o LandXML na reimportação/export)
 * nunca é alterado.
 */
export function nomeSemRede(nome: string, redeNome: string | null | undefined): string {
  if (!redeNome) return nome
  const sufixo = ` (${redeNome})`
  return nome.endsWith(sufixo) ? nome.slice(0, -sufixo.length) : nome
}
