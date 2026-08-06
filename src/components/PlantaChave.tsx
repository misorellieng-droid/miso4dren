import { useMemo } from 'react'

interface CaixaPonto {
  id: string
  x: number | null
  y: number | null
}

interface TrechoAresta {
  id: string
  caixa_montante_id: string
  caixa_jusante_id: string
}

interface PlantaChaveProps {
  /** Todas as caixas do projeto (não só as da rede selecionada) — dá o contexto geral do terreno. */
  caixas: CaixaPonto[]
  /** Todos os trechos do projeto. */
  trechos: TrechoAresta[]
  /** IDs dos trechos que pertencem à mesma rede (sistema) do trecho aberto no modal. */
  trechoIdsDaRede: Set<string>
  /** Trecho aberto no modal — desenhado por cima de tudo, num destaque ainda maior. */
  trechoAtualId: string
}

const W = 260
const PAD = 12

/** Mini-mapa estático (sem pan/zoom) que mostra onde a rede do trecho aberto no modal fica
 * dentro do projeto inteiro: todas as caixas/trechos em cinza claro, a rede do trecho atual em
 * azul, e o próprio trecho em destaque âmbar por cima — mesma normalização X/Y de RedeDiagrama. */
export function PlantaChave({ caixas, trechos, trechoIdsDaRede, trechoAtualId }: PlantaChaveProps) {
  const { pontos, viewBox } = useMemo(() => {
    const validas = caixas.filter((c) => c.x != null && c.y != null)
    if (validas.length === 0) return { pontos: new Map<string, { x: number; y: number }>(), viewBox: `0 0 ${W} ${W}` }

    const xs = validas.map((c) => c.x as number)
    const ys = validas.map((c) => c.y as number)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys)
    const larguraM = maxX - minX || 1
    const alturaM = maxY - minY || 1
    const H = Math.max(120, (alturaM / larguraM) * W)

    const pontos = new Map<string, { x: number; y: number }>()
    for (const c of validas) {
      const px = PAD + ((c.x! - minX) / larguraM) * (W - 2 * PAD)
      // Y do UTM cresce pra norte; SVG cresce pra baixo — inverte pra manter norte em cima.
      const py = PAD + (1 - (c.y! - minY) / alturaM) * (H - 2 * PAD)
      pontos.set(c.id, { x: px, y: py })
    }
    return { pontos, viewBox: `0 0 ${W} ${H}` }
  }, [caixas])

  if (pontos.size === 0) return null

  const trechoAtual = trechos.find((t) => t.id === trechoAtualId)
  const pontoAtual = trechoAtual
    ? { a: pontos.get(trechoAtual.caixa_montante_id), b: pontos.get(trechoAtual.caixa_jusante_id) }
    : null

  return (
    <div className="mb-3 overflow-hidden rounded-md border border-border/60 bg-elevated/30">
      <div className="border-b border-border/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wide text-text-secondary">
        Planta chave — localização no projeto
      </div>
      <svg viewBox={viewBox} className="h-[140px] w-full">
        {trechos.map((t) => {
          const a = pontos.get(t.caixa_montante_id)
          const b = pontos.get(t.caixa_jusante_id)
          if (!a || !b) return null
          const daRede = trechoIdsDaRede.has(t.id)
          return (
            <line
              key={t.id}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeWidth={daRede ? 1.6 : 0.8}
              className={daRede ? 'stroke-accent-blue' : 'stroke-text-secondary/40'}
            />
          )
        })}
        {pontoAtual?.a && pontoAtual.b && (
          <line
            x1={pontoAtual.a.x}
            y1={pontoAtual.a.y}
            x2={pontoAtual.b.x}
            y2={pontoAtual.b.y}
            strokeWidth={3.5}
            strokeLinecap="round"
            className="stroke-accent-amber"
          />
        )}
      </svg>
      <div className="flex items-center gap-3 border-t border-border/60 px-2.5 py-1 text-[9px] text-text-secondary">
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-accent-amber" /> este trecho
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-accent-blue" /> rede deste trecho
        </span>
        <span className="flex items-center gap-1">
          <span className="h-0.5 w-3 bg-text-secondary/40" /> restante do projeto
        </span>
      </div>
    </div>
  )
}
