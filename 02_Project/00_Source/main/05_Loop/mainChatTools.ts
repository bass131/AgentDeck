// 메인의 앱 안 도구 셋. 사람 판정 경계를 여기서 못 박는다.
//   - pause: 구동자의 일시 정지 깃발을 올린다(지금 노드가 끝나면 다음 노드로 가지 않는다). 실행 상태·검증 기록·USER-INPUT 줄과 무관하다.
//   - resume: 그 깃발만 내린다. needs-user를 풀거나 사람 판정을 넣지 않는다.
//   - append_backlog: `.agentdeck/backlog.md` 끝에 한 줄. 파일 쓰기는 실행기 코드(fs 포트)가 한다 — 세션에게 쓰기 창을 열지 않는다.
//   - propose_taste_doc: Taste·헌장 초안을 구조로 넘긴다. 앱이 쓰기 검사를 미리 돌리고 승인 카드를 띄운다 — 쓰는 것은 사람 확정 뒤의 앱이다.
// 승인·반려·이어 가기·래치 풀기·판정 넣기 도구는 없다. 도구는 좁은 능력 객체(MainActions)만 받는다(구동자 전체를 받지 않는다).
// SDK 꼴: createSdkMcpServer의 서버 하나(MAIN_TOOL_SERVER). 턴마다 새로 만든다(서버 인스턴스는 한 연결에 묶인다).
// SDK는 ESM 전용이라 동적 import로 읽는다. 도구 입력 꼴은 SDK의 동료 의존성 zod로 쓴다(SDK가 요구하는 꼴).
import type { TasteDraft } from '@shared/14_Taste/taste'
import type { TasteItem } from '@shared/14_Taste/tasteDoc'
import type { MainActions } from './mainChat'
import { MAIN_TOOL_SERVER } from './mainChat'
import type { FsPort } from './ports'

export const BACKLOG_PATH = '.agentdeck/backlog.md'
const BACKLOG_MAX = 300

type ToolInput = 'none' | 'line' | 'taste'
interface MainToolSpec {
  name: 'pause' | 'resume' | 'append_backlog' | 'propose_taste_doc'
  description: string
  input: ToolInput
  run(args: Record<string, unknown>): Promise<string>
}

const isStr = (v: unknown): v is string => typeof v === 'string'
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function itemsOf(v: unknown): TasteItem[] | null {
  if (!Array.isArray(v)) return null
  const out: TasteItem[] = []
  for (const i of v) {
    if (!isObj(i) || !isStr(i['id']) || !isStr(i['title']) || !Array.isArray(i['fields'])) return null
    const fields: TasteItem['fields'] = []
    for (const f of i['fields'] as unknown[]) {
      if (!isObj(f) || !isStr(f['name']) || !isStr(f['text'])) return null
      fields.push({ name: f['name'], text: f['text'] })
    }
    out.push({ id: i['id'], title: i['title'], fields })
  }
  return out
}

// 도구 입력을 초안으로 읽는다. 꼴이 틀리면 사유 글
export function draftOf(args: Record<string, unknown>): TasteDraft | string {
  const doc = args['doc']
  if (doc === 'global-taste' || doc === 'project-taste') {
    const items = itemsOf(args['items'])
    return items === null ? 'items는 {id, title, fields:[{name, text}]}의 배열이어야 한다' : { doc, items }
  }
  if (doc === 'charter') {
    const goal = args['goal']
    const nonGoals = args['nonGoals'] ?? null
    if (!strings(goal)) return 'goal은 줄 글의 배열이어야 한다'
    if (nonGoals !== null && !strings(nonGoals)) return 'nonGoals는 줄 글의 배열이거나 없어야 한다'
    return { doc, charter: { goal, nonGoals } }
  }
  return 'doc은 global-taste·project-taste·charter 중 하나다'
}

export function mainToolSpecs(actions: MainActions): MainToolSpec[] {
  return [
    {
      name: 'pause',
      description: '실행기를 일시 정지한다 — 지금 노드가 끝나면 다음 노드로 가지 않는다. 실행 상태와 검증 기록은 바꾸지 않는다. 사람이 멈추라고 할 때만 쓴다.',
      input: 'none',
      run: () => actions.pause(),
    },
    {
      name: 'resume',
      description: '일시 정지 깃발을 내린다. 사람 판정(승인·이어 가기)을 대신하지 않는다 — 사람을 기다리는 실행은 그대로 기다린다.',
      input: 'none',
      run: () => actions.resume(),
    },
    {
      name: 'append_backlog',
      description: '완료조건 밖의 아이디어 한 줄을 .agentdeck/backlog.md 끝에 붙인다. 한 줄, 300자 이하.',
      input: 'line',
      run: async (args) => (typeof args['line'] === 'string' ? actions.appendBacklog(args['line']) : 'line은 한 줄 글이어야 한다'),
    },
    {
      name: 'propose_taste_doc',
      description: [
        '문답으로 정리한 Taste·헌장 초안 한 장을 구조로 제안한다. 파일은 쓰지 않는다 — 앱이 문서 꼴을 검사하고, 통과하면 사람에게 승인 카드를 띄운다.',
        '검사에 걸리면 문제 목록이 결과로 온다 — 고쳐서 다시 제안한다. 사람이 확정해야 앱이 쓴다.',
        'doc: global-taste·project-taste면 items(항목 T<숫자>, 제목, 칸 원칙·레퍼런스·금지), charter면 goal(목표 줄들)과 nonGoals(하지 않을 것 줄들, 없으면 생략).',
      ].join(' '),
      input: 'taste',
      run: async (args) => {
        const d = draftOf(args)
        return typeof d === 'string' ? `제안하지 않았다 — ${d}` : actions.proposeTasteDoc(d)
      },
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
  const item = z.object({
    id: z.string().describe('T<숫자>'),
    title: z.string(),
    fields: z.array(z.object({ name: z.string().describe('원칙·레퍼런스·금지'), text: z.string() })),
  })
  const shapes: Record<ToolInput, Record<string, unknown>> = {
    none: {},
    line: { line: z.string().describe('Backlog에 붙일 한 줄') },
    taste: {
      doc: z.enum(['global-taste', 'project-taste', 'charter']),
      items: z.array(item).optional().describe('global-taste·project-taste의 항목'),
      goal: z.array(z.string()).optional().describe('charter의 목표 줄들'),
      nonGoals: z.array(z.string()).optional().describe('charter의 하지 않을 것 줄들'),
    },
  }
  const tools = mainToolSpecs(actions).map((s) => sdk.tool(
    s.name,
    s.description,
    shapes[s.input],
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
