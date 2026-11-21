// 루프 잠금의 메인 대화 꼴 — 메인 대화(05_Loop/mainChat.ts)의 턴에 붙는다. 허용 목록 밖은 모두 거부한다(fail-closed).
//   - 셸(입력에 command가 있는 도구 — Bash·PowerShell 등)은 명령과 관계없이 거부한다.
//   - 편집 도구는 `.agentdeck/milestone-spec.md`·`.agentdeck/decisions.md` 두 경로만, 그리고 쓰기 창(canWrite — 실행기 커서가
//     브레인스토밍 노드에 있고 그 방문이 열려 있을 때)이 열렸을 때만 지나간다. 경로는 잠금의 정규형으로 맞추고, 링크로 밖을 가리키면 거부한다.
//     경로의 변수·물결표·명령 치환은 펼치지 않고 거부한다(편집 도구는 경로를 글자 그대로 쓴다).
//   - MCP 도구는 앱 안 도구 서버(toolServer)의 것만 지나간다. 읽기 도구와 질문 도구는 지나간다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildLoopLockHook, mainChatToolReason, type LoopLockScope } from '@main/04_Claude/permission/loopLock'

const TEMP = 'C:\\Users\\u\\AppData\\Local\\Temp'
const ROOT = 'C:\\work\\repo'
let open = true
const scope = (over: Partial<LoopLockScope['mainChat'] & object> = {}): LoopLockScope => ({
  repoRoot: ROOT,
  appLoopDir: 'C:\\Users\\u\\AppData\\Roaming\\agentdeck\\loop',
  tempDirs: [TEMP],
  vars: { APPDATA: 'C:\\Users\\u\\AppData\\Roaming', HOME: 'C:\\Users\\u', USERPROFILE: 'C:\\Users\\u', TEMP, TMP: TEMP },
  isDir: () => true,
  mainChat: { toolServer: 'agentdeck-main', canWrite: () => open, ...over },
})
const write = (p: string, s = scope()): Promise<string | null> => mainChatToolReason('Write', { file_path: p, content: 'x' }, s)

afterEach(() => { open = true })

describe('메인 대화 잠금 — 셸과 허용 목록 밖 도구 (M10 G2)', () => {
  it('셸은 명령과 관계없이 거부한다 — 읽기 명령도, command 칸을 가진 모르는 도구도', async () => {
    for (const command of ['git status', 'ls', 'echo hi', 'cat .agentdeck/milestone-spec.md']) {
      expect(await mainChatToolReason('Bash', { command }, scope()), command).toContain('셸')
      expect(await mainChatToolReason('PowerShell', { command }, scope()), command).toContain('셸')
    }
    expect(await mainChatToolReason('Whatever', { command: 'ls' }, scope())).toContain('셸')
  })

  it('허용 목록 밖 도구는 거부한다 — 하위 에이전트·스킬·노트북 편집·백그라운드 셸 다루기', async () => {
    for (const tool of ['Task', 'Agent', 'Skill', 'NotebookEdit', 'KillShell', 'BashOutput', 'ExitPlanMode', 'SlashCommand', undefined]) {
      expect(await mainChatToolReason(tool, { notebook_path: `${ROOT}\\a.ipynb` }, scope()), String(tool)).not.toBeNull()
    }
  })

  it('읽기 도구와 질문 도구는 지나간다', async () => {
    for (const tool of ['Read', 'Glob', 'Grep', 'AskUserQuestion', 'TodoWrite', 'ToolSearch', 'WebFetch', 'WebSearch']) {
      expect(await mainChatToolReason(tool, { file_path: `${ROOT}\\src\\a.ts`, pattern: '*' }, scope()), tool).toBeNull()
    }
  })

  it('MCP 도구는 앱 안 도구 서버의 것만 — 이름 앞부분이 같은 다른 서버는 거부한다', async () => {
    expect(await mainChatToolReason('mcp__agentdeck-main__pause', {}, scope())).toBeNull()
    expect(await mainChatToolReason('mcp__agentdeck-main__append_backlog', { text: 'x' }, scope())).toBeNull()
    for (const t of ['mcp__github__create_pull_request', 'mcp__agentdeck-main-evil__pause', 'mcp__agentdeck__pause', 'mcp__AGENTDECK-MAIN__pause']) {
      expect(await mainChatToolReason(t, {}, scope()), t).toContain('MCP')
    }
  })
})

