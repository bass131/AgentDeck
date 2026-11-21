// 끈 노드는 userData `controls.json`에, 내용 해시는 `controls-seal.json`에 적는다. 실행을 열 때 한 번 읽어 그 실행에 고정한다.
// 봉인이 맞지 않으면 기본값으로 물러나지 않고 실행을 열지 않는다. 풀린 노드는 허용 노드뿐이라 기본값(전부 켬)이 가장 느슨하다 —
// 물러나면 사용자가 꺼 둔 허용이 파일 훼손 한 번으로 되살아난다.
// 「처음 설정함」 표시(`first-setup.json`)는 이웃 폴더 `<폴더>-guard/`에 따로 둔다 — 두 파일이나 앱 데이터 폴더를 통째로 지워도
// 첫 실행으로 보이지 않게 한다. 앱 데이터 폴더 안의 옛 표시는 읽을 때 새 거처로 옮겨 적고, 옛 파일은 지우지 않는다.
// 파일들은 앱 세션에서 잠겨 있고(enginePathLock.ts), 이 봉인은 CLI 세션이나 다른 프로그램이 고친 경우를 잡는다.
// 표시까지 함께 지우거나(`agentdeck*` 와일드카드 포함) 봉인까지 함께 고치면 통과한다(L1 보호).
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import type { Ack } from '../../../shared/02_Common/common'
import type { ControlsSealStatus, ControlsState } from '../../../shared/11_Settings/settings'
import { PERMISSION_NODES, listControlNodes, type ControlNode } from './controlNodes'
import { markerDir } from './guardDir'

const FILE = 'controls.json'
const SEAL = 'controls-seal.json'
const MARKER = 'first-setup.json'

