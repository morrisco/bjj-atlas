'use client'

import { useState, useEffect, useRef, useCallback, useMemo, useTransition } from 'react'
import { saveNodeWithEdges, removeNode } from '@/lib/actions'
import type { BJJNode, BJJEdge, NodeType } from '@/lib/types'

// ─── Types ────────────────────────────────────────────────────────────────────

type Layout = 'dag' | 'force' | 'radial'
interface Vec2 { x: number; y: number }
type Positions = Record<string, Vec2>

// ─── Constants ────────────────────────────────────────────────────────────────

const NODE_R = 38
const ARROW_SIZE = 8
const TRANS_MS = 500

const TYPE_COLOR: Record<NodeType, { bg: string; border: string; text: string }> = {
  position:   { bg: '#1e3a5f', border: '#3b82f6', text: '#bfdbfe' },
  submission: { bg: '#4c1010', border: '#ef4444', text: '#fecaca' },
  sweep:      { bg: '#14532d', border: '#22c55e', text: '#bbf7d0' },
  escape:     { bg: '#451a03', border: '#f59e0b', text: '#fde68a' },
}

const TYPE_LABELS: Record<NodeType, string> = {
  position: 'Position', submission: 'Submission', sweep: 'Sweep', escape: 'Transition',
}

const RANK_LABELS = ['Guard Positions', 'Attacks & Transitions', 'Results', 'Terminal']

// ─── Seed data (fallback when Supabase is not configured) ─────────────────────

const SEED_NODES: BJJNode[] = [
  { id: 'closed-guard',   name: 'Closed Guard',    type: 'position',   rank: 0, desc: 'Full guard with legs locked around the opponent\'s torso.' },
  { id: 'half-guard',     name: 'Half Guard',      type: 'position',   rank: 0, desc: 'One of the opponent\'s legs trapped between yours.' },
  { id: 'butterfly',      name: 'Butterfly Guard', type: 'position',   rank: 0, desc: 'Seated guard with instep hooks inside opponent\'s thighs.' },
  { id: 'open-guard',     name: 'Open Guard',      type: 'position',   rank: 0, desc: 'Guard with legs open, using frames and grips to control distance.' },
  { id: 'triangle',       name: 'Triangle Choke',  type: 'submission', rank: 1, desc: 'Figure-four leg configuration around the opponent\'s neck and one arm.' },
  { id: 'armbar',         name: 'Armbar',          type: 'submission', rank: 1, desc: 'Hyperextend the opponent\'s elbow across your hip.' },
  { id: 'kimura',         name: 'Kimura',          type: 'submission', rank: 1, desc: 'Figure-four shoulder lock applied behind the back.' },
  { id: 'guillotine',     name: 'Guillotine',      type: 'submission', rank: 1, desc: 'Front headlock choke cutting across the neck.' },
  { id: 'sweep-mount',    name: 'Sweep to Mount',  type: 'sweep',      rank: 1, desc: 'Reverse position from guard to achieve top mount.' },
  { id: 'back-take',      name: 'Back Take',       type: 'escape',     rank: 1, desc: 'Transition to back control with body triangle or hooks.' },
  { id: 'mount',          name: 'Mount',           type: 'position',   rank: 2, desc: 'Dominant top position straddling the opponent\'s torso.' },
  { id: 'back-mount',     name: 'Back Mount',      type: 'position',   rank: 2, desc: 'Rear mount with hooks in, controlling the back.' },
  { id: 'side-control',   name: 'Side Control',    type: 'position',   rank: 2, desc: 'Crossbody top position applying chest-to-chest pressure.' },
  { id: 'tap',            name: 'Tap Out',         type: 'submission', rank: 3, desc: 'Opponent submits — the match-ending result of a successful finish.' },
  { id: 'guard-recovery', name: 'Guard Recovery',  type: 'escape',     rank: 3, desc: 'Return to guard or regain feet from bottom position.' },
]

