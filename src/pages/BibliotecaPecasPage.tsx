import { useEffect, useState } from 'react'
import { Loader2, Package, Pencil, Plus, Trash2 } from 'lucide-react'
import { Breadcrumb } from '../components/layout/Breadcrumb'
import { Modal } from '../components/ui/Modal'
import { Field, fieldInputClass } from '../components/ui/Field'
import {
  atualizarItemBiblioteca,
  criarItemBiblioteca,
  excluirItemBiblioteca,
  listBibliotecaPecas,
  type ItemBiblioteca,
} from '../lib/bibliotecaStorage'
import { supabase } from '../lib/supabase'

const PRIMARY_BTN =
  'flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60'
const GHOST_BTN = 'rounded-lg px-4 py-2 text-sm font-medium text-text-secondary transition hover:bg-elevated'

export function BibliotecaPecasPage() {
  const [itens, setItens] = useState<ItemBiblioteca[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<ItemBiblioteca | null>(null)
  const [material, setMaterial] = useState('')
  const [diametroM, setDiametroM] = useState('')
  const [espessuraM, setEspessuraM] = useState('')
  const [nomePeca, setNomePeca] = useState('')
  const [larguraEscavacaoM, setLarguraEscavacaoM] = useState('')
  const [taludeEscavacaoHv, setTaludeEscavacaoHv] = useState('')
  const [alturaBercoM, setAlturaBercoM] = useState('')
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!supabase) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setItens(await listBibliotecaPecas())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar a biblioteca de peças.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const limparForm = () => {
    setMaterial('')
    setDiametroM('')
    setEspessuraM('')
    setNomePeca('')
    setLarguraEscavacaoM('')
    setTaludeEscavacaoHv('')
    setAlturaBercoM('')
  }

  const abrirNovo = () => {
    setEditando(null)
    limparForm()
    setFormOpen(true)
  }

  const abrirEditar = (item: ItemBiblioteca) => {
    setEditando(item)
    setMaterial(item.material)
    setDiametroM(String(item.diametro_m))
    setEspessuraM(item.espessura_parede_m != null ? String(item.espessura_parede_m) : '')
    setNomePeca(item.nome_peca ?? '')
    setLarguraEscavacaoM(item.largura_escavacao_m != null ? String(item.largura_escavacao_m) : '')
    setTaludeEscavacaoHv(item.talude_escavacao_hv != null ? String(item.talude_escavacao_hv) : '')
    setAlturaBercoM(item.altura_berco_m != null ? String(item.altura_berco_m) : '')
    setFormOpen(true)
  }

  const handleSave = async () => {
    const espessura = espessuraM.trim() ? Number(espessuraM.replace(',', '.')) : null
    const largura = larguraEscavacaoM.trim() ? Number(larguraEscavacaoM.replace(',', '.')) : null
    const talude = taludeEscavacaoHv.trim() ? Number(taludeEscavacaoHv.replace(',', '.')) : null
    const berco = alturaBercoM.trim() ? Number(alturaBercoM.replace(',', '.')) : null
    setSaving(true)
    setError(null)
    try {
      if (editando) {
        await atualizarItemBiblioteca(editando.id, {
          espessura_parede_m: espessura,
          nome_peca: nomePeca.trim() || null,
          largura_escavacao_m: largura,
          talude_escavacao_hv: talude,
          altura_berco_m: berco,
        })
      } else {
        const diametro = Number(diametroM.replace(',', '.'))
        if (!material.trim() || !Number.isFinite(diametro) || diametro <= 0) {
          setError('Informe o material e um diâmetro válido.')
          setSaving(false)
          return
        }
        await criarItemBiblioteca(material.trim().toUpperCase(), diametro, espessura, nomePeca.trim() || null, largura, talude, berco)
      }
      setFormOpen(false)
      setEditando(null)
      limparForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item — confira se esse material+diâmetro já não existe.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este item da biblioteca?')) return
    setBusyId(id)
    try {
      await excluirItemBiblioteca(id)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir item.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <Breadcrumb items={['Administração', 'Biblioteca de Peças']} />

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-sans text-xl font-bold text-text-primary">Biblioteca de Peças</h1>
          <p className="text-sm text-text-secondary">
            Catálogo material + diâmetro → espessura de parede, espelhando o Parts List do Civil 3D. Usado pra editar diâmetro só com
            tamanhos reais (dropdown), pra escrever a espessura certa no XML exportado, e pra calcular os volumes de escavação/berço/
            reaterro na tabela "Quantidade" da Rede Pluvial.
          </p>
        </div>
        <button onClick={abrirNovo} disabled={!supabase} className={PRIMARY_BTN}>
          <Plus size={16} />
          Novo item
        </button>
      </div>

      {error && <div className="mb-4 rounded-md border border-accent-red/40 bg-accent-red/10 p-3 text-sm text-accent-red">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <Loader2 size={16} className="animate-spin" /> Carregando...
        </div>
      ) : itens.length === 0 ? (
        <div className="rounded-lg border border-border bg-surface p-6 text-center text-sm text-text-secondary">
          Nenhum item cadastrado ainda.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full whitespace-nowrap text-sm">
            <thead>
              <tr className="border-b border-border bg-elevated/50 text-left text-xs text-text-secondary">
                <th className="px-4 py-2 font-medium">Material</th>
                <th className="px-4 py-2 font-medium">Diâmetro (m)</th>
                <th className="px-4 py-2 font-medium">Espessura de parede (m)</th>
                <th className="px-4 py-2 font-medium">Nome da peça</th>
                <th className="px-4 py-2 font-medium">Largura escavação (m)</th>
                <th className="px-4 py-2 font-medium">Talude (H:V)</th>
                <th className="px-4 py-2 font-medium">Altura berço (m)</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr
                  key={i.id}
                  onClick={() => abrirEditar(i)}
                  className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-elevated/40"
                  title="Editar item"
                >
                  <td className="px-4 py-2 font-medium text-text-primary">{i.material}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.diametro_m}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.espessura_parede_m ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.nome_peca ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.largura_escavacao_m ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.talude_escavacao_hv ?? '—'}</td>
                  <td className="px-4 py-2 text-text-secondary">{i.altura_berco_m ?? '—'}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          abrirEditar(i)
                        }}
                        className="rounded p-1 hover:bg-brand/10 hover:text-brand"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(i.id)
                        }}
                        disabled={busyId === i.id}
                        className="rounded p-1 hover:bg-accent-red/10 hover:text-accent-red"
                      >
                        {busyId === i.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editando ? 'Editar item da biblioteca' : 'Novo item da biblioteca'}
        icon={<Package size={20} />}
        footer={
          <>
            <button onClick={() => setFormOpen(false)} className={GHOST_BTN}>
              Cancelar
            </button>
            <button onClick={handleSave} disabled={saving} className={PRIMARY_BTN}>
              {saving && <Loader2 size={14} className="animate-spin" />}
              Salvar
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Material" required hint="Deve bater com o texto do material no LandXML (ex.: CONCRETO, PVC)">
            <input
              className={`${fieldInputClass} disabled:opacity-60`}
              value={material}
              disabled={!!editando}
              onChange={(e) => setMaterial(e.target.value)}
            />
          </Field>
          <Field label="Diâmetro (m)" required hint={editando ? 'Material e diâmetro são a chave do item — exclua e recrie pra mudar.' : undefined}>
            <input
              type="number"
              step="any"
              className={`${fieldInputClass} disabled:opacity-60`}
              value={diametroM}
              disabled={!!editando}
              onChange={(e) => setDiametroM(e.target.value)}
            />
          </Field>
          <Field label="Espessura de parede (m)" hint="Property 'Wall Thickness' do Civil 3D, convertida de mm pra m (ex.: 175mm = 0,175)">
            <input type="number" step="any" className={fieldInputClass} value={espessuraM} onChange={(e) => setEspessuraM(e.target.value)} />
          </Field>
          <Field label="Nome da peça" hint="Property 'Part Size Name' do Civil 3D (ex.: BSTC DN 0,80 m) — só informativo">
            <input className={fieldInputClass} value={nomePeca} onChange={(e) => setNomePeca(e.target.value)} />
          </Field>
          <Field label="Largura de escavação (m)" hint="Largura da vala no FUNDO (nível do berço/tubo) — usada na tabela Quantidade">
            <input
              type="number"
              step="any"
              className={fieldInputClass}
              value={larguraEscavacaoM}
              onChange={(e) => setLarguraEscavacaoM(e.target.value)}
            />
          </Field>
          <Field label="Talude de escavação (H:V)" hint="Razão H:V — ex.: 1,0 = 1:1 (alarga 1m de cada lado a cada 1m de profundidade)">
            <input
              type="number"
              step="any"
              className={fieldInputClass}
              value={taludeEscavacaoHv}
              onChange={(e) => setTaludeEscavacaoHv(e.target.value)}
            />
          </Field>
          <Field label="Altura do berço (m)" hint="Camada de lastro abaixo do tubo">
            <input type="number" step="any" className={fieldInputClass} value={alturaBercoM} onChange={(e) => setAlturaBercoM(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  )
}
