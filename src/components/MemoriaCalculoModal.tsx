import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, X, XCircle } from 'lucide-react'
import { fieldInputClass } from './ui/Field'
import { recalcularCascataJusante, type PatchCascata } from '../engine/cascataJusante'
import { updateTrecho, type CaixaRecord, type TrechoRecord } from '../lib/redeStorage'
import type { ResultadoRedeRecord } from '../lib/resultadosStorage'

const SMALL_BTN =
  'flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'

interface LinhaResultado extends ResultadoRedeRecord {
  trecho_nome: string
}

interface MemoriaCalculoModalProps {
  resultado: LinhaResultado
  trecho: TrechoRecord
  trechos: TrechoRecord[]
  caixas: CaixaRecord[]
  onClose: () => void
  /** Persiste diâmetro/declividade (com cascata já aplicada) e roda o cálculo da rede de novo. */
  onRecalcular: () => Promise<void>
}

function Linha({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1.5 text-sm last:border-0">
      <span className="text-text-secondary">{label}</span>
      <span className="font-mono text-text-primary">{valor}</span>
    </div>
  )
}

export function MemoriaCalculoModal({ resultado, trecho, trechos, caixas, onClose, onRecalcular }: MemoriaCalculoModalProps) {
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [cascataPendente, setCascataPendente] = useState<{ patches: PatchCascata[] } | null>(null)

  const nomePorId = new Map(caixas.map((c) => [c.id, c.nome]))
  const nomeMontante = nomePorId.get(trecho.caixa_montante_id) ?? '—'
  const nomeJusante = nomePorId.get(trecho.caixa_jusante_id) ?? '—'

  const aplicarPatches = async (patches: PatchCascata[]) => {
    setBusy(true)
    setErro(null)
    try {
      for (const p of patches) {
        await updateTrecho(p.id, {
          diametro_m: p.diametroM,
          declividade_m_m: p.declividadeMM,
          cota_fundo_montante: p.cotaFundoMontante,
          cota_fundo_jusante: p.cotaFundoJusante,
          cota_topo_montante: p.cotaTopoMontante,
          cota_topo_jusante: p.cotaTopoJusante,
        })
      }
      setCascataPendente(null)
      await onRecalcular()
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao recalcular.')
    } finally {
      setBusy(false)
    }
  }

  const handleEditar = (diametroM: number, declividadeMM: number) => {
    if (trecho.cota_fundo_montante == null) {
      aplicarPatches([
        {
          id: trecho.id,
          diametroM,
          declividadeMM,
          cotaFundoMontante: 0,
          cotaFundoJusante: 0,
          cotaTopoMontante: diametroM,
          cotaTopoJusante: diametroM,
        },
      ])
      return
    }
    const grafo = trechos.map((x) => ({
      id: x.id,
      caixaMontanteId: x.caixa_montante_id,
      caixaJusanteId: x.caixa_jusante_id,
      comprimentoM: x.comprimento_m,
      diametroM: x.diametro_m,
      declividadeMM: x.declividade_m_m,
      cotaFundoMontante: x.cota_fundo_montante,
    }))
    const patches = recalcularCascataJusante(grafo, trecho.id, diametroM, declividadeMM)
    if (patches.length <= 1) {
      aplicarPatches(patches)
      return
    }
    setCascataPendente({ patches })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 animate-overlay-in" onClick={onClose}>
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-5 shadow-xl animate-modal-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <div className="font-sans text-sm font-semibold text-text-primary">Memória de cálculo</div>
            <div className="text-xs text-text-secondary">{resultado.trecho_nome}</div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        <div className="mb-3">
          {resultado.conforme ? (
            <span className="flex items-center gap-1.5 text-sm font-medium text-accent-green">
              <CheckCircle2 size={16} /> Conforme
            </span>
          ) : (
            <div className="rounded-md border border-accent-red/40 bg-accent-red/10 p-2.5">
              <span className="flex items-center gap-1.5 text-sm font-medium text-accent-red">
                <XCircle size={16} /> Não conforme
              </span>
              {resultado.motivo_nao_conformidade && (
                <div className="mt-1 text-xs text-accent-red">{resultado.motivo_nao_conformidade}</div>
              )}
            </div>
          )}
        </div>

        {erro && <div className="mb-3 rounded-md border border-accent-red/40 bg-accent-red/10 p-2.5 text-xs text-accent-red">{erro}</div>}

        <div className="mb-4 grid grid-cols-2 gap-3 rounded-md border border-border/60 bg-elevated/30 p-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-secondary">Diâmetro (m)</div>
            <input
              type="number"
              step="any"
              defaultValue={trecho.diametro_m}
              disabled={busy}
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n > 0 && n !== trecho.diametro_m) handleEditar(n, trecho.declividade_m_m)
              }}
              className={`${fieldInputClass} mt-1 py-1`}
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-text-secondary">Inclinação — declividade (m/m)</div>
            <input
              type="number"
              step="any"
              defaultValue={trecho.declividade_m_m}
              disabled={busy}
              onBlur={(e) => {
                const n = Number(e.target.value)
                if (Number.isFinite(n) && n > 0 && n !== trecho.declividade_m_m) handleEditar(trecho.diametro_m, n)
              }}
              className={`${fieldInputClass} mt-1 py-1`}
            />
          </div>
          <div className="col-span-2 text-[10px] text-text-secondary">
            Editar aqui desloca a cota de fundo dos trechos a jusante (mantendo a declividade de cada um) e roda o
            cálculo da rede de novo automaticamente.
          </div>
        </div>

        {cascataPendente && (
          <div className="mb-4 rounded-md border border-accent-amber/40 bg-accent-amber/5 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-primary">
              <AlertTriangle size={14} className="text-accent-amber shrink-0" />
              Isso recalcula {cascataPendente.patches.length - 1} trecho(s) a jusante.
            </div>
            <div className="flex items-center gap-2">
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => aplicarPatches(cascataPendente.patches)}
                disabled={busy}
                className={SMALL_BTN}
              >
                {busy && <Loader2 size={14} className="animate-spin" />}
                Aplicar e recalcular
              </button>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setCascataPendente(null)}
                className="text-xs text-text-secondary hover:text-text-primary"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {busy && !cascataPendente && (
          <div className="mb-4 flex items-center gap-2 text-xs text-text-secondary">
            <Loader2 size={14} className="animate-spin" /> Recalculando a rede...
          </div>
        )}

        <div className="rounded-md border border-border/60 p-3">
          <Linha label="Caixa montante" valor={nomeMontante} />
          <Linha label="Caixa jusante" valor={nomeJusante} />
          <Linha label="Comprimento (m)" valor={trecho.comprimento_m.toFixed(2)} />
          <Linha label="Manning n" valor={trecho.manning_n?.toFixed(4) ?? 'não definido'} />
          <Linha label="ΣC×A acumulado (m²)" valor={resultado.ca_acumulado?.toFixed(2) ?? '—'} />
          <Linha label="Tc do sistema (min)" valor={resultado.tc_sistema_min?.toFixed(2) ?? '—'} />
          <Linha label="Intensidade (mm/h)" valor={resultado.intensidade_mm_h?.toFixed(2) ?? '—'} />
          <Linha label="Q projeto = 2,78×10⁻⁷ × ΣCA × i (m³/s)" valor={resultado.q_projeto_m3s?.toFixed(4) ?? '—'} />
          <Linha label="Lâmina (m)" valor={resultado.lamina_m?.toFixed(3) ?? '—'} />
          <Linha label="y/D" valor={resultado.y_sobre_d_pct != null ? `${resultado.y_sobre_d_pct.toFixed(0)}%` : '—'} />
          <Linha label="Raio hidráulico (m)" valor={resultado.raio_hidraulico_m?.toFixed(3) ?? '—'} />
          <Linha label="Velocidade (m/s)" valor={resultado.velocidade_ms?.toFixed(2) ?? '—'} />
          <Linha label="Vazão de capacidade do tubo (m³/s)" valor={resultado.vazao_calculada_m3s?.toFixed(4) ?? '—'} />
        </div>
      </div>
    </div>
  )
}
