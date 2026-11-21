// 노드마다 메모리 안의 최근 판정 고리다. 파일로 남기지 않는다(앱을 끄면 사라진다).
// 입력 요약은 자격 증명을 가리고(maskCredentials) 길이를 자른다.
// 권한 콜백 노드는 runPermissionNodes가, 훅 노드(엔진 경로 잠금·병합 거부)는 훅을 조립하는 곳(sdkOptions)이 감싸 쌓는다.
import { maskCredentials } from '@main/08_Git/git'

export const VERDICT_RING = 50
export const VERDICT_INPUT_MAX = 200

export type VerdictResult = 'allow' | 'ask' | 'deny'

interface NodeVerdict {
  at: number
  nodeId: string
  tool: string
  input: string
  result: VerdictResult
  reason: string
}

const rings = new Map<string, NodeVerdict[]>()

function summarize(input: unknown): string {
  let text: string
  try {
    text = typeof input === 'string' ? input : JSON.stringify(input) ?? ''
  } catch {
    text = String(input)
  }
  return maskCredentials(text).slice(0, VERDICT_INPUT_MAX)
}

export function recordVerdict(nodeId: string, tool: string, input: unknown, result: VerdictResult, reason = ''): void {
  const ring = rings.get(nodeId) ?? []
  ring.push({ at: Date.now(), nodeId, tool, input: summarize(input), result, reason })
  if (ring.length > VERDICT_RING) ring.splice(0, ring.length - VERDICT_RING)
  rings.set(nodeId, ring)
}

export function recentVerdicts(nodeId: string): NodeVerdict[] {
  return [...(rings.get(nodeId) ?? [])]
}

export function verdictCounts(): Record<string, number> {
  return Object.fromEntries([...rings].map(([id, ring]) => [id, ring.length]))
}

export function clearVerdicts(): void {
  rings.clear()
}

interface HookOut {
  hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string }
}

// PreToolUse 훅 matcher를 감싼다 — 거부를 낸 호출만 그 노드에 쌓고, 출력과 나머지 칸(timeout·onFailure)은 그대로 둔다.
export function withVerdictLog<M extends { hooks: ((input: never, ...rest: never[]) => Promise<unknown>)[] }>(nodeId: string, matcher: M): M {
  const hooks = matcher.hooks.map((hook) => async (input: never, ...rest: never[]) => {
    const out = (await hook(input, ...rest)) as HookOut
    const decision = out?.hookSpecificOutput?.permissionDecision
    if (decision === 'deny' || decision === 'ask' || decision === 'allow') {
      const i = input as { tool_name?: unknown; tool_input?: unknown }
      recordVerdict(nodeId, typeof i?.tool_name === 'string' ? i.tool_name : '', i?.tool_input, decision, out.hookSpecificOutput?.permissionDecisionReason ?? '')
    }
    return out
  })
  return { ...matcher, hooks }
}
