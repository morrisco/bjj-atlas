import { cookies } from 'next/headers'
import { createClient } from '@/utils/supabase/server'
import BJJAtlas from './components/BJJAtlas'
import type { BJJNode, BJJEdge } from '@/lib/types'

export default async function Home() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return <BJJAtlas />
  }

  const supabase = createClient(await cookies())

  const [{ data: nodeRows }, { data: edgeRows }] = await Promise.allSettled([
    supabase.from('nodes').select('*').order('rank').order('name'),
    supabase.from('edges').select('*'),
  ]).then(([n, e]) => [
    n.status === 'fulfilled' ? n.value : { data: null },
    e.status === 'fulfilled' ? e.value : { data: null },
  ])

  const nodes = nodeRows?.map((r): BJJNode => ({
    id: r.id, name: r.name, type: r.type, rank: r.rank, desc: r.description ?? '',
  }))

  const edges = edgeRows?.map((r): BJJEdge => ({
    id: r.id, source: r.source, target: r.target, label: r.label ?? '',
  }))

  return <BJJAtlas initialNodes={nodes ?? undefined} initialEdges={edges ?? undefined} />
}
