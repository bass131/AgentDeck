// 노드는 앞에서부터 보고, 처음 정한 노드의 결정이 이긴다. 아무 노드도 정하지 않으면 카드(사람에게 올림)다.

// 사람에게 올릴 호출의 판별. 공개 타입(sdk.d.ts의 CanUseTool)의 options에는 훅 유래를 알리는 필드가 없다.
// 블랙박스 실측(독립 clone, default·acceptEdits·bypassPermissions·실행 중 auto)에서
//   훅 ask는 suggestions가 언제나 없었다. decisionReason은 settings allow 규칙과 겹친 `git push origin HEAD:master`에만 왔고,
//   settings ask 규칙과 겹친 `gh release --help`·`npm publish --help`에는 오지 않았다.
//   일반 질의는 언제나 규칙 제안이 한 개 이상 붙어 왔다. 사유는 없을 수 있었다(default의 Write).
// 그래서 사유가 아니라 규칙 제안으로 가른다. 제안이 비어 있지 않은 배열이 아니면 모드와 관계없이 카드로 보낸다(fail-closed).
// 민감 파일 안전 검사(suggestions: [])와 옵션 없는 호출도 여기에 걸린다 — 모르는 꼴은 허용으로 떨어지지 않는다.
import { ENGINE_PATH_NODES } from './enginePathLock'
import { MERGE_DENY_NODE } from './mergeDeny'
import { recordVerdict, type VerdictResult } from './verdictLog'

const VERDICT_OF: Record<Exclude<NodeDecision['kind'], 'pass'>, VerdictResult> = {
  allow: 'allow',
  question: 'ask',
  card: 'ask',
  'orchestration-denied': 'deny',
}

export interface Escalation {
  reason?: string
}

export interface CanUseToolOptions {
  signal?: AbortSignal
  toolUseID?: string
  decisionReason?: string
  suggestions?: unknown[]
}

export function escalationOf(options?: CanUseToolOptions): Escalation | undefined {
  const suggestions = options?.suggestions
  if (Array.isArray(suggestions) && suggestions.length > 0) return undefined
  const reason = options?.decisionReason
  return typeof reason === 'string' && reason.trim() !== '' ? { reason } : {}
}

const READONLY_TOOLS: ReadonlySet<string> = new Set([
  'Read', 'Grep', 'Glob', 'NotebookRead', 'WebFetch', 'WebSearch', 'TodoWrite', 'Task', 'Agent',
  'TaskCreate', 'TaskUpdate', 'TaskList', 'TaskGet', 'TaskOutput', 'BashOutput'
])

const MUTATING_TOOLS: ReadonlySet<string> = new Set([
  'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'TaskStop', 'KillShell', 'KillBash'
])

export const ORCHESTRATION_TOOLS = ['Workflow'] as const

// 한 번의 판정에 노드가 읽는 것. mode는 판정하는 순간의 모드다(실행 중 전환을 반영한 값).
// orchestration은 읽는 쪽이 접근할 때만 계산될 수 있다(권한 콜백은 getter로 넘긴다 — Workflow 노드만 읽는다).
export interface PermissionContext {
  readonly toolName: string
  readonly input: Record<string, unknown>
  readonly options?: CanUseToolOptions
  readonly mode: string | undefined
  readonly orchestration: boolean
}

// 노드 하나의 결정. pass는 「다음 노드로」다.
type NodeDecision =
  | { kind: 'pass' }
  | { kind: 'allow' }
  | { kind: 'question' }
  | { kind: 'orchestration-denied' }
  | { kind: 'card'; escalation?: Escalation }

// 등록부 전체의 판정. nodeId는 정한 노드(카드 기본값이면 null)다. deny는 노드 실패 정책으로만 생긴다.
type PermissionVerdict =
  | { kind: 'allow'; nodeId: string }
  | { kind: 'question'; nodeId: string }
  | { kind: 'orchestration-denied'; nodeId: string }
  | { kind: 'card'; nodeId: string | null; escalation?: Escalation }
  | { kind: 'deny'; nodeId: string; message: string }

// 켜짐 상태는 노드가 아니라 사용자 설정(controlsStore.ts의 controls.json)이 갖는다. locked가 참이면 끌 수 없다.
export interface ControlNodeInfo {
  readonly id: string
  readonly name: string
  // canUseTool: 권한 콜백 · permissionRules: 세션을 열 때 넣는 인라인 규칙 · preToolUse: SDK 훅 콜백
  readonly point: 'canUseTool' | 'permissionRules' | 'preToolUse'
  // 판정 주체는 노드 자신이 무엇으로 정하는가다. 결과가 ask(카드)여도 노드는 규칙으로 정하고, 카드의 답은 사람이 한다.
  readonly judge: 'rule' | 'model' | 'human'
  readonly results: readonly ('allow' | 'ask' | 'deny' | 'notify' | 'transition')[]
  // 지금은 L2다 — 앱 소스(이 파일)를 고치면 노드가 꺼진다. 실행 트리가 앱 소스와 분리되면 L1로 올린다.
  readonly protection: 'L0' | 'L1' | 'L2' | 'L3'
  // 꺼지면 다음 노드로 넘어가 결국 카드가 되는 허용 노드 셋만 풀었다 — 끄는 쪽이 늘 더 엄격하다.
  readonly locked: boolean
  readonly onFailure: 'block'
  // 동기 판정이라 노드 자신은 기다리지 않는다 — null은 「시간 상한 없음」이 아니라 「기다리는 일이 없음」이다.
  // 카드의 사람 응답 대기에는 시간 상한이 없다. 이것은 노드가 아니라 카드 대기(permissionCoordinator)의 성질이다.
  readonly timeoutMs: number | null
}

