import { fetchGraph } from '@/lib/actions'
import BJJAtlas from './components/BJJAtlas'

export default async function Home() {
  const graph = await fetchGraph()
  return <BJJAtlas initialNodes={graph?.nodes} initialEdges={graph?.edges} />
}
