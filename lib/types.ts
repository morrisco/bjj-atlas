export type NodeType = 'position' | 'submission' | 'sweep' | 'escape'

export interface BJJNode {
  id: string
  name: string
  type: NodeType
  rank: number
  desc: string
}

export interface BJJEdge {
  id: string
  source: string
  target: string
  label: string
}