interface ControlsRead {
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

// 없으면 null. 그 밖의 읽기 오류는 던진다 — 부르는 쪽(controlsForRun·controlsState)이 닫힌 실패로 받는다.
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

// 지금 파일의 내용 — 없거나 읽을 수 없으면 null(확인하면 기본값으로 쓴다)
function fileContent(userData: string): string[] | null {
  const raw = readOrNull(path.join(userData, FILE))
  return raw === null ? null : parseFile(raw)
}

// 표시 거처(이웃 guard 폴더)는 guardDir.ts가 정한다 — 잠금(enginePathLock.ts)과 같은 이름을 쓴다
export { markerDir }

function writeMarker(userData: string): void {
  fs.mkdirSync(markerDir(userData), { recursive: true })
  fs.writeFileSync(path.join(markerDir(userData), MARKER), JSON.stringify({ version: 1, controls: true }, null, 2) + '\n')
}

// 표시가 있는가. 옛 거처(앱 데이터 폴더 안)에만 있으면 새 거처로 옮겨 적는다 — 옮기기가 실패해도 판정은 「있음」이다.
// 표시를 읽다 오류(EACCES·EISDIR 등)가 나면 던진다. 두 파일이 멀쩡해도 실행은 error로 닫힌다 — 의도된 닫힌 실패다.
function isMarked(userData: string): boolean {
  if (readOrNull(path.join(markerDir(userData), MARKER)) !== null) return true
  if (readOrNull(path.join(userData, MARKER)) === null) return false
  try {
    writeMarker(userData)
  } catch (err) {
    console.error('[controls] 옛 「처음 설정함」 표시를 새 거처로 옮기지 못했다:', err)
  }
  return true
}

export function readControls(userData: string): ControlsRead {
  const marked = isMarked(userData)
  const raw = readOrNull(path.join(userData, FILE))
  const sealRaw = readOrNull(path.join(userData, SEAL))
  const content = raw === null ? [] : parseFile(raw) ?? []
  if (raw === null && sealRaw === null) {
    // 표시가 있으면 한 번 설정한 뒤 둘 다 지워진 것이다 — 첫 실행(none)과 가른다
    return { status: marked ? 'mismatch' : 'none', disabled: [] }
  }
  if (sealRaw === null) return { status: 'missing', disabled: content }
  const hash = parseSeal(sealRaw)
  // 봉인은 있는데 파일이 없으면 지워진 것이다 — 첫 실행(none)과 가른다
  if (raw === null || hash === null || hash !== sha256(raw)) return { status: 'mismatch', disabled: content }
  // 앱은 읽을 수 없는 내용을 봉인하지 않는다. 봉인이 맞는데 못 읽으면 바뀐 것과 같이 본다.
  const parsed = parseFile(raw)
  if (parsed === null) return { status: 'mismatch', disabled: [] }
  // 봉인이 맞는데 표시만 없으면 다시 적는다 — guard 폴더만 먼저 사라진 뒤 앱 데이터 폴더가 따로 지워지는 경우를 막는다
  if (!marked) {
    try {
      writeMarker(userData)
    } catch (err) {
      console.error('[controls] 「처음 설정함」 표시를 다시 적지 못했다:', err)
    }
  }
  return { status: 'ok', disabled: parsed }
}

// 표시를 먼저, 내용을 다음, 봉인을 마지막에 쓴다. 사이에서 멈추면 mismatch가 되어 실행이 닫힌다.
function write(userData: string, disabled: string[]): void {
  const content = JSON.stringify({ version: 1, disabled }, null, 2) + '\n'
  fs.mkdirSync(userData, { recursive: true })
  writeMarker(userData)
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

// 패널의 확인 — 사람이 본 내용(seen)이 지금 파일 내용과 같을 때만 다시 봉인한다.
// 패널을 연 뒤 파일이 또 바뀌었으면 거절하고, 패널이 새 내용을 다시 보이게 한다.
// 파일이 없거나 읽을 수 없으면 내용은 기본값(전부 켬)이다. 내용은 정규화해 다시 쓴다(모르는 id·잠긴 노드를 뺀다).
export function confirmControls(userData: string, seen: readonly string[]): Ack {
  try {
    const content = fileContent(userData) ?? []
    const want = normalize(seen)
    if (want.length !== content.length || want.some((id, i) => id !== content[i])) {
      return { ok: false, error: '패널을 연 뒤 controls.json이 또 바뀌었습니다 — 새로 보이는 내용을 보고 다시 확인하세요.' }
    }
    write(userData, content)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// 패널 상태. 읽다 오류가 나면 error 상태와 사유를 준다 — 실행은 닫히고(controlsForRun), 패널은 원인을 보인다.
export function controlsState(userData: string): Omit<ControlsState, 'engine'> {
  const view = (status: ControlsState['status'], disabled: readonly string[], fileReadable: boolean): Omit<ControlsState, 'engine'> => {
    const off = new Set(disabled)
    return {
      status,
      fileReadable,
      nodes: listControlNodes().map((n) => ({ ...n, results: [...n.results], enabled: n.locked || !off.has(n.id) })),
    }
  }
  try {
    const { status, disabled } = readControls(userData)
    return view(status, disabled, fileContent(userData) !== null)
  } catch (err) {
    return { ...view('error', [], false), error: err instanceof Error ? err.message : String(err) }
  }
}

// 실행에 넘길 권한 콜백 노드. 잠긴 노드는 id가 목록에 있어도 빼지 않는다.
export function activePermissionNodes(disabled: readonly string[]): readonly ControlNode[] {
  const off = new Set(normalize(disabled))
  if (off.size === 0) return PERMISSION_NODES
  return PERMISSION_NODES.filter((n) => n.locked || !off.has(n.id))
}

const BLOCKED = '컨트롤 설정(controls.json)이 앱 밖에서 바뀌어 실행을 열지 않았습니다 — 설정 › 컨트롤에서 확인하세요.'

// 앱 실행의 검사 — userData 경로를 못 얻으면 열지 않는다
export function controlsForAppRun(userDataDir: () => string): ControlsForRun {
  let userData: string
  try {
    userData = userDataDir()
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err)
    return { ok: false, status: 'error', message: `앱 데이터 폴더를 얻지 못해 실행을 열지 않았습니다(${why}) — 앱을 다시 시작하세요.` }
  }
  return controlsForRun(userData)
}

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
