import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, Layers, Loader2, Plus, Trash2, Users } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'
import { useRevisaoContext } from '../lib/RevisaoContext'
import { getProjetoDetail, type ProjetoDetail } from '../lib/projetosStorage'
import { createRevisao, deleteRevisao, listRevisoesPorProjeto, type RevisaoRecord } from '../lib/revisoesStorage'
import { listEquacoesIdf, type EquacaoIdfRecord } from '../lib/idfStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

export function ProjetoDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { setRevisaoAtivaId, reload: reloadRevisoes } = useRevisaoContext()

  const [projeto, setProjeto] = useState<ProjetoDetail | null>(null)
  const [revisoes, setRevisoes] = useState<RevisaoRecord[]>([])
  const [equacoes, setEquacoes] = useState<EquacaoIdfRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const [p, r] = await Promise.all([getProjetoDetail(id), listRevisoesPorProjeto(id)])
      setProjeto(p)
      setRevisoes(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar projeto.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    if (supabase) listEquacoesIdf().then(setEquacoes).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const [formOpen, setFormOpen] = useState(false)
  const [nome, setNome] = useState('')
  const [descricao, setDescricao] = useState('')
  const [equacaoIdfId, setEquacaoIdfId] = useState('')
  const [tempoRetorno, setTempoRetorno] = useState(10)
  const [saving, setSaving] = useState(false)

  const openCreate = () => {
    setNome('')
    setDescricao('')
    setEquacaoIdfId(equacoes[0]?.id ?? '')
    setTempoRetorno(10)
    setFormOpen(true)
  }

  const handleSave = async () => {
    if (!id || !nome.trim()) {
      setError('Informe o nome da revisão.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const created = await createRevisao({
        projetoId: id,
        nome: nome.trim(),
        descricao: descricao.trim() || null,
        equacaoIdfId: equacaoIdfId || null,
        tempoRetornoAnos: tempoRetorno,
      })
      setFormOpen(false)
      await load()
      await reloadRevisoes()
      setRevisaoAtivaId(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar revisão.')
    } finally {
      setSaving(false)
    }
  }

  const handleAbrir = (r: RevisaoRecord) => {
    setRevisaoAtivaId(r.id)
    navigate('/bacias')
  }

  const handleDelete = async (r: RevisaoRecord) => {
    if (!window.confirm(`Excluir a revisão "${r.nome}" e todos os dados vinculados (caixas, trechos, bacias, resultados)? Não pode ser desfeito.`)) {
      return
    }
    setBusyId(r.id)
    try {
      await deleteRevisao(r.id)
      await load()
      await reloadRevisoes()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir revisão.')
    } finally {
      setBusyId(null)
    }
  }

  const nomeEquacao = (eqId: string | null) => equacoes.find((e) => e.id === eqId)?.nome ?? '—'

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-text-secondary">
        <Loader2 size={16} className="animate-spin" /> Carregando...
      </div>
    )
  }

  if (error && !projeto) {
    return <div className="rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>
  }

  if (!projeto) return null

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumb items={['Cadastros', 'Projetos', projeto.nome]} />
      <Link to="/projetos" className="mb-3 flex items-center gap-1 text-xs text-text-secondary hover:text-text-primary">
        <ArrowLeft size={14} /> Projetos
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">{projeto.nome}</h1>
          {projeto.cliente_nome && (
            <p className="flex items-center gap-1 text-sm text-text-secondary">
              <Users size={13} /> {projeto.cliente_nome}
            </p>
          )}
          {projeto.descricao && <p className="text-sm text-text-secondary">{projeto.descricao}</p>}
        </div>
        <button onClick={openCreate} disabled={!supabase} className={PRIMARY_BTN}>
          <Plus size={16} />
          Nova revisão
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      <h2 className="mb-2 font-sans text-sm font-semibold uppercase tracking-wide text-text-secondary">
        Revisões ({revisoes.length})
      </h2>
      {revisoes.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhuma revisão ainda. Cada revisão é um memorial de cálculo completo (sarjeta, bacias, rede) — crie uma nova
          para comparar, por exemplo, tubo de concreto vs. tubo PEAD.
        </div>
      ) : (
        <div className="space-y-2">
          {revisoes.map((r) => (
            <div key={r.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center gap-3">
                <Layers size={20} className="text-brand" />
                <div>
                  <div className="font-sans text-sm font-semibold text-text-primary">{r.nome}</div>
                  {r.descricao && <div className="text-xs text-text-secondary">{r.descricao}</div>}
                  <div className="text-xs text-text-secondary">
                    IDF: {nomeEquacao(r.equacao_idf_id)} · TR: {r.tempo_retorno_anos} anos
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => handleAbrir(r)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-text-secondary hover:border-brand hover:text-brand">
                  Abrir
                </button>
                <button
                  onClick={() => handleDelete(r)}
                  disabled={busyId === r.id}
                  aria-label="Excluir revisão"
                  className="rounded p-1.5 hover:bg-accent-red/10 hover:text-accent-red"
                >
                  {busyId === r.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title="Nova revisão"
        description="Escolha a equação IDF e o tempo de retorno de projeto — a rede e as bacias são importadas depois, dentro da revisão."
        icon={<Layers size={20} />}
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className={PRIMARY_BTN}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Criar revisão
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nome da revisão" required hint='Ex.: "Rev. 0 — tubo concreto", "Rev. 1 — tubo PEAD"'>
            <input autoFocus className={fieldInputClass} value={nome} onChange={(e) => setNome(e.target.value)} />
          </Field>
          <Field label="Descrição" hint="Opcional">
            <textarea className={`${fieldInputClass} resize-none`} rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </Field>
          <Field label="Equação IDF">
            <div className="relative">
              <select className={`${fieldInputClass} appearance-none pr-8`} value={equacaoIdfId} onChange={(e) => setEquacaoIdfId(e.target.value)}>
                <option value="">Nenhuma selecionada</option>
                {equacoes.map((eq) => (
                  <option key={eq.id} value={eq.id}>
                    {eq.nome} {eq.localidade ? `(${eq.localidade})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown size={15} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-text-secondary" />
            </div>
          </Field>
          <Field label="Tempo de retorno (anos)" required>
            <input type="number" min={1} className={fieldInputClass} value={tempoRetorno} onChange={(e) => setTempoRetorno(Number(e.target.value))} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