export interface ControlNode extends ControlNodeInfo {
  decide(ctx: PermissionContext): NodeDecision
}

const BUILT_IN = {
  point: 'canUseTool',
  judge: 'rule',
  protection: 'L2',
  locked: true,
  onFailure: 'block',
  timeoutMs: null,
} as const

function builtIn(node: Omit<ControlNode, keyof typeof BUILT_IN> & { locked?: false }): ControlNode {
  return Object.freeze({ ...BUILT_IN, ...node, results: Object.freeze([...node.results]) })
}

export const PERMISSION_NODES: readonly ControlNode[] = Object.freeze([
  builtIn({
    id: 'ask-question',
    name: '에이전트 질문을 질문 카드로',
    results: ['ask'],
    decide: (c) => (c.toolName === 'AskUserQuestion' ? { kind: 'question' } : { kind: 'pass' }),
  }),
  builtIn({
    id: 'workflow-gate',
    name: '오케스트레이션이 꺼져 있으면 Workflow 거부, 켜져 있으면 카드',
    results: ['deny', 'ask'],
    decide: (c) => {
      if (!(ORCHESTRATION_TOOLS as readonly string[]).includes(c.toolName)) return { kind: 'pass' }
      return c.orchestration ? { kind: 'card' } : { kind: 'orchestration-denied' }
    },
  }),
  builtIn({
    id: 'no-suggestion-card',
    name: '규칙 제안 없는 호출(가드 질문 등)은 모드와 관계없이 카드',
    results: ['ask'],
    decide: (c) => {
      const escalation = escalationOf(c.options)
      return escalation !== undefined ? { kind: 'card', escalation } : { kind: 'pass' }
    },
  }),
  builtIn({
    id: 'mode-auto-bypass-allow',
    name: '자동 모드는 허용',
    results: ['allow'],
    locked: false,
    // Bypass 모드에서는 SDK가 이 콜백을 부르지 않는다(실측). id는 저장된 켬·끔의 열쇠라 옛 이름 그대로 둔다
    decide: (c) => (c.mode === 'auto' || c.mode === 'bypass' ? { kind: 'allow' } : { kind: 'pass' }),
  }),
  builtIn({
    id: 'readonly-allow',
    name: '읽기 도구는 허용',
    results: ['allow'],
    locked: false,
    decide: (c) => (READONLY_TOOLS.has(c.toolName) ? { kind: 'allow' } : { kind: 'pass' }),
  }),
  builtIn({
    id: 'accept-edits-allow',
    name: '편집 허용 모드의 비편집·비Bash 도구는 허용',
    results: ['allow'],
    locked: false,
    decide: (c) =>
      c.mode === 'acceptEdits' && c.toolName !== 'Bash' && !MUTATING_TOOLS.has(c.toolName)
        ? { kind: 'allow' }
        : { kind: 'pass' },
  }),
])

// 컨트롤 패널이 지점별로 묶어 보인다
export function listControlNodes(): ControlNodeInfo[] {
  const fromCallback = PERMISSION_NODES.map(({ decide: _decide, ...info }) => info)
  return [...fromCallback, ...ENGINE_PATH_NODES, MERGE_DENY_NODE].map((info) => ({ ...info, results: [...info.results] }))
}

const DECISION_KINDS: ReadonlySet<string> = new Set(['pass', 'allow', 'question', 'orchestration-denied', 'card'])

// 던진 것뿐 아니라 잘못된 출력도 실패다
function checkDecision(d: unknown): NodeDecision {
  if (!d || typeof d !== 'object') throw new TypeError(`결정이 객체가 아니다: ${String(d)}`)
  const kind = (d as { kind?: unknown }).kind
  if (typeof kind !== 'string' || !DECISION_KINDS.has(kind)) throw new TypeError(`모르는 결정 kind: ${String(kind)}`)
  return d as NodeDecision
}

export function runPermissionNodes(
  ctx: PermissionContext,
  nodes: readonly ControlNode[] = PERMISSION_NODES
): PermissionVerdict {
  for (const node of nodes) {
    let d: NodeDecision
    try {
      d = checkDecision(node.decide(ctx))
    } catch (err) {
      // 판정하지 못한 호출은 허용으로 떨어지지 않고 카드 없이 거부한다. 원인은 main 로그와 판정 기록(verdictLog)에 남는다.
      console.error(`[controls] 노드 「${node.id}」 판정 실패 — 막는다:`, err instanceof Error ? err.message : err)
      const message = `컨트롤 노드 「${node.id}」가 판정하지 못해 막았습니다.`
      recordVerdict(node.id, ctx.toolName, ctx.input, 'deny', message)
      return { kind: 'deny', nodeId: node.id, message }
    }
    if (d.kind === 'pass') continue
    recordVerdict(node.id, ctx.toolName, ctx.input, VERDICT_OF[d.kind], d.kind)
    if (d.kind === 'card') return { kind: 'card', nodeId: node.id, ...(d.escalation ? { escalation: d.escalation } : {}) }
    return { kind: d.kind, nodeId: node.id }
  }
  return { kind: 'card', nodeId: null }
}
