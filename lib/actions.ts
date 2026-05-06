'use server'

import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import type { BJJNode, BJJEdge } from './types'

type NodeInput = Omit<BJJNode, 'id'> & { id?: string }

export type SaveResult = {
  node: BJJNode
  addedEdges: BJJEdge[]
  removedEdgeIds: string[]
  error?: string
}

export type RemoveResult = { error?: string }

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

function isConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
}

export async function saveNodeWithEdges(
  nodeInput: NodeInput,
  fromIds: string[],
  toIds: string[]
): Promise<SaveResult> {
  const id = nodeInput.id ?? randomUUID()
  const node: BJJNode = { ...nodeInput, id }

  if (!isConfigured()) {
    const addedEdges: BJJEdge[] = [
      ...fromIds.map(src => ({ id: randomUUID(), source: src, target: id, label: 'connects' })),
      ...toIds.map(tgt => ({ id: randomUUID(), source: id, target: tgt, label: 'connects' })),
    ]
    return { node, addedEdges, removedEdgeIds: [] }
  }

  const supabase = createClient(await cookies())

  const { error: nodeErr } = await supabase
    .from('nodes')
    .upsert({ id, name: node.name, type: node.type, rank: node.rank, description: node.desc })

  if (nodeErr) return { node, addedEdges: [], removedEdgeIds: [], error: nodeErr.message }

  const { data: existingRows } = await supabase
    .from('edges')
    .select('*')
    .or(`source.eq.${id},target.eq.${id}`)

  const existing = (existingRows ?? []).map(rowToEdge)
  const currentFrom = existing.filter(e => e.target === id)
  const currentTo   = existing.filter(e => e.source === id)

  const fromToRemove = currentFrom.filter(e => !fromIds.includes(e.source))
  const fromToAdd    = fromIds.filter(src => !currentFrom.some(e => e.source === src))
  const toToRemove   = currentTo.filter(e => !toIds.includes(e.target))
  const toToAdd      = toIds.filter(tgt => !currentTo.some(e => e.target === tgt))

  const removedEdgeIds = [...fromToRemove, ...toToRemove].map(e => e.id)
  if (removedEdgeIds.length) {
    await supabase.from('edges').delete().in('id', removedEdgeIds)
  }

  const newEdgeRows = [
    ...fromToAdd.map(src => ({ id: randomUUID(), source: src, target: id,  label: 'connects' })),
    ...toToAdd.map(tgt  => ({ id: randomUUID(), source: id,  target: tgt,  label: 'connects' })),
  ]
  if (newEdgeRows.length) {
    await supabase.from('edges').insert(newEdgeRows)
  }

  return { node, addedEdges: newEdgeRows.map(rowToEdge), removedEdgeIds }
}

export async function removeNode(id: string): Promise<RemoveResult> {
  if (!isConfigured()) return {}
  const supabase = createClient(await cookies())
  const { error } = await supabase.from('nodes').delete().eq('id', id)
  return error ? { error: error.message } : {}
}
