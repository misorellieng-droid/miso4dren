import { useState } from 'react'
import { AlertTriangle, Loader2, PlusCircle, RefreshCw, X } from 'lucide-react'
import { resumoDiff, type DiffImportacao } from '../engine/reimportDiff'
import type { ModoReimportacao } from '../lib/redeStorage'

const BTN_BASE = 'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium shadow-sm transition disabled:opacity-60'

interface ImportacaoDiffModalProps {
  diff: DiffImportacao
  busy: boolean
  onEscolher: (modo: ModoReimportacao) => void
  onCancelar: () => void
}

export function ImportacaoDiffModal({ diff, busy, onEscolher, onCancelar }: ImportacaoDiffModalProps) {
  const [expandido, setExpandido] = useState(true)
  const resumo = resumoDiff(diff)

  const caixasAlteradas = diff.caixas.filter((c) => c.status === 'alterada')
  const trechosAlterados = diff.trechos.filter((t) => t.status === 'alterado')
  const trechosNaoResolvidos = diff.trechos.filter((t) => t.semCaixaResolvivel)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-overlay-in">
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface p-5 shadow-xl animate-modal-in">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="font-sans text-sm font-semibold text-text-primary">Comparação com a rede já importada</div>
          <button onClick={onCancelar} className="text-text-secondary hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="mb-4 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="rounded-md border border-accent-green/30 bg-accent-green/5 p-2">
            <div className="text-lg font-semibold text-accent-green">{resumo.caixasNovas + resumo.trechosNovos}</div>
            <div className="text-text-secondary">novo(s)</div>
          </div>
          <div className="rounded-md border border-accent-amber/30 bg-accent-amber/5 p-2">
            <div className="text-lg font-semibold text-accent-amber">{resumo.caixasAlteradas + resumo.trechosAlterados}</div>
            <div className="text-text-secondary">alterado(s)</div>
          </div>
          <div className="rounded-md border border-border bg-elevated/30 p-2">
            <div className="text-lg font-semibold text-text-secondary">{resumo.caixasIguais + resumo.trechosIguais}</div>
            <div className="text-text-secondary">sem mudança</div>
          </div>
        </div>

        {trechosNaoResolvidos.length > 0 && (
          <div className="mb-3 flex items-start gap-2 rounded-md border border-accent-red/40 bg-accent-red/10 p-2.5 text-xs text-accent-red">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div>
              {trechosNaoResolvidos.length} trecho(s) referenciam uma caixa montante/jusante que não existe nem no XML nem no banco — não
              serão importados: {trechosNaoResolvidos.map((t) => t.nome).join(', ')}.
            </div>
          </div>
        )}

        {(caixasAlteradas.length > 0 || trechosAlterados.length > 0) && (
          <div className="mb-4">
            <button onClick={() => setExpandido((v) => !v)} className="mb-2 text-xs font-medium text-brand hover:underline">
              {expandido ? 'Ocultar' : 'Ver'} detalhes das alterações
            </button>
            {expandido && (
              <div className="max-h-64 overflow-y-auto rounded-md border border-border/60">
                {caixasAlteradas.map((c) => (
                  <div key={c.nome} className="border-b border-border/40 px-3 py-1.5 text-xs last:border-0">
                    <span className="font-medium text-text-primary">{c.nome}</span>{' '}
                    <span className="text-text-secondary">(caixa) — {c.camposAlterados.join(', ')}</span>
                  </div>
                ))}
                {trechosAlterados.map((t) => (
                  <div key={t.nome} className="border-b border-border/40 px-3 py-1.5 text-xs last:border-0">
                    <span className="font-medium text-text-primary">{t.nome}</span>{' '}
                    <span className={t.ligacaoAlterada ? 'font-medium text-accent-amber' : 'text-text-secondary'}>
                      (trecho) — {t.camposAlterados.join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mb-3 text-xs text-text-secondary">
          Itens novos são sempre adicionados. Pros itens que já existem e mudaram, escolha o que fazer:
        </div>

        <div className="flex flex-col gap-2">
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onEscolher('atualizar')}
            disabled={busy}
            className={`${BTN_BASE} justify-start bg-brand text-white hover:bg-brand-dark`}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            <span>
              <span className="font-semibold">Atualizar</span> — aplica os valores do XML (geometria, diâmetro, declividade, ligação),
              preservando manning n editado manualmente
            </span>
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onEscolher('sobrepor')}
            disabled={busy}
            className={`${BTN_BASE} justify-start border border-accent-amber/50 bg-accent-amber/10 text-accent-amber hover:bg-accent-amber/20`}
          >
            <AlertTriangle size={14} />
            <span>
              <span className="font-semibold">Sobrepor tudo</span> — igual acima, mas também descarta manning n e recebe-vazão editados
              manualmente
            </span>
          </button>
          <button
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onEscolher('ignorar')}
            disabled={busy}
            className={`${BTN_BASE} justify-start border border-border text-text-secondary hover:text-text-primary`}
          >
            <PlusCircle size={14} />
            <span>
              <span className="font-semibold">Ignorar alterações</span> — só adiciona o que é novo, não mexe em nada que já existe
            </span>
          </button>
          <button onClick={onCancelar} disabled={busy} className="mt-1 text-center text-xs text-text-secondary hover:text-text-primary">
            Cancelar (não importa nada)
          </button>
        </div>
      </div>
    </div>
  )
}
