// 컨트롤 설정 (M07 G5) — G8 설계 `01_Milestones/M06_SelfDev/81_G8-컨트롤-설계/30_노드-구조.md` 「보호」 1·4와 「공통 GUI」.
// 사용자가 컨트롤 패널에서 끈 노드를 userData `controls.json`에 적고, 내용 해시를 `controls-seal.json`에 함께 적는다.
// Claude 실행을 열 때(run/claudeAgentRun.ts) 한 번 읽어 그 실행의 권한 콜백에 고정한다. 토글은 다음 실행부터다.
//
// 봉인이 맞지 않으면 기본값으로 물러나지 않고 실행을 열지 않는다(G5 결정 대장 [USER]). 풀린 노드는 허용 노드뿐이라
// 기본값(전부 켬)이 가장 느슨하다 — 물러나면 사용자가 꺼 둔 허용이 파일 훼손 한 번으로 되살아난다.
// 두 파일은 앱 세션에서 잠겨 있다(enginePathLock.ts). CLI 세션이나 다른 프로그램이 고친 경우를 이 봉인이 잡는다.
// 봉인까지 함께 고치면 통과한다 — L1 보호다(설계 「보호」 끝 문단).
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Ack } from '../../../shared/02_Common/common'
import type { ControlsSealStatus, ControlsState } from '../../../shared/11_Settings/settings'
import { PERMISSION_NODES, listControlNodes, type ControlNode } from './controlNodes'

const FILE = 'controls.json'
const SEAL = 'controls-seal.json'

export interface ControlsRead {
  status: ControlsSealStatus
  // 끈 노드 id. 풀린 노드만, 등록부 순서로 담는다. 봉인이 깨졌으면 파일 내용(확인하면 받아들일 내용)이다.
  disabled: string[]
}

export type ControlsForRun =
  | { ok: true; nodes: readonly ControlNode[] }
  | { ok: false; status: ControlsSealStatus | 'error'; message: string }

// 끌 수 있는 노드 — 등록부에서 잠기지 않은 것 (controlNodes.ts의 locked 칸)
function unlockedIds(): string[] {
  return listControlNodes().filter((n) => !n.locked).map((n) => n.id)
}

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

// 없으면 null. 그 밖의 읽기 오류는 던진다 — 부르는 쪽(controlsForRun)이 닫힌 실패로 받는다.
function readOrNull(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

function normalize(ids: readonly unknown[]): string[] {
  const set = new Set(ids.filter((x): x is string => typeof x === 'string'))
  return unlockedIds().filter((id) => set.has(id))
}

function parseFile(raw: string): string[] | null {
  try {
    const o = JSON.parse(raw) as { disabled?: unknown }
    return o && typeof o === 'object' && Array.isArray(o.disabled) ? normalize(o.disabled) : null
  } catch {
    return null
  }
}

function parseSeal(raw: string): string | null {
  try {
    const o = JSON.parse(raw) as { hash?: unknown }
    return o && typeof o === 'object' && typeof o.hash === 'string' ? o.hash : null
  } catch {
    return null
  }
}

export function readControls(userData: string): ControlsRead {
  const raw = readOrNull(path.join(userData, FILE))
  const sealRaw = readOrNull(path.join(userData, SEAL))
  const content = raw === null ? [] : parseFile(raw) ?? []
  if (raw === null && sealRaw === null) return { status: 'none', disabled: [] }
  if (sealRaw === null) return { status: 'missing', disabled: content }
  const hash = parseSeal(sealRaw)
  // 봉인은 있는데 파일이 없으면 지워진 것이다 — 첫 실행(none)과 가른다
  if (raw === null || hash === null || hash !== sha256(raw)) return { status: 'mismatch', disabled: content }
  // 앱은 읽을 수 없는 내용을 봉인하지 않는다. 봉인이 맞는데 못 읽으면 바뀐 것과 같이 본다.
  const parsed = parseFile(raw)
  return parsed === null ? { status: 'mismatch', disabled: [] } : { status: 'ok', disabled: parsed }
}

// 내용을 먼저 쓰고 봉인을 나중에 쓴다. 사이에서 멈추면 mismatch가 되어 실행이 닫힌다.
function write(userData: string, disabled: string[]): void {
  const content = JSON.stringify({ version: 1, disabled }, null, 2) + '\n'
  fs.mkdirSync(userData, { recursive: true })
  fs.writeFileSync(path.join(userData, FILE), content)
  fs.writeFileSync(path.join(userData, SEAL), JSON.stringify({ version: 1, hash: sha256(content) }, null, 2) + '\n')
}

export function setControlEnabled(userData: string, id: string, enabled: boolean): Ack {
  try {
    if (!unlockedIds().includes(id)) {
      const known = listControlNodes().some((n) => n.id === id)
      return { ok: false, error: known ? `잠긴 노드는 켜고 끌 수 없습니다: ${id}` : `모르는 노드입니다: ${id}` }
    }
    const cur = readControls(userData)
    if (cur.status !== 'none' && cur.status !== 'ok') {
      return { ok: false, error: '컨트롤 설정이 앱 밖에서 바뀌었습니다 — 먼저 확인하세요.' }
    }
    const off = new Set(cur.disabled)
    if (enabled) off.delete(id)
    else off.add(id)
    write(userData, normalize([...off]))
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// 패널의 확인 — 지금 파일 내용을 사람이 본 것으로 다시 봉인한다. 없거나 읽을 수 없으면 기본값(전부 켬)으로 쓴다.
// 내용은 정규화해 다시 쓴다(모르는 id·잠긴 노드를 뺀다) — 파일과 실제 적용이 같도록.
export function confirmControls(userData: string): Ack {
  try {
    const raw = readOrNull(path.join(userData, FILE))
    write(userData, (raw === null ? null : parseFile(raw)) ?? [])
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function controlsState(userData: string): Omit<ControlsState, 'engine'> {
  const { status, disabled } = readControls(userData)
  const off = new Set(disabled)
  return {
    status,
    nodes: listControlNodes().map((n) => ({ ...n, results: [...n.results], enabled: n.locked || !off.has(n.id) })),
  }
}

// 실행에 넘길 권한 콜백 노드. 잠긴 노드는 id가 목록에 있어도 빼지 않는다.
export function activePermissionNodes(disabled: readonly string[]): readonly ControlNode[] {
  const off = new Set(normalize(disabled))
  if (off.size === 0) return PERMISSION_NODES
  return PERMISSION_NODES.filter((n) => n.locked || !off.has(n.id))
}

const BLOCKED = '컨트롤 설정(controls.json)이 앱 밖에서 바뀌어 실행을 열지 않았습니다 — 설정 › 컨트롤에서 확인하세요.'

export function controlsForRun(userData: string): ControlsForRun {
  try {
    const r = readControls(userData)
    if (r.status === 'none' || r.status === 'ok') return { ok: true, nodes: activePermissionNodes(r.disabled) }
    return { ok: false, status: r.status, message: BLOCKED }
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 'error', message: `컨트롤 설정을 읽지 못해 실행을 열지 않았습니다(${why}) — 설정 › 컨트롤에서 확인하세요.` }
  }
}
