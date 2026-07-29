import { useMemo, useRef, useState } from 'react'

interface CaixaPonto {
  id: string
  nome: string
  x: number | null
  y: number | null
}

interface TrechoAresta {
  id: string
  nome: string
  caixa_montante_id: string
  caixa_jusante_id: string
}

interface RedeDiagramaProps {
  caixas: CaixaPonto[]
  trechos: TrechoAresta[]
  conformidadePorTrecho: Map<string, boolean | null>
  /** Chamado ao clicar num trecho — o consumidor decide o que fazer (ex.: abrir modal de edição). */
  onSelecionarTrecho?: (trechoId: string) => void
}

const W = 1000
const PAD = 30

/** Diagrama de plano da rede: posiciona as caixas pelas coordenadas reais (X/Y do LandXML),
 * desenha os trechos como setas montante->jusante coloridas por conformidade. Arrastar move,
 * scroll faz zoom, hover mostra o nome do trecho, clique abre a edição — feito com transform de
 * SVG puro, sem lib externa. */
export function RedeDiagrama({ caixas, trechos, conformidadePorTrecho, onSelecionarTrecho }: RedeDiagramaProps) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [arrastando, setArrastando] = useState(false)
  const dragOrigemRef = useRef<{ x: number; y: number } | null>(null)
  const [hover, setHover] = useState<{ trechoId: string; clientX: number; clientY: number } | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const nomePorId = useMemo(() => new Map(caixas.map((c) => [c.id, c.nome])), [caixas])

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
    const H = Math.max(300, (alturaM / larguraM) * W)

    const pontos = new Map<string, { x: number; y: number }>()
    for (const c of validas) {
      const px = PAD + ((c.x! - minX) / larguraM) * (W - 2 * PAD)
      // Y do UTM cresce pra norte; SVG cresce pra baixo — inverte pra manter norte em cima.
      const py = PAD + (1 - (c.y! - minY) / alturaM) * (H - 2 * PAD)
      pontos.set(c.id, { x: px, y: py })
    }
    return { pontos, viewBox: `0 0 ${W} ${H}` }
  }, [caixas])

  const idsComEntrada = useMemo(() => new Set(trechos.map((t) => t.caixa_jusante_id)), [trechos])
  const idsComSaida = useMemo(() => new Set(trechos.map((t) => t.caixa_montante_id)), [trechos])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const fator = e.deltaY > 0 ? 0.9 : 1.1
    setScale((s) => Math.min(10, Math.max(0.5, s * fator)))
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    setArrastando(true)
    dragOrigemRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
  }
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragOrigemRef.current) return
    setOffset({ x: e.clientX - dragOrigemRef.current.x, y: e.clientY - dragOrigemRef.current.y })
  }
  const pararArraste = () => {
    setArrastando(false)
    dragOrigemRef.current = null
  }

  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  const trechoHover = hover ? trechos.find((t) => t.id === hover.trechoId) : null

  return (
    <div
      ref={containerRef}
      className="relative h-[560px] w-full overflow-hidden rounded-lg border border-border bg-elevated/30"
      onMouseMove={(e) => {
        if (hover) setHover({ ...hover, clientX: e.clientX, clientY: e.clientY })
      }}
    >
      <svg
        viewBox={viewBox}
        className="h-full w-full"
        style={{ cursor: arrastando ? 'grabbing' : 'grab' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={pararArraste}
        onMouseLeave={pararArraste}
      >
        <defs>
          <marker id="seta-conforme" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-accent-green" />
          </marker>
          <marker id="seta-nao-conforme" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-accent-red" />
          </marker>
          <marker id="seta-neutra" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-text-secondary" />
          </marker>
        </defs>
        <g transform={`translate(${offset.x} ${offset.y}) scale(${scale})`}>
          {trechos.map((t) => {
            const a = pontos.get(t.caixa_montante_id)
            const b = pontos.get(t.caixa_jusante_id)
            if (!a || !b) return null
            const conforme = conformidadePorTrecho.get(t.id) ?? undefined
            const corClasse = conforme === undefined ? 'stroke-text-secondary' : conforme ? 'stroke-accent-green' : 'stroke-accent-red'
            const marker =
              conforme === undefined ? 'url(#seta-neutra)' : conforme ? 'url(#seta-conforme)' : 'url(#seta-nao-conforme)'
            const emHover = hover?.trechoId === t.id
            return (
              <g key={t.id}>
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  strokeWidth={emHover ? 3 : 1.4}
                  markerEnd={marker}
                  className={corClasse}
                  style={{ pointerEvents: 'none', transition: 'stroke-width 0.1s' }}
                />
                {/* faixa invisível mais larga por cima, só pra facilitar hover/clique num traço fino */}
                <line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  strokeWidth={10}
                  stroke="transparent"
                  style={{ cursor: onSelecionarTrecho ? 'pointer' : 'default' }}
                  onMouseEnter={(e) => setHover({ trechoId: t.id, clientX: e.clientX, clientY: e.clientY })}
                  onMouseLeave={() => setHover((h) => (h?.trechoId === t.id ? null : h))}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelecionarTrecho?.(t.id)
                  }}
                />
              </g>
            )
          })}
          {[...pontos.entries()].map(([id, p]) => {
            const cabeceira = !idsComEntrada.has(id)
            const saida = !idsComSaida.has(id)
            const raio = cabeceira || saida ? 4.5 : 2.5
            const corClasse = saida ? 'fill-accent-blue' : cabeceira ? 'fill-accent-amber' : 'fill-text-secondary'
            return (
              <circle key={id} cx={p.x} cy={p.y} r={raio} className={corClasse}>
                <title>{nomePorId.get(id) ?? ''}</title>
              </circle>
            )
          })}
        </g>
      </svg>

      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-1 rounded-md bg-surface/90 p-2.5 text-[10px] text-text-secondary shadow">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-amber" /> Cabeceira
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-accent-blue" /> Saída da rede
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-accent-green" /> Trecho conforme
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 bg-accent-red" /> Trecho não conforme
        </div>
        <div className="mt-1 text-[9px] text-text-secondary/80">
          arraste para mover · scroll para zoom{onSelecionarTrecho ? ' · clique num trecho pra editar' : ''}
        </div>
      </div>

      {trechoHover &&
        containerRef.current &&
        (() => {
          const rect = containerRef.current.getBoundingClientRect()
          const left = hover!.clientX - rect.left + 12
          const top = hover!.clientY - rect.top + 12
          const conforme = conformidadePorTrecho.get(trechoHover.id) ?? undefined
          return (
            <div
              className="pointer-events-none absolute z-10 max-w-[220px] rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] shadow-lg"
              style={{ left, top }}
            >
              <div className="font-medium text-text-primary">{trechoHover.nome}</div>
              <div className="text-text-secondary">
                {nomePorId.get(trechoHover.caixa_montante_id) ?? '?'} → {nomePorId.get(trechoHover.caixa_jusante_id) ?? '?'}
              </div>
              <div className={conforme === undefined ? 'text-text-secondary' : conforme ? 'text-accent-green' : 'text-accent-red'}>
                {conforme === undefined ? 'sem cálculo' : conforme ? 'conforme' : 'não conforme'}
              </div>
            </div>
          )
        })()}

      <button
        onClick={resetView}
        className="absolute right-2 top-2 rounded-md border border-border bg-surface px-2 py-1 text-[10px] font-medium text-text-secondary shadow hover:text-text-primary"
      >
        Centralizar
      </button>
    </div>
  )
}
