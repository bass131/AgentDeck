// M10 G2 — 메인의 앱 안 도구 셋. 사람 판정 경계를 여기서 못 박는다.
//   - pause: 구동자의 일시 정지 깃발을 올린다(지금 노드가 끝나면 다음 노드로 가지 않는다). 실행 상태·검증 기록·USER-INPUT 줄과 무관하다.
//   - resume: 그 깃발만 내린다. needs-user를 풀거나 사람 판정을 넣지 않는다.
//   - append_backlog: `.agentdeck/backlog.md` 끝에 한 줄. 파일 쓰기는 실행기 코드(fs 포트)가 한다 — 세션에게 쓰기 창을 열지 않는다.
// 승인·반려·이어 가기·래치 풀기·판정 넣기 도구는 없다. 도구는 좁은 능력 객체(MainActions)만 받는다(구동자 전체를 받지 않는다).
// SDK 꼴: createSdkMcpServer의 서버 하나(MAIN_TOOL_SERVER). 턴마다 새로 만든다(서버 인스턴스는 한 연결에 묶인다).
// SDK는 ESM 전용이라 동적 import로 읽는다. 도구 입력 꼴은 SDK의 동료 의존성 zod로 쓴다(SDK가 요구하는 꼴).
import type { MainActions } from './mainChat'
import { MAIN_TOOL_SERVER } from './mainChat'
import type { FsPort } from './ports'

export const BACKLOG_PATH = '.agentdeck/backlog.md'
const BACKLOG_MAX = 300

export interface MainToolSpec {
  name: 'pause' | 'resume' | 'append_backlog'
  description: string
  // 입력 꼴 — 'line' 하나만 받는 도구가 있다
  takesLine: boolean
  run(args: Record<string, unknown>): Promise<string>
}

export function mainToolSpecs(actions: MainActions): MainToolSpec[] {
  return [
    {
      name: 'pause',
      description: '실행기를 일시 정지한다 — 지금 노드가 끝나면 다음 노드로 가지 않는다. 실행 상태와 검증 기록은 바꾸지 않는다. 사람이 멈추라고 할 때만 쓴다.',
      takesLine: false,
      run: () => actions.pause(),
    },
    {
      name: 'resume',
      description: '일시 정지 깃발을 내린다. 사람 판정(승인·이어 가기)을 대신하지 않는다 — 사람을 기다리는 실행은 그대로 기다린다.',
      takesLine: false,
      run: () => actions.resume(),
    },
    {
      name: 'append_backlog',
      description: '완료조건 밖의 아이디어 한 줄을 .agentdeck/backlog.md 끝에 붙인다. 한 줄, 300자 이하.',
      takesLine: true,
      run: async (args) => (typeof args['line'] === 'string' ? actions.appendBacklog(args['line']) : 'line은 한 줄 글이어야 한다'),
    },
  ]
}

export async function appendBacklogLine(fs: FsPort, line: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const t = line.trim()
  if (t === '') return { ok: false, reason: '빈 글이다' }
  if (/[\r\n]/.test(t)) return { ok: false, reason: '한 줄만 받는다' }
  if (t.length > BACKLOG_MAX) return { ok: false, reason: `${BACKLOG_MAX}자를 넘는다` }
  const prev = (await fs.read(BACKLOG_PATH)) ?? '# Backlog\n'
  const sep = prev.endsWith('\n') ? '' : '\n'
  await fs.write(BACKLOG_PATH, `${prev}${sep}- ${t}\n`)
  return { ok: true }
}

// SDK mcpServers 값. 번들된 SDK의 createSdkMcpServer를 쓴다(인스턴스는 꼴로 넘어간다).
export async function buildMainTools(actions: MainActions): Promise<Record<string, unknown>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sdk = await import('@anthropic-ai/claude-agent-sdk') as any
  const { z } = await import('zod')
  const tools = mainToolSpecs(actions).map((s) => sdk.tool(
    s.name,
    s.description,
    s.takesLine ? { line: z.string().describe('Backlog에 붙일 한 줄') } : {},
    async (args: Record<string, unknown>) => {
      try {
        return { content: [{ type: 'text', text: await s.run(args ?? {}) }] }
      } catch (e) {
        return { content: [{ type: 'text', text: `실패 — ${e instanceof Error ? e.message : String(e)}` }], isError: true }
      }
    },
  ))
  return { [MAIN_TOOL_SERVER]: sdk.createSdkMcpServer({ name: MAIN_TOOL_SERVER, version: '1.0.0', tools, alwaysLoad: true }) }
}
