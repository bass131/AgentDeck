// M10 G5 — 화면용 그래프 계약. main이 열린 작업 폴더의 템플릿을 이 꼴로 바꿔 loop.graph로 준다(보기 전용).
// position은 그래프 좌표의 카드 왼쪽 위다. 지금은 main의 자동 배치가 채우고, 뒤의 그래프 편집이 같은 칸을 고친다.
// 카드 크기는 main의 배치와 화면의 선 그리기가 같이 쓴다.

export const GRAPH_CARD = { width: 120, height: 52 } as const

// work 작업 노드 · action 실행기 동작 · rule·model·human 판정 주체별 게이트
export type GraphNodeKind = 'work' | 'action' | 'rule' | 'model' | 'human'

export interface GraphPosition { x: number; y: number }

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
  onFail: { goto: string; limit: number } | null
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
