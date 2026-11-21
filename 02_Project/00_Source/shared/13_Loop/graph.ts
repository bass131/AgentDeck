// position은 그래프 좌표의 카드 왼쪽 위다. 카드 크기는 main의 배치와 화면의 선 그리기가 같이 쓴다.
export const GRAPH_CARD = { width: 120, height: 52 } as const

// work 작업 노드 · action 실행기 동작 · rule·model·human 판정 주체별 게이트
export type GraphNodeKind = 'work' | 'action' | 'rule' | 'model' | 'human'

interface GraphPosition {x: number; y: number }

export interface LoopGraphNode {
  id: string
  title: string
  kind: GraphNodeKind
  // milestone 마일스톤 구획 · goal 목표 반복 틀 안
  scope: 'milestone' | 'goal'
  role: 'main' | 'worker' | null
  rule: 'commands' | 'grade' | 'ci' | null
  commands: string[]
  // 통과하면 갈 노드(반복 틀의 끝은 틀 다음 노드, 마지막 노드는 null)
  next: string | null
  // limit은 사람 게이트에서 null이다 — 사람의 반려는 USER-INPUT이라 실패로 세지 않는다
  onFail: { goto: string; limit: number | null } | null
  when: { grade: 'strong' | 'weak' } | null
  position: GraphPosition
}

// next 다음 노드 · fail 실패·반려로 되돌아감 · repeat 다음 목표로 반복 틀 처음에 돌아감
export interface LoopGraphEdge { from: string; to: string; kind: 'next' | 'fail' | 'repeat' }

export interface LoopGraph {
  templateId: string
  title: string
  nodes: LoopGraphNode[]
  edges: LoopGraphEdge[]
  goalLoop: { id: string; title: string; nodes: string[] } | null
  // 같은 범위에서 마지막 사람 입력 뒤 실패가 이만큼이면 실행기가 멈춘다(runState.FAIL_LIMIT)
  failLimit: number
}

export type LoopGraphResponse = { ok: true; graph: LoopGraph } | { ok: false; reason: string }