const SEED_EDGES: BJJEdge[] = [
  { id: 'e1',  source: 'closed-guard', target: 'triangle',      label: 'attack' },
  { id: 'e2',  source: 'closed-guard', target: 'armbar',        label: 'attack' },
  { id: 'e3',  source: 'closed-guard', target: 'kimura',        label: 'attack' },
  { id: 'e4',  source: 'closed-guard', target: 'guillotine',    label: 'attack' },
  { id: 'e5',  source: 'closed-guard', target: 'sweep-mount',   label: 'sweep' },
  { id: 'e6',  source: 'half-guard',   target: 'sweep-mount',   label: 'sweep' },
  { id: 'e7',  source: 'butterfly',    target: 'sweep-mount',   label: 'sweep' },
  { id: 'e8',  source: 'open-guard',   target: 'back-take',     label: 'transition' },
  { id: 'e9',  source: 'half-guard',   target: 'back-take',     label: 'transition' },
  { id: 'e10', source: 'sweep-mount',  target: 'mount',         label: 'result' },
  { id: 'e11', source: 'back-take',    target: 'back-mount',    label: 'result' },
  { id: 'e12', source: 'mount',        target: 'armbar',        label: 'attack' },
  { id: 'e13', source: 'mount',        target: 'kimura',        label: 'attack' },
  { id: 'e14', source: 'side-control', target: 'armbar',        label: 'attack' },
  { id: 'e15', source: 'side-control', target: 'kimura',        label: 'attack' },
  { id: 'e16', source: 'back-mount',   target: 'armbar',        label: 'attack' },
  { id: 'e17', source: 'triangle',     target: 'tap',           label: 'finish' },
  { id: 'e18', source: 'armbar',       target: 'tap',           label: 'finish' },
  { id: 'e19', source: 'kimura',       target: 'tap',           label: 'finish' },
  { id: 'e20', source: 'guillotine',   target: 'tap',           label: 'finish' },
  { id: 'e21', source: 'closed-guard', target: 'guard-recovery',label: 'escape' },
]

// ─── Math helpers ─────────────────────────────────────────────────────────────

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
}
function lerp(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}
function wrapLabel(name: string, maxLen = 10): string[] {
  const words = name.split(' ')
  const lines: string[] = ['']
  for (const w of words) {
    const candidate = lines[lines.length - 1] ? lines[lines.length - 1] + ' ' + w : w
    if (candidate.length <= maxLen) lines[lines.length - 1] = candidate
    else if (lines.length < 2) lines.push(w)
    else break
  }
  return lines.filter(Boolean)
}

// ─── Layout engines ───────────────────────────────────────────────────────────

function computeDag(nodes: BJJNode[], W: number, H: number): Positions {
  const byRank: Record<number, BJJNode[]> = { 0: [], 1: [], 2: [], 3: [] }
  nodes.forEach(n => (byRank[n.rank] ??= []).push(n))
  const pos: Positions = {}
  ;[0, 1, 2, 3].forEach(r => {
    const group = byRank[r] ?? []
    group.forEach((n, i) => {
      pos[n.id] = { x: W * (i + 1) / (group.length + 1), y: H * (r + 1) / 5 }
    })
  })
  return pos
}

function computeRadial(nodes: BJJNode[], W: number, H: number): Positions {
  const cx = W / 2, cy = H / 2
  const s = Math.min(W, H) / 900
  const radii = [70, 180, 290, 375].map(r => r * s)
  const byRank: Record<number, BJJNode[]> = {}
  nodes.forEach(n => (byRank[n.rank] ??= []).push(n))
  const pos: Positions = {}
  ;[0, 1, 2, 3].forEach(r => {
    const group = byRank[r] ?? []
    group.forEach((n, i) => {
      const angle = (2 * Math.PI * i / group.length) - Math.PI / 2
      pos[n.id] = { x: cx + radii[r] * Math.cos(angle), y: cy + radii[r] * Math.sin(angle) }
    })
  })
  return pos
}

