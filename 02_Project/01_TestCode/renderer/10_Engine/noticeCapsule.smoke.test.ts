// @vitest-environment node
// 캡슐 경계 스모크 테스트 — notice 기능 캡슐(02_Project/00_Source/renderer/src/10_Engine)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편(Step 3) 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, posix } from 'node:path'
import * as engine from '@renderer/10_Engine'
import {
  AppUpdateGate,
  EngineGate,
  EngineUpdateNotice,
  UpdateNotes,
} from '@renderer/10_Engine'

describe('notice 캡슐 — 공개 표면 스모크', () => {
  it('AppUpdateGate가 캡슐 경로에서 export된다', () => {
    expect(typeof AppUpdateGate).toBe('function')
  })

  it('EngineGate가 캡슐 경로에서 export된다', () => {
    expect(typeof EngineGate).toBe('function')
  })

  it('EngineUpdateNotice가 캡슐 경로에서 export된다', () => {
    expect(typeof EngineUpdateNotice).toBe('function')
  })

  it('UpdateNotes가 캡슐 경로에서 export된다', () => {
    expect(typeof UpdateNotes).toBe('function')
  })
})

const SRC = join(__dirname, '../../../00_Source/renderer/src')
const IMPORT = /^\s*(?:import|export)\s+(type\s+)?[^'"]*?\s*from\s*'([^']+)'|^\s*import\s+'([^']+)'/gm

// 값 import만 센다 — `import type`은 빌드에서 지워져 모듈 순환을 만들지 않는다.
function domainEdges(): Map<string, string[]> {
  const files = readdirSync(SRC, { recursive: true }).map(String).filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => f.replace(/\\/g, '/'))
  const dom = (f: string): string => (f.includes('/') || existsSync(join(SRC, f)) ? f.split('/')[0] : '(root)')
  const edges = new Map<string, string[]>()
  for (const f of files) {
    for (const m of readFileSync(join(SRC, f), 'utf8').matchAll(IMPORT)) {
      if (m[1]) continue
      const spec = m[2] ?? m[3]
      const target = spec.startsWith('@renderer/') ? spec.slice(10)
        : spec.startsWith('.') ? posix.normalize(posix.join(posix.dirname(f), spec)) : null
      if (!target || dom(f) === dom(target)) continue
      const key = `${dom(f)}->${dom(target)}`
      edges.set(key, [...(edges.get(key) ?? []), `${f} -> ${spec}`])
    }
  }
  return edges
}

// 2026-11-21에 잰 도메인 사이 양방향 쌍. 새 쌍이 생기면 실패하고, 쌍을 풀면 이 목록에서 뺀다.
const KNOWN_MUTUAL = [
  '00_App<->03_Agent', '00_App<->05_Conversation', '00_App<->06_Sessions', '00_App<->07_Workspace', '00_App<->12_Window',
  '03_Agent<->05_Conversation', '03_Agent<->06_Sessions', '03_Agent<->12_Window',
  '05_Conversation<->07_Workspace', '05_Conversation<->12_Window',
  '07_Workspace<->11_Settings', '11_Settings<->12_Window',
]

describe('도메인 순환 래칫 (M05 Backlog 42)', () => {
  it('10_Engine 배럴은 03_Agent 컴포넌트를 재수출하지 않는다 — 소비처는 03_Agent 배럴에서 가져온다', async () => {
    for (const name of ['HookTimeline', 'LoopStatusBanner', 'PermissionCard']) expect(name in engine, name).toBe(false)
    const agent = await import('@renderer/03_Agent')
    for (const name of ['HookTimeline', 'LoopStatusBanner', 'PermissionCard']) expect(typeof (agent as Record<string, unknown>)[name], name).toBe('function')
  })

  it('Conversation은 HookTimeline·LoopStatusBanner·PermissionCard를 03_Agent 배럴 한 줄에서 가져온다', () => {
    const src = readFileSync(join(SRC, '05_Conversation/Conversation.tsx'), 'utf8')
    const line = src.split('\n').find((l) => /from '@renderer\/03_Agent'$/.test(l.trim())) ?? ''
    for (const name of ['HookTimeline', 'LoopStatusBanner', 'PermissionCard']) expect(line, name).toContain(name)
    expect(src).not.toMatch(/from '@renderer\/10_Engine'/)
  })

  it('10_Engine 소스는 03_Agent를 값으로 import하지 않는다', () => {
    expect(domainEdges().get('10_Engine->03_Agent') ?? []).toEqual([])
  })

  it('도메인 사이 양방향 쌍은 잰 목록을 넘지 않는다', () => {
    const edges = domainEdges()
    const mutual = [...edges.keys()].map((k) => k.split('->')).filter(([a, b]) => a < b && edges.has(`${b}->${a}`)).map(([a, b]) => `${a}<->${b}`)
    expect(mutual.filter((p) => !KNOWN_MUTUAL.includes(p))).toEqual([])
  })
})