describe('메인 대화 잠금 — 쓰기 창 (M10 G2)', () => {
  it('스펙·결정 대장 두 경로는 창이 열렸을 때만 쓴다 — 상대·절대·역슬래시·msys·대소문자 꼴 모두 같은 경로로 본다', async () => {
    const forms = [
      '.agentdeck/milestone-spec.md', `${ROOT}\\.agentdeck\\milestone-spec.md`, 'C:/work/repo/.agentdeck/milestone-spec.md',
      '/c/work/repo/.agentdeck/milestone-spec.md', `${ROOT.toUpperCase()}\\.AGENTDECK\\MILESTONE-SPEC.MD`, '.agentdeck/decisions.md',
      'src/../.agentdeck/decisions.md',
    ]
    for (const p of forms) expect(await write(p), p).toBeNull()
    for (const tool of ['Edit', 'MultiEdit']) expect(await mainChatToolReason(tool, { file_path: '.agentdeck/decisions.md' }, scope()), tool).toBeNull()
    open = false
    for (const p of forms) expect(await write(p), p).toContain('브레인스토밍')
    expect(await mainChatToolReason('Edit', { file_path: '.agentdeck/decisions.md' }, scope())).toContain('브레인스토밍')
  })

  it('그 밖의 경로는 창이 열려 있어도 언제나 거부한다 — 실행기 몫·Backlog·goal 문서·소스·저장소 밖·판독 못 한 경로', async () => {
    for (const p of [
      'src/a.ts', 'README.md', '.agentdeck/run-state.json', '.agentdeck/verification.md', '.agentdeck/backlog.md', '.agentdeck/goals/G1.md',
      '.agentdeck/milestone-spec.md.bak', '.agentdeck/sub/milestone-spec.md', 'milestone-spec.md', '../other/.agentdeck/milestone-spec.md',
      `${TEMP}\\.agentdeck\\milestone-spec.md`, '$UNKNOWN/.agentdeck/milestone-spec.md', '.claude/settings.json', '.git/config',
    ]) expect(await write(p), p).not.toBeNull()
    expect(await mainChatToolReason('Write', {}, scope())).not.toBeNull()
    expect(await mainChatToolReason('Write', { file_path: 42 }, scope())).not.toBeNull()
  })

  // 편집 도구는 경로를 글자 그대로 쓴다. 잠금이 변수를 펼쳐 두 경로로 보면, 실제로는 다른 파일을 쓰는 호출을 지나보낸다
  it('경로의 변수·물결표·명령 치환은 펼치지 않고 거부한다 — 펼친 곳이 두 경로여도', async () => {
    const base = scope()
    const s: LoopLockScope = { ...base, vars: { ...base.vars, HOME: ROOT, USERPROFILE: ROOT } }
    for (const p of [
      '$PWD/.agentdeck/decisions.md', '${PWD}/.agentdeck/milestone-spec.md', '$HOME/.agentdeck/decisions.md',
      '~/.agentdeck/decisions.md', '~\\.agentdeck\\milestone-spec.md', '%USERPROFILE%\\.agentdeck\\decisions.md',
      '`pwd`/.agentdeck/decisions.md', `${ROOT}\\.agentdeck\\$x\\..\\decisions.md`,
    ]) expect(await write(p, s), p).toContain('둘뿐')
    expect(await write('.agentdeck/decisions.md', s)).toBeNull()
  })

  it('창 판정이 던지면 거부한다(fail-closed)', async () => {
    const s = scope({ canWrite: () => { throw new Error('상태를 못 읽었다') } })
    expect(await write('.agentdeck/milestone-spec.md', s)).toContain('브레인스토밍')
    const late = scope({ canWrite: () => Promise.reject(new Error('늦은 실패')) })
    expect(await write('.agentdeck/milestone-spec.md', late)).toContain('브레인스토밍')
  })

  it('`.agentdeck`가 밖을 가리키는 링크(정션)면 두 경로도 거부한다', async () => {
    const real = fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-g2-lock-'))
    try {
      const repo = path.join(real, 'repo')
      const outside = path.join(real, 'outside')
      fs.mkdirSync(repo)
      fs.mkdirSync(outside)
      const s: LoopLockScope = { repoRoot: repo, appLoopDir: path.join(real, 'app'), mainChat: { toolServer: 'agentdeck-main', canWrite: () => true } }
      fs.mkdirSync(path.join(repo, '.agentdeck'))
      expect(await write('.agentdeck/milestone-spec.md', s)).toBeNull()
      fs.rmSync(path.join(repo, '.agentdeck'), { recursive: true })
      fs.symlinkSync(outside, path.join(repo, '.agentdeck'), 'junction')
      expect(await write('.agentdeck/milestone-spec.md', s)).toContain('링크')
      expect(await write(path.join(repo, '.agentdeck', 'decisions.md'), s)).toContain('링크')
    } finally {
      fs.rmSync(real, { recursive: true, force: true })
    }
  })
})

describe('메인 대화 잠금 훅 (M10 G2)', () => {
  it('훅은 거부를 PreToolUse deny로, 허용을 빈 출력으로 낸다', async () => {
    const hook = buildLoopLockHook(scope()).hooks[0]
    const signal = new AbortController().signal
    const denied = await hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, 'u1', { signal })
    expect(denied.hookSpecificOutput?.permissionDecision).toBe('deny')
    expect(await hook({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '.agentdeck/decisions.md' } }, 'u2', { signal })).toEqual({})
    open = false
    const closed = await hook({ hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '.agentdeck/decisions.md' } }, 'u3', { signal })
    expect(closed.hookSpecificOutput?.permissionDecisionReason).toContain('브레인스토밍')
  })
})
