// 메인의 앱 안 도구(05_Loop/mainChatTools.ts) — 사람 판정 경계.
// 고정하는 것: 도구는 pause·resume·append_backlog 셋뿐이다(승인·반려·이어 가기·래치 풀기·판정 넣기 도구가 없다).
// 도구는 좁은 능력 객체(MainActions)만 부른다. Backlog 한 줄은 실행기 코드가 `.agentdeck/backlog.md`에 붙인다(여러 줄·빈 글은 받지 않는다).
// SDK 꼴: createSdkMcpServer로 만든 서버 하나(agentdeck-main)를 SDK mcpServers 값으로 돌려준다.
import { describe, expect, it } from 'vitest'
import { MAIN_TOOL_SERVER, type MainActions } from '@main/05_Loop/mainChat'
import { BACKLOG_PATH, appendBacklogLine, buildMainTools, mainToolSpecs } from '@main/05_Loop/mainChatTools'
import { FakeFs } from '../00_Helpers/loopFakes'

function spyActions(): { actions: MainActions; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    actions: {
      pause: async () => { calls.push('pause'); return '멈춤 깃발을 올렸다' },
      resume: async () => { calls.push('resume'); return '깃발을 내렸다' },
      appendBacklog: async (line) => { calls.push(`backlog:${line}`); return '적었다' },
    },
  }
}

describe('메인의 앱 안 도구 (M10 G2)', () => {
  it('도구는 셋뿐이다 — 사람 판정을 대신하는 도구가 없다', () => {
    const names = mainToolSpecs(spyActions().actions).map((t) => t.name).sort()
    expect(names).toEqual(['append_backlog', 'pause', 'resume'])
    for (const n of names) expect(n).not.toMatch(/approve|reject|decide|verdict|release|latch|submit/)
  })

  it('도구는 능력 객체만 부르고 결과 글을 돌려준다', async () => {
    const { actions, calls } = spyActions()
    const specs = new Map(mainToolSpecs(actions).map((t) => [t.name, t]))
    expect(await specs.get('pause')?.run({})).toBe('멈춤 깃발을 올렸다')
    expect(await specs.get('resume')?.run({})).toBe('깃발을 내렸다')
    expect(await specs.get('append_backlog')?.run({ line: '설정 화면 정리' })).toBe('적었다')
    expect(await specs.get('append_backlog')?.run({ line: 3 })).toContain('한 줄')
    expect(calls).toEqual(['pause', 'resume', 'backlog:설정 화면 정리'])
  })

  it('Backlog 한 줄은 .agentdeck/backlog.md 끝에 붙고, 여러 줄·빈 글·긴 글은 받지 않는다', async () => {
    const fs = new FakeFs()
    expect(await appendBacklogLine(fs, '첫 아이디어')).toEqual({ ok: true })
    expect(await appendBacklogLine(fs, '둘째')).toEqual({ ok: true })
    expect(fs.files.get(BACKLOG_PATH)).toBe('# Backlog\n- 첫 아이디어\n- 둘째\n')
    expect((await appendBacklogLine(fs, '줄\n바꿈')).ok).toBe(false)
    expect((await appendBacklogLine(fs, '   ')).ok).toBe(false)
    expect((await appendBacklogLine(fs, 'x'.repeat(301))).ok).toBe(false)
    expect(fs.files.get(BACKLOG_PATH)).toBe('# Backlog\n- 첫 아이디어\n- 둘째\n')
  })

  it('SDK 서버 하나(agentdeck-main)를 mcpServers 값으로 만든다', async () => {
    const servers = await buildMainTools(spyActions().actions)
    expect(Object.keys(servers)).toEqual([MAIN_TOOL_SERVER])
    expect(servers[MAIN_TOOL_SERVER]).toMatchObject({ type: 'sdk', name: MAIN_TOOL_SERVER })
  })
})