function tickForce(
  nodes: BJJNode[], edges: BJJEdge[],
  pos: Positions, vel: Positions,
  W: number, H: number, pinned: string | null
): void {
  const ideal = Math.sqrt((W * H) / Math.max(nodes.length, 1)) * 0.9
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i].id, b = nodes[j].id
      if (!pos[a] || !pos[b]) continue
      const dx = pos[b].x - pos[a].x, dy = pos[b].y - pos[a].y
      const d2 = dx * dx + dy * dy + 0.01
      const d = Math.sqrt(d2)
      const f = Math.min((ideal * ideal) / d2 * 2.5, 60)
      const fx = (dx / d) * f, fy = (dy / d) * f
      if (a !== pinned) { vel[a].x -= fx; vel[a].y -= fy }
      if (b !== pinned) { vel[b].x += fx; vel[b].y += fy }
    }
  }
  edges.forEach(e => {
    if (!pos[e.source] || !pos[e.target]) return
    const dx = pos[e.target].x - pos[e.source].x, dy = pos[e.target].y - pos[e.source].y
    const d = Math.sqrt(dx * dx + dy * dy) || 1
    const f = (d - ideal * 1.1) * 0.018
    const fx = (dx / d) * f, fy = (dy / d) * f
    if (e.source !== pinned) { vel[e.source].x += fx; vel[e.source].y += fy }
    if (e.target !== pinned) { vel[e.target].x -= fx; vel[e.target].y -= fy }
  })
  nodes.forEach(n => {
    if (n.id === pinned || !pos[n.id]) return
    vel[n.id].x += (W / 2 - pos[n.id].x) * 0.004
    vel[n.id].y += (H / 2 - pos[n.id].y) * 0.004
    vel[n.id].x *= 0.82; vel[n.id].y *= 0.82
    pos[n.id].x = Math.max(NODE_R + 8, Math.min(W - NODE_R - 8, pos[n.id].x + vel[n.id].x))
    pos[n.id].y = Math.max(NODE_R + 8, Math.min(H - NODE_R - 8, pos[n.id].y + vel[n.id].y))
  })
}

function buildEdgePath(s: Vec2, t: Vec2, curve = 28): string {
  const dx = t.x - s.x, dy = t.y - s.y
  const d = Math.sqrt(dx * dx + dy * dy) || 1
  const sx = s.x + (dx / d) * NODE_R, sy = s.y + (dy / d) * NODE_R
  const tx = t.x - (dx / d) * (NODE_R + ARROW_SIZE), ty = t.y - (dy / d) * (NODE_R + ARROW_SIZE)
  const cpx = (sx + tx) / 2 - (dy / d) * curve
  const cpy = (sy + ty) / 2 + (dx / d) * curve
  return `M${sx},${sy} Q${cpx},${cpy} ${tx},${ty}`
}

// ─── Component ────────────────────────────────────────────────────────────────

interface MoveForm {
  name: string; type: NodeType; rank: number; desc: string; from: string[]; to: string[]
}
const EMPTY_FORM: MoveForm = { name: '', type: 'position', rank: 0, desc: '', from: [], to: [] }

interface Props {
  initialNodes?: BJJNode[]
  initialEdges?: BJJEdge[]
}

