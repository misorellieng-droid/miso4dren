import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, Trash2, Upload } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { getLogoUrl, logoExiste, removerLogo, uploadLogo } from '../lib/configuracoesStorage'
import { supabase } from '../lib/supabase'

const SMALL_BTN =
  'flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

/** Só pra "quebrar" o cache do browser na URL pública depois de um upload/remoção -- o path do
 * objeto no bucket é sempre o mesmo (upsert), então sem isso o <img> mostraria a versão antiga
 * até um F5 forçado. */
function comCacheBuster(url: string, versao: number): string {
  return `${url}${url.includes('?') ? '&' : '?'}v=${versao}`
}

export function ConfiguracoesPage() {
  const [temLogo, setTemLogo] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState<string | null>(null)
  const [versao, setVersao] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const carregar = async () => {
    setTemLogo(await logoExiste())
  }

  useEffect(() => {
    carregar()
  }, [])

  const handleEscolherArquivo = () => inputRef.current?.click()

  const handleArquivoSelecionado = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permite escolher o mesmo arquivo de novo depois, se precisar
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Escolha um arquivo de imagem (PNG, JPG ou SVG).')
      return
    }
    setBusy(true)
    setError(null)
    setSucesso(null)
    try {
      await uploadLogo(file)
      setTemLogo(true)
      setVersao((v) => v + 1)
      setSucesso('Logotipo salvo.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar o logotipo.')
    } finally {
      setBusy(false)
    }
  }

  const handleRemover = async () => {
    if (!window.confirm('Remover o logotipo cadastrado? Ele vai deixar de aparecer nos relatórios.')) return
    setBusy(true)
    setError(null)
    setSucesso(null)
    try {
      await removerLogo()
      setTemLogo(false)
      setVersao((v) => v + 1)
      setSucesso('Logotipo removido.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover o logotipo.')
    } finally {
      setBusy(false)
    }
  }

  if (!supabase) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumb items={['Configurações']} />
        <div className="rounded-md border border-accent-amber/40 bg-accent-amber/10 p-3 text-sm text-accent-amber">
          Supabase não configurado.
        </div>
      </div>
    )
  }

  const logoUrl = getLogoUrl()

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumb items={['Configurações']} />

      <div className="mb-4">
        <h1 className="font-sans text-xl font-bold text-text-primary">Configurações</h1>
        <p className="text-sm text-text-secondary">Preferências gerais do app.</p>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4">
        <div className="mb-1 font-sans text-sm font-semibold text-text-primary">Logotipo da empresa</div>
        <p className="mb-3 text-xs text-text-secondary">
          Aparece na capa do "Relatório completo do projeto" (tela Rede Pluvial). PNG, JPG ou SVG.
        </p>

        {error && (
          <div className="mb-3 flex items-center gap-1.5 rounded-md border border-accent-red/40 bg-accent-red/10 p-2.5 text-xs text-accent-red">
            <AlertTriangle size={14} className="shrink-0" />
            {error}
          </div>
        )}
        {sucesso && (
          <div className="mb-3 flex items-center gap-1.5 rounded-md border border-accent-green/40 bg-accent-green/10 p-2.5 text-xs text-accent-green">
            <CheckCircle2 size={14} className="shrink-0" />
            {sucesso}
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex h-24 w-40 items-center justify-center rounded-md border border-dashed border-border bg-elevated/30">
            {temLogo === null ? (
              <Loader2 size={18} className="animate-spin text-text-secondary" />
            ) : temLogo && logoUrl ? (
              <img
                src={comCacheBuster(logoUrl, versao)}
                alt="Logotipo cadastrado"
                className="max-h-full max-w-full object-contain p-2"
              />
            ) : (
              <span className="px-2 text-center text-xs text-text-secondary">Nenhum logotipo cadastrado</span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <input ref={inputRef} type="file" accept="image/*" onChange={handleArquivoSelecionado} className="hidden" />
            <button onClick={handleEscolherArquivo} disabled={busy} className={SMALL_BTN}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {temLogo ? 'Trocar logotipo' : 'Enviar logotipo'}
            </button>
            {temLogo && (
              <button
                onClick={handleRemover}
                disabled={busy}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary shadow-sm transition hover:text-accent-red disabled:opacity-60"
              >
                <Trash2 size={14} />
                Remover
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
