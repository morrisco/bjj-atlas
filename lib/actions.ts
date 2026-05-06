'use server'

import { randomUUID } from 'crypto'
import { createClient } from './supabase/server'
import type { BJJNode, BJJEdge } from './types'

type NodeInput = Omit<BJJNode, 'id'> & { id?: string }

type SaveResult = {
  node: BJJNode
  addedEdges: BJJEdge[]
  removedEdgeIds: string[]
  error?: string
}

type RemoveResult = {
  error?: string
}

// Maps a DB row (uses `description` column) to BJJNode (uses `desc` field)
function rowToNode(row: Record<string, unknown>): BJJNode {
  return {
    id: row.id as string,
    name: row.name as string,
    type: row.type as BJJNode['type'],
    rank: row.rank as number,
    desc: (row.description ?? '') as string,
  }
}

function rowToEdge(row: Record<string, unknown>): BJJEdge {
  return {
    id: row.id as string,
    source: row.source as string,
    target: row.target as string,
    label: (row.label ?? '') as string,
  }
}

export async function saveNodeWithEdges(
  nodeInput: NodeInput,
  fromIds: string[],
  toIds: string[]
): Promise<SaveResult> {
  const id = nodeInput.id ?? randomUUID()
  const node: BJJNode = { ...nodeInput, id }

  const supabase = createClient()

  // No Supabase — return synthetic result so local state still updates
  if (!supabase) {
    const addedEdges: BJJEdge[] = [
      ...fromIds.map(src => ({ id: randomUUID(), source: src, target: id, label: 'connects' })),
      ...toIds.map(tgt => ({ id: randomUUID(), source: id, target: tgt, label: 'connects' })),
    ]
    return { node, addedEdges, removedEdgeIds: [] }
  }

  // Upsert the node
  const { error: nodeErr } = await supabase
    .from('nodes')
    .upsert({ id, name: node.name, type: node.type, rank: node.rank, description: node.desc })

  if (nodeErr) return { node, addedEdges: [], removedEdgeIds: [], error: nodeErr.message }

  // Fetch existing edges for this node
  const { data: existingRows } = await supabase
    .from('edges')
    .select('*')
    .or(`source.eq.${id},target.eq.${id}`)

  const existing = (existingRows ?? []).map(rowToEdge)

  const currentFrom = existing.filter(e => e.target === id)
  const currentTo   = existing.filter(e => e.source === id)

  // Diff incoming connections
  const fromToRemove = currentFrom.filter(e => !fromIds.includes(e.source))
  const fromToAdd    = fromIds.filter(src => !currentFrom.some(e => e.source === src))

  // Diff outgoing connections
  const toToRemove = currentTo.filter(e => !toIds.includes(e.target))
  const toToAdd    = toIds.filter(tgt => !currentTo.some(e => e.target === tgt))

  const removedEdgeIds = [...fromToRemove, ...toToRemove].map(e => e.id)

  if (removedEdgeIds.length) {
    await supabase.from('edges').delete().in('id', removedEdgeIds)
  }

  const newEdgeRows = [
    ...fromToAdd.map(src => ({ id: randomUUID(), source: src, target: id, label: 'connects' })),
    ...toToAdd.map(tgt => ({ id: randomUUID(), source: id, target: tgt, label: 'connects' })),
  ]

  if (newEdgeRows.length) {
    await supabase.from('edges').insert(newEdgeRows)
  }

  return { node, addedEdges: newEdgeRows.map(rowToEdge), removedEdgeIds }
}

export async function removeNode(id: string): Promise<RemoveResult> {
  const supabase = createClient()
  if (!supabase) return {}

  const { error } = await supabase.from('nodes').delete().eq('id', id)
  // Edges cascade automatically via ON DELETE CASCADE
  return error ? { error: error.message } : {}
}

// ── Initial data fetch (called from page.tsx) ─────────────────────────────────

export async function fetchGraph(): Promise<{ nodes: BJJNode[]; edges: BJJEdge[] } | null> {
  const supabase = createClient()
  if (!supabase) return null

  const [{ data: nodeRows, error: ne }, { data: edgeRows, error: ee }] = await Promise.all([
    supabase.from('nodes').select('*').order('rank').order('name'),
    supabase.from('edges').select('*'),
  ])

  if (ne || ee) return null

  return {
    nodes: (nodeRows ?? []).map(rowToNode),
    edges: (edgeRows ?? []).map(rowToEdge),
  }
}