export default function BJJAtlas({ initialNodes, initialEdges }: Props) {
  const [nodes, setNodes]       = useState<BJJNode[]>(initialNodes ?? SEED_NODES)
  const [edges, setEdges]       = useState<BJJEdge[]>(initialEdges ?? SEED_EDGES)
  const [layout, setLayout]     = useState<Layout>('dag')
  const [displayPos, setDisplayPos] = useState<Positions>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filterTypes, setFilterTypes] = useState<Set<NodeType>>(
    new Set<NodeType>(['position', 'submission', 'sweep', 'escape'])
  )
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm]           = useState<MoveForm>(EMPTY_FORM)
  const [formError, setFormError] = useState<string | null>(null)
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 })
  const [size, setSize]           = useState({ W: 800, H: 600 })
  const [isPending, startTransition] = useTransition()

  const svgRef       = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Stable refs to avoid stale closures in the rAF loop / event handlers
  const layoutRef    = useRef<Layout>('dag'); layoutRef.current = layout
  const transformRef = useRef(transform);     transformRef.current = transform
  const nodesRef     = useRef(nodes);         nodesRef.current = nodes
  const edgesRef     = useRef(edges);         edgesRef.current = edges
  const sizeRef      = useRef(size);          sizeRef.current = size
  const displayPosRef = useRef<Positions>({})
  const dagPosRef    = useRef<Positions>({})
  const radialPosRef = useRef<Positions>({})

  const simPos   = useRef<Positions>({})
  const simVel   = useRef<Positions>({})
  const pinnedId = useRef<string | null>(null)
  const animRef  = useRef<{ from: Positions; to: Positions; start: number } | null>(null)
  const rafRef   = useRef<number>(0)

  const panState   = useRef({ active: false, sx: 0, sy: 0, stx: 0, sty: 0 })
  const dragState  = useRef({ nodeId: null as string | null, moved: false })
  const clickStart = useRef<{ x: number; y: number } | null>(null)

  // ── Resize observer ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const ro = new ResizeObserver(([entry]) =>
      setSize({ W: entry.contentRect.width, H: entry.contentRect.height })
    )
    ro.observe(el); return () => ro.disconnect()
  }, [])

  // Non-passive wheel listener
  useEffect(() => {
    const el = containerRef.current; if (!el) return
    const handler = (e: WheelEvent) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 0.9
      const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return
      const mx = e.clientX - rect.left, my = e.clientY - rect.top
      setTransform(t => ({
        scale: Math.max(0.15, Math.min(6, t.scale * factor)),
        x: mx - (mx - t.x) * factor,
        y: my - (my - t.y) * factor,
      }))
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [])

  // ── Layout positions ─────────────────────────────────────────────────────────
  const dagPos    = useMemo(() => computeDag(nodes, size.W, size.H),    [nodes, size])
  const radialPos = useMemo(() => computeRadial(nodes, size.W, size.H), [nodes, size])
  dagPosRef.current    = dagPos
  radialPosRef.current = radialPos

  useEffect(() => {
    nodes.forEach(n => {
      if (!simPos.current[n.id]) {
        simPos.current[n.id] = { x: size.W / 2 + (Math.random() - 0.5) * 200, y: size.H / 2 + (Math.random() - 0.5) * 200 }
        simVel.current[n.id] = { x: 0, y: 0 }
      }
    })
  }, [nodes, size])

  const initialized = useRef(false)
  useEffect(() => {
    if (!initialized.current && Object.keys(dagPos).length > 0) {
      initialized.current = true
      const p = { ...dagPos }
      displayPosRef.current = p
      setDisplayPos(p)
      nodes.forEach(n => { simPos.current[n.id] = { ...dagPos[n.id] }; simVel.current[n.id] = { x: 0, y: 0 } })
    }
  }, [dagPos, nodes])

  // ── Layout switching ─────────────────────────────────────────────────────────
  const changeLayout = useCallback((next: Layout) => {
    const from = { ...displayPosRef.current }
    let to: Positions
    if (next === 'dag') to = dagPosRef.current
    else if (next === 'radial') to = radialPosRef.current
    else {
      Object.entries(from).forEach(([id, p]) => { simPos.current[id] = { ...p }; simVel.current[id] = { x: 0, y: 0 } })
      to = from
    }
    animRef.current = { from, to, start: performance.now() }
    setLayout(next)
  }, [])

  // ── Animation loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const now = performance.now()
      const anim = animRef.current
      const curLayout = layoutRef.current
      const { W, H } = sizeRef.current
      const ns = nodesRef.current, es = edgesRef.current
      let newPos: Positions | null = null

      if (curLayout === 'force') {
        tickForce(ns, es, simPos.current, simVel.current, W, H, pinnedId.current)
        if (anim) {
          const e = easeInOut(Math.min((now - anim.start) / TRANS_MS, 1))
          const blended: Positions = {}
          ns.forEach(n => { blended[n.id] = lerp(anim.from[n.id] ?? simPos.current[n.id], simPos.current[n.id], e) })
          newPos = blended
          if ((now - anim.start) >= TRANS_MS) animRef.current = null
        } else {
          newPos = { ...simPos.current }
        }
      } else if (anim) {
        const t = Math.min((now - anim.start) / TRANS_MS, 1)
        const e = easeInOut(t)
        const blended: Positions = {}
        ns.forEach(n => {
          const from = anim.from[n.id] ?? anim.to[n.id]
          blended[n.id] = lerp(from, anim.to[n.id] ?? from, e)
        })
        newPos = blended
        if (t >= 1) animRef.current = null
      }

      if (newPos) { displayPosRef.current = newPos; setDisplayPos({ ...newPos }) }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  // ── Coordinate helpers ───────────────────────────────────────────────────────
  const screenToWorld = useCallback((cx: number, cy: number): Vec2 => {
    const t = transformRef.current
    const rect = svgRef.current!.getBoundingClientRect()
    return { x: (cx - rect.left - t.x) / t.scale, y: (cy - rect.top - t.y) / t.scale }
  }, [])

  // ── Pointer handlers ─────────────────────────────────────────────────────────
  const onSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const t = transformRef.current
    panState.current = { active: true, sx: e.clientX, sy: e.clientY, stx: t.x, sty: t.y }
  }, [])

  const onSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const { nodeId } = dragState.current
    if (nodeId && layoutRef.current === 'force') {
      dragState.current.moved = true
      const w = screenToWorld(e.clientX, e.clientY)
      simPos.current[nodeId] = w
      simVel.current[nodeId] = { x: 0, y: 0 }
    } else if (panState.current.active) {
      const dx = e.clientX - panState.current.sx, dy = e.clientY - panState.current.sy
      setTransform(t => ({ ...t, x: panState.current.stx + dx, y: panState.current.sty + dy }))
    }
  }, [screenToWorld])

  const onSvgMouseUp = useCallback(() => {
    panState.current.active = false
    dragState.current = { nodeId: null, moved: false }
    pinnedId.current = null
  }, [])

  const onNodeMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    clickStart.current = { x: e.clientX, y: e.clientY }
    panState.current.active = false
    if (layoutRef.current === 'force') {
      dragState.current = { nodeId: id, moved: false }
      pinnedId.current = id
    }
  }, [])

  const onNodeMouseUp = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    const start = clickStart.current
    const { moved } = dragState.current
    dragState.current = { nodeId: null, moved: false }
    pinnedId.current = null; clickStart.current = null
    if (start && !moved) {
      const dx = e.clientX - start.x, dy = e.clientY - start.y
      if (dx * dx + dy * dy < 36) setSelectedId(cur => cur === id ? null : id)
    }
  }, [])

  // ── CRUD actions ─────────────────────────────────────────────────────────────

  const openAdd = useCallback(() => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError(null)
    setModalOpen(true)
  }, [])

  const openEdit = useCallback((node: BJJNode) => {
    const fromIds = edgesRef.current.filter(e => e.target === node.id).map(e => e.source)
    const toIds   = edgesRef.current.filter(e => e.source === node.id).map(e => e.target)
    setEditingId(node.id)
    setForm({ name: node.name, type: node.type, rank: node.rank, desc: node.desc, from: fromIds, to: toIds })
    setFormError(null)
    setModalOpen(true)
  }, [])

  const closeModal = useCallback(() => {
    setModalOpen(false); setEditingId(null); setForm(EMPTY_FORM); setFormError(null)
  }, [])

  const submitForm = useCallback(() => {
    if (!form.name.trim()) return
    setFormError(null)
    startTransition(async () => {
      const nodeInput = { id: editingId ?? undefined, name: form.name.trim(), type: form.type, rank: form.rank, desc: form.desc.trim() }
      const result = await saveNodeWithEdges(nodeInput, form.from, form.to)
      if (result.error) { setFormError(result.error); return }

      const { node, addedEdges, removedEdgeIds } = result
      setNodes(ns => editingId ? ns.map(n => n.id === editingId ? node : n) : [...ns, node])
      if (removedEdgeIds.length) setEdges(es => es.filter(e => !removedEdgeIds.includes(e.id)))
      if (addedEdges.length)    setEdges(es => [...es, ...addedEdges])
      closeModal()
    })
  }, [form, editingId, closeModal])

  const handleDelete = useCallback((id: string) => {
    startTransition(async () => {
      const result = await removeNode(id)
      if (result.error) return // TODO: surface error toast
      setNodes(ns => ns.filter(n => n.id !== id))
      setEdges(es => es.filter(e => e.source !== id && e.target !== id))
      if (selectedId === id) setSelectedId(null)
    })
  }, [selectedId])

  // ── Derived state ────────────────────────────────────────────────────────────
  const visibleNodes = useMemo(() => nodes.filter(n => filterTypes.has(n.type)), [nodes, filterTypes])
  const visibleIds   = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes])
  const visibleEdges = useMemo(() => edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target)), [edges, visibleIds])
  const selectedNode = selectedId ? nodes.find(n => n.id === selectedId) ?? null : null
  const incoming     = useMemo(() => selectedId ? edges.filter(e => e.target === selectedId) : [], [edges, selectedId])
  const outgoing     = useMemo(() => selectedId ? edges.filter(e => e.source === selectedId) : [], [edges, selectedId])

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen bg-gray-950 text-gray-100 select-none overflow-hidden">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">View</span>
        {(['dag', 'force', 'radial'] as Layout[]).map(m => (
          <button key={m} onClick={() => changeLayout(m)}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              layout === m ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}>
            {m === 'dag' ? 'Layered' : m === 'force' ? 'Force' : 'Radial'}
          </button>
        ))}
        <div className="w-px h-4 bg-gray-700 mx-1" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-1">Filter</span>
        {(Object.entries(TYPE_LABELS) as [NodeType, string][]).map(([type, label]) => {
          const on = filterTypes.has(type); const c = TYPE_COLOR[type]
          return (
            <button key={type}
              onClick={() => setFilterTypes(ft => { const s = new Set(ft); on ? s.delete(type) : s.add(type); return s })}
              className="px-2.5 py-1 rounded text-xs font-medium transition-all border"
              style={{ background: on ? c.bg : 'transparent', borderColor: c.border, color: on ? c.text : '#4b5563' }}>
              {label}
            </button>
          )
        })}
        <button onClick={openAdd}
          className="ml-auto px-3 py-1 rounded text-xs font-medium bg-indigo-700 hover:bg-indigo-600 text-white transition-colors">
          + Add Move
        </button>
      </div>

      {/* ── Canvas + side panel ── */}
      <div className="flex flex-1 min-h-0">

        <div ref={containerRef} className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing">
          <svg ref={svgRef} className="w-full h-full"
            onMouseDown={onSvgMouseDown} onMouseMove={onSvgMouseMove}
            onMouseUp={onSvgMouseUp} onMouseLeave={onSvgMouseUp}>

            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#475569" />
              </marker>
              <marker id="arrow-hi" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#818cf8" />
              </marker>
            </defs>

            {/* Rank labels — fixed in screen space */}
            {layout === 'dag' && [0, 1, 2, 3].map(r => (
              <text key={r} x={8} y={size.H * (r + 1) / 5 * transform.scale + transform.y}
                dominantBaseline="middle" fill="#374151" fontSize={10}
                fontFamily="system-ui, sans-serif" fontWeight="600">
                {RANK_LABELS[r]}
              </text>
            ))}

            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>

              {/* Edges */}
              {visibleEdges.map(e => {
                const s = displayPos[e.source], t = displayPos[e.target]
                if (!s || !t) return null
                const hi = selectedId && (e.source === selectedId || e.target === selectedId)
                return (
                  <path key={e.id} d={buildEdgePath(s, t)} fill="none"
                    stroke={hi ? '#818cf8' : '#334155'} strokeWidth={hi ? 2 : 1.5}
                    markerEnd={hi ? 'url(#arrow-hi)' : 'url(#arrow)'}
                    opacity={selectedId && !hi ? 0.15 : 1} />
                )
              })}

              {/* Edge labels on highlighted edges */}
              {selectedId && visibleEdges.map(e => {
                const s = displayPos[e.source], t = displayPos[e.target]
                if (!s || !t || !(e.source === selectedId || e.target === selectedId) || !e.label) return null
                const d = Math.sqrt((t.x - s.x) ** 2 + (t.y - s.y) ** 2) || 1
                const mx = (s.x + t.x) / 2 - ((t.y - s.y) / d) * 18
                const my = (s.y + t.y) / 2 + ((t.x - s.x) / d) * 18
                return (
                  <text key={`lbl-${e.id}`} x={mx} y={my} textAnchor="middle"
                    dominantBaseline="middle" fill="#818cf8" fontSize={8} fontFamily="system-ui, sans-serif">
                    {e.label}
                  </text>
                )
              })}

              {/* Nodes */}
              {visibleNodes.map(n => {
                const p = displayPos[n.id]; if (!p) return null
                const c = TYPE_COLOR[n.type]
                const isSel = n.id === selectedId
                const isRel = !isSel && selectedId && (incoming.some(e => e.source === n.id) || outgoing.some(e => e.target === n.id))
                const dim = selectedId && !isSel && !isRel
                const lines = wrapLabel(n.name)
                return (
                  <g key={n.id} transform={`translate(${p.x},${p.y})`}
                    onMouseDown={ev => onNodeMouseDown(ev, n.id)}
                    onMouseUp={ev => onNodeMouseUp(ev, n.id)}
                    style={{ cursor: layout === 'force' ? 'grab' : 'pointer' }}>
                    {isSel && <circle r={NODE_R + 7} fill="none" stroke="#818cf8" strokeWidth={2} opacity={0.6} />}
                    {isRel && <circle r={NODE_R + 4} fill="none" stroke={c.border} strokeWidth={1.5} opacity={0.5} />}
                    <circle r={NODE_R} fill={c.bg} stroke={c.border} strokeWidth={isSel ? 2.5 : 1.5} opacity={dim ? 0.2 : 1} />
                    <text textAnchor="middle" fill={c.text} fontSize={lines.length > 1 ? 8 : 9}
                      fontFamily="system-ui, sans-serif" fontWeight="500" opacity={dim ? 0.2 : 1}>
                      {lines.length === 1
                        ? <tspan dominantBaseline="middle">{lines[0]}</tspan>
                        : <><tspan x={0} dy={-5}>{lines[0]}</tspan><tspan x={0} dy={11}>{lines[1]}</tspan></>}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>
        </div>

        {/* ── Side panel ── */}
        {selectedNode && (
          <div className="w-60 bg-gray-900 border-l border-gray-800 flex flex-col overflow-y-auto flex-shrink-0">

            <div className="p-4 border-b border-gray-800">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-gray-100 text-sm leading-snug">{selectedNode.name}</h2>
                <button onClick={() => setSelectedId(null)} className="text-gray-600 hover:text-gray-300 text-xs flex-shrink-0 mt-0.5">✕</button>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded"
                  style={{ background: TYPE_COLOR[selectedNode.type].bg, color: TYPE_COLOR[selectedNode.type].text }}>
                  {TYPE_LABELS[selectedNode.type]}
                </span>
                <span className="text-xs text-gray-600">{RANK_LABELS[selectedNode.rank]}</span>
              </div>
              {selectedNode.desc && (
                <p className="mt-2 text-xs text-gray-400 leading-relaxed">{selectedNode.desc}</p>
              )}
              {/* Edit / Delete */}
              <div className="mt-3 flex gap-2">
                <button onClick={() => openEdit(selectedNode)}
                  className="flex-1 px-2 py-1 rounded text-xs font-medium bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors">
                  Edit
                </button>
                <button
                  onClick={() => { if (confirm(`Delete "${selectedNode.name}"?`)) handleDelete(selectedNode.id) }}
                  disabled={isPending}
                  className="flex-1 px-2 py-1 rounded text-xs font-medium bg-red-950 hover:bg-red-900 text-red-400 transition-colors disabled:opacity-40">
                  {isPending ? '…' : 'Delete'}
                </button>
              </div>
            </div>

            {incoming.length > 0 && (
              <div className="p-4 border-b border-gray-800">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">From</h3>
                {incoming.map(e => {
                  const src = nodes.find(n => n.id === e.source)
                  return src ? (
                    <button key={e.id} onClick={() => setSelectedId(src.id)}
                      className="w-full text-left flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-gray-800 text-gray-300 group">
                      <span>{src.name}</span>
                      <span className="text-gray-600 group-hover:text-gray-500">{e.label}</span>
                    </button>
                  ) : null
                })}
              </div>
            )}

            {outgoing.length > 0 && (
              <div className="p-4">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">To</h3>
                {outgoing.map(e => {
                  const tgt = nodes.find(n => n.id === e.target)
                  return tgt ? (
                    <button key={e.id} onClick={() => setSelectedId(tgt.id)}
                      className="w-full text-left flex items-center justify-between text-xs py-1.5 px-2 rounded hover:bg-gray-800 text-gray-300 group">
                      <span>{tgt.name}</span>
                      <span className="text-gray-600 group-hover:text-gray-500">{e.label}</span>
                    </button>
                  ) : null
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Add / Edit modal ── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={closeModal}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <h2 className="text-sm font-semibold text-gray-100 mb-4">{editingId ? 'Edit Move' : 'Add Move'}</h2>

            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Name</label>
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 placeholder-gray-600"
                  placeholder="e.g. Rear Naked Choke"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Type</label>
                  <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
                    value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as NodeType }))}>
                    {(Object.entries(TYPE_LABELS) as [NodeType, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">Rank</label>
                  <select className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500"
                    value={form.rank} onChange={e => setForm(f => ({ ...f, rank: parseInt(e.target.value) }))}>
                    {RANK_LABELS.map((l, i) => <option key={i} value={i}>{i} — {l}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-400 mb-1 block">Description</label>
                <textarea className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-indigo-500 placeholder-gray-600 resize-none"
                  rows={2} placeholder="Brief description…"
                  value={form.desc} onChange={e => setForm(f => ({ ...f, desc: e.target.value }))} />
              </div>

              {(['from', 'to'] as const).map(dir => (
                <div key={dir}>
                  <label className="text-xs text-gray-400 mb-1.5 block">
                    {dir === 'from' ? 'Incoming (from)' : 'Outgoing (to)'}
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {nodes.filter(n => n.id !== editingId).map(n => {
                      const on = form[dir].includes(n.id)
                      const c = TYPE_COLOR[n.type]
                      return (
                        <button key={n.id}
                          onClick={() => setForm(f => ({ ...f, [dir]: on ? f[dir].filter(id => id !== n.id) : [...f[dir], n.id] }))}
                          className="text-xs px-2 py-0.5 rounded border transition-colors"
                          style={{ background: on ? c.bg : 'transparent', borderColor: c.border, color: on ? c.text : '#4b5563' }}>
                          {n.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {formError && <p className="text-xs text-red-400 bg-red-950/50 px-3 py-2 rounded-lg">{formError}</p>}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={closeModal}
                className="px-4 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors">
                Cancel
              </button>
              <button onClick={submitForm} disabled={!form.name.trim() || isPending}
                className="px-4 py-1.5 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors">
                {isPending ? 'Saving…' : editingId ? 'Save Changes' : 'Add Move'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
