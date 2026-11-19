// M10 G5 — 알림 판정자. main이 LoopStatus 변화를 보고 사람을 부르는 사건을 정한다.
// 고정하는 것: 같은 상태를 N번 밀어도 알림 1번, 풀리지 않은 채 재기동(같은 앱 영역의 새 인스턴스)하면 0번, 풀린 뒤 같은 노드에서
// 다시 멈추면 1번. 풀리면 앱 안 표시가 사라지고, 마일스톤 병합 대기는 앱 안 표시만. 열쇠에 사유 글은 들지 않는다.
// 루프 닫기(closed)는 풀림이 아니다 — 닫았다 다시 연 같은 멈춤을 또 알리지 않는다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { blankStatus } from '@main/05_Loop/loopDriver'
import { createLoopNotifier, type LoopNotifier } from '@main/05_Loop/loopNotifier'
import type { NotifyRequest } from '@main/05_Loop/ports'
import type { LoopAlertList, LoopStatus } from '@shared/13_Loop/loop'

const CWD = 'C:/work/practice'
const OTHER = 'C:/work/other'
let dir: string
let shown: NotifyRequest[]
let changes: LoopAlertList[]
let opened: string[]

const st = (over: Partial<LoopStatus> = {}, cwd = CWD): LoopStatus => ({ ...blankStatus(cwd), root: cwd, milestoneId: 'M1', ...over })
const halted = (over: Partial<LoopStatus> = {}, cwd = CWD): LoopStatus =>
  st({ phase: 'halted', node: 'G1/checks', failCount: 3, reason: '같은 곳 FAIL 세 번', ...over }, cwd)

function make(): LoopNotifier {
  return createLoopNotifier({
    appDataDir: dir,
    notify: { show: (n) => { shown.push(n) } },
    onChange: (l) => { changes.push(l) },
    onOpen: (cwd) => { opened.push(cwd) },
  })
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ad-notify-'))
  shown = []
  changes = []
  opened = []
})
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }) })

describe('알림 판정자 (M10 G5)', () => {
  it('같은 멈춤을 N번 밀어도 Windows 알림은 한 번이고 앱 안 표시는 하나다 — 사유 글이 바뀌어도 같은 사건이다', async () => {
    const n = make()
    await Promise.all(Array.from({ length: 5 }, () => n.observe(halted())))
    await n.observe(halted({ reason: '다른 글' }))
    expect(shown).toHaveLength(1)
    expect(shown[0].body).toContain('G1/checks')
    expect(n.list()).toHaveLength(1)
    expect(n.list()[0]).toMatchObject({ cwd: CWD, phase: 'halted', node: 'G1/checks', level: 'now' })
    expect(changes.at(-1)?.alerts).toEqual(n.list())
  })

  it('풀리지 않은 채 재기동하면(같은 앱 영역의 새 인스턴스) 알리지 않되 앱 안 표시는 있다', async () => {
    await make().observe(halted())
    expect(shown).toHaveLength(1)
    const again = make()
    await again.observe(halted())
    await again.observe(halted())
    expect(shown).toHaveLength(1)
    expect(again.list()).toHaveLength(1)
  })

  it('풀린 뒤 같은 노드에서 다시 멈추면 새 사건이다 — 풀리면 표시도 사라지고, 재기동해도 다시 알린다', async () => {
    const n = make()
    await n.observe(halted())
    await n.observe(st({ phase: 'running', node: 'G1/checks' }))
    expect(n.list()).toEqual([])
    expect(changes.at(-1)?.alerts).toEqual([])
    await n.observe(halted())
    expect(shown).toHaveLength(2)
    await make().observe(st({ phase: 'running', node: 'G1/checks' }))
    await make().observe(halted())
    expect(shown).toHaveLength(3)
  })

  it('래치·진행 불가도 바로 알릴 사건이고, phase가 바뀌면 같은 노드여도 새 사건이다', async () => {
    const n = make()
    await n.observe(st({ phase: 'latched', node: null, reason: '상태 파일 위조' }))
    await n.observe(st({ phase: 'blocked', node: null, reason: '자동 모드 허용 노드가 꺼져 있다' }))
    expect(shown).toHaveLength(2)
    expect(n.list().map((a) => a.phase)).toEqual(['blocked'])
  })

  it('마일스톤 병합 대기는 앱 안 표시만 한다 — 스펙 승인 대기는 사건이 아니다', async () => {
    const n = make()
    await n.observe(st({ phase: 'waiting-human', node: 'milestone-merge', milestonePr: 12 }))
    expect(shown).toEqual([])
    expect(n.list()).toMatchObject([{ phase: 'waiting-human', level: 'later', node: 'milestone-merge' }])
    await n.observe(st({ phase: 'waiting-human', node: 'spec-approval', approval: { node: 'spec-approval', title: '스펙 승인', spec: null, sha256: null } }))
    expect(n.list()).toEqual([])
  })

  it('루프 닫기(closed)는 풀림이 아니다 — 표시는 내리지만 다시 연 같은 멈춤을 또 알리지 않는다', async () => {
    const n = make()
    await n.observe(halted())
    await n.observe(blankStatus(CWD))
    expect(n.list()).toEqual([])
    await n.observe(halted())
    expect(shown).toHaveLength(1)
    expect(n.list()).toHaveLength(1)
  })

  it('작업 폴더마다 따로 센다 — 경로 표기가 달라도 같은 폴더다', async () => {
    const n = make()
    await n.observe(halted())
    await n.observe(halted({}, OTHER))
    await n.observe(halted({}, 'c:\\work\\practice\\'))
    expect(shown).toHaveLength(2)
    expect(n.list().map((a) => a.cwd).sort()).toEqual([CWD, OTHER].sort())
  })

  it('알림을 누르면 그 작업 폴더를 연다', async () => {
    const n = make()
    await n.observe(halted({}, OTHER))
    shown[0].onClick()
    expect(opened).toEqual([OTHER])
  })

  it('저장본이 깨져 있어도 판정은 돈다(빈 목록으로 읽는다)', async () => {
    fs.writeFileSync(path.join(dir, 'alerts.json'), '{깨짐')
    const n = make()
    await n.observe(halted())
    expect(shown).toHaveLength(1)
  })
})
