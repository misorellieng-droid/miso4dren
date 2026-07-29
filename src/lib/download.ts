/** Dispara o download de um arquivo de texto no navegador, sem precisar de backend. */
export function baixarArquivoTexto(nomeArquivo: string, conteudo: string, tipoMime = 'text/xml;charset=utf-8'): void {
  const blob = new Blob([conteudo], { type: tipoMime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
