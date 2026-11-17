// 엔진 경로 잠금 (M07 G3) — G8 설계 `30_노드-구조.md` 「보호」 2·3을 앱 세션에 넣는다.
// 앱 main은 userData의 engines/<버전>/에서 SDK 코드를 불러 쓴다(10_Engine/engineVersions.ts). 에이전트가 이 폴더나
// 엔진 설정을 고치면 다음 실행부터 판정 코드가 바뀐다. 파일 도구는 인라인 거부 규칙으로, Bash는 훅 콜백으로 막는다.
//
// 근거는 SDK 블랙박스 실측이다(G3 goal 검증 기록 1단계). 공개 query()가 돌려준 permission_denials와 파일 존재 여부로 봤다.
//   - 규칙 경로 꼴: `Edit(//C:/...)`는 Write를 막지 못했고 `Edit(//c/...)`는 막았다.
//   - 훅 콜백이 던지면 `onFailure: 'block'`에서 Bash가 거부됐다(공개 타입 HookCallbackMatcher.onFailure).
import type { ControlNodeInfo } from './controlNodes'

const TARGETS = [
  { name: 'engines', dir: true },
  { name: 'engine-config.json', dir: false },
  { name: 'controls.json', dir: false },
] as const

function slashed(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '')
}

export function protectedTargets(userDataDir: string): string[] {
  const root = slashed(userDataDir)
  return TARGETS.map((t) => `${root}/${t.name}`)
}

// `C:/x` → `//c/x`, `/home/x` → `//home/x`. Edit 규칙은 Write·NotebookEdit에도 걸린다(공식 permissions 문서).
export function enginePathDenyRules(userDataDir: string): string[] {
  const root = slashed(userDataDir).replace(/^([A-Za-z]):/, (_, d: string) => '/' + d.toLowerCase()).replace(/^\/+/, '')
  return TARGETS.map((t) => (t.dir ? `Edit(//${root}/${t.name}/**)` : `Edit(//${root}/${t.name})`))
}

// 명령 글자에 「userData 폴더 이름/보호 대상」이 보이면 사유를, 아니면 null을 돌려준다.
// 끝 두 마디로 보므로 `$APPDATA/agentdeck/...`, `~/AppData/Roaming/agentdeck/...`, `/c/Users/.../agentdeck/...` 꼴이 모두 걸린다.
// 같은 글자가 든 읽기 명령도 막힌다 — L3 잠금이라 실수만 막고, 엔진 폴더를 읽을 일은 없다(G3 결정 대장).
export function bashLockReason(command: string, userDataDir: string): string | null {
  const base = slashed(userDataDir).split('/').pop()?.toLowerCase() ?? ''
  if (!base) return null
  const cmd = command.replace(/\\/g, '/').replace(/\/{2,}/g, '/').toLowerCase()
  for (const t of TARGETS) {
    const needle = `${base}/${t.name}`
    let at = cmd.indexOf(needle)
    while (at !== -1) {
      const before = at === 0 ? '' : cmd[at - 1]
      const after = cmd[at + needle.length] ?? ''
      if ((before === '' || /[/\s"'=]/.test(before)) && (after === '' || /[/\s"'`;)|&]/.test(after))) {
        return `앱 엔진·설정 경로(${t.name})를 건드리는 명령은 앱 세션에서 막습니다 — 엔진 교체는 앱 화면에서 하세요.`
      }
      at = cmd.indexOf(needle, at + 1)
    }
  }
  return null
}

// 공개 타입 PreToolUseHookInput에서 이 노드가 읽는 칸만 적는다.
interface PreToolUseInput {
  hook_event_name?: string
  tool_name?: string
  tool_input?: unknown
}

// 빈 객체는 「판정 없음」이다(다음 판정 단계로). 거부만 hookSpecificOutput을 싣는다.
interface HookOutput {
  hookSpecificOutput?: { hookEventName: 'PreToolUse'; permissionDecision: 'deny'; permissionDecisionReason: string }
}

export interface EnginePathLockMatcher {
  matcher?: string
  hooks: ((input: PreToolUseInput, toolUseID: string | undefined, opts: { signal: AbortSignal }) => Promise<HookOutput>)[]
  timeout: number
  onFailure: 'block'
}

// SDK hooks.PreToolUse에 넣는 매처. 도구 이름으로 거르지 않고 `command` 입력을 가진 모든 도구(Bash, PowerShell 등)를 본다.
export function buildEnginePathLockHook(userDataDir: string): EnginePathLockMatcher {
  return {
    hooks: [
      async (input) => {
        const ti = input.tool_input
        const command = ti && typeof ti === 'object' ? (ti as Record<string, unknown>)['command'] : undefined
        if (typeof command !== 'string') return {}
        const reason = bashLockReason(command, userDataDir)
        if (reason === null) return {}
        return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
      },
    ],
    timeout: ENGINE_LOCK_TIMEOUT_S,
    onFailure: 'block',
  }
}

const ENGINE_LOCK_TIMEOUT_S = 10

export const ENGINE_PATH_NODES: readonly ControlNodeInfo[] = Object.freeze([
  Object.freeze({
    id: 'engine-path-file-deny',
    name: '앱 엔진·설정 파일을 파일 도구로 고치지 못함',
    point: 'permissionRules',
    judge: 'rule',
    results: Object.freeze(['deny'] as const),
    // 앱 소스가 세션을 열 때 넣는 인라인 규칙이다. 앱 소스를 고치면 꺼지므로 L2다.
    protection: 'L2',
    locked: true,
    onFailure: 'block',
    timeoutMs: null,
  }),
  Object.freeze({
    id: 'engine-path-bash-lock',
    name: '앱 엔진·설정 경로가 보이는 셸 명령 거부',
    point: 'preToolUse',
    judge: 'rule',
    results: Object.freeze(['deny'] as const),
    // 명령 글자를 바꾸면 피해 가므로 L3다 — 실수만 막는다.
    protection: 'L3',
    locked: true,
    onFailure: 'block',
    timeoutMs: ENGINE_LOCK_TIMEOUT_S * 1000,
  }),
])
