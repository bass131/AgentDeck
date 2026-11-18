// M09 G2 — gh CLI JSON 해석 층(순수 함수). 실행 층(ghPort.ts)과 나눠 녹취 픽스처로 시험한다.
// fail-closed: PR 상태가 모르는 값이거나 칸이 빠지면 던지고, 검사 결과가 모르는 값이면 pending으로 본다(통과로 떨어지지 않는다).
// 검사 묶음(statusCheckRollup)은 PR 머리 커밋의 것이다. 머리 SHA와 묶음을 한 응답에서 읽어야 push 사이에 걸치지 않는다.
// rollup 항목은 두 꼴이다 — CheckRun { name, status, conclusion }, StatusContext { context, state }.
import type { CiStatus } from '../executor'
import type { PrInfo, PrState } from '../ports'

const STATES: Record<string, PrState> = { OPEN: 'open', MERGED: 'merged', CLOSED: 'closed' }
const SHA = /^[0-9a-f]{40}$/i

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)

export function parsePr(raw: unknown): PrInfo {
  if (!isObj(raw)) throw new Error('gh PR 응답이 객체가 아니다')
  const number = raw.number
  if (typeof number !== 'number' || !Number.isInteger(number) || number <= 0) throw new Error('gh PR 응답에 번호가 없다')
  const state = typeof raw.state === 'string' ? STATES[raw.state.toUpperCase()] : undefined
  if (!state) throw new Error(`gh PR ${number}의 상태 ${JSON.stringify(raw.state)}를 모른다`)
  const head = raw.headRefOid
  if (typeof head !== 'string' || !SHA.test(head)) throw new Error(`gh PR ${number}의 머리 SHA가 없다`)
  const mc = isObj(raw.mergeCommit) ? raw.mergeCommit.oid : null
  return { number, state, headSha: head.toLowerCase(), mergeCommitSha: state === 'merged' && typeof mc === 'string' && SHA.test(mc) ? mc.toLowerCase() : null }
}

// 같은 head·base의 PR 목록에서 가장 최근에 만든 것. gh가 주는 순서에 기대지 않는다(만든 시각, 같으면 번호).
export function pickLatestPr(raw: unknown): PrInfo | null {
  if (!Array.isArray(raw)) throw new Error('gh PR 목록이 배열이 아니다')
  let best: { at: number; pr: PrInfo } | null = null
  for (const item of raw) {
    const pr = parsePr(item)
    const at = isObj(item) && typeof item.createdAt === 'string' ? Date.parse(item.createdAt) : Number.NaN
    const key = Number.isNaN(at) ? -Infinity : at
    if (!best || key > best.at || (key === best.at && pr.number > best.pr.number)) best = { at: key, pr }
  }
  return best?.pr ?? null
}

type CheckResult = 'success' | 'failure' | 'pending'
interface Check { name: string; result: CheckResult; label: string }

const RUN_OK = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED'])
const RUN_BAD = new Set(['FAILURE', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE'])
const CTX_BAD = new Set(['FAILURE', 'ERROR'])

function readCheck(item: unknown): Check | null {
  if (!isObj(item)) return null
  const up = (v: unknown): string => (typeof v === 'string' ? v.toUpperCase() : '')
  if (item.__typename === 'StatusContext' || (typeof item.context === 'string' && item.name === undefined)) {
    const name = typeof item.context === 'string' ? item.context : '(이름 없음)'
    const s = up(item.state)
    return { name, label: s || 'UNKNOWN', result: s === 'SUCCESS' ? 'success' : CTX_BAD.has(s) ? 'failure' : 'pending' }
  }
  const name = typeof item.name === 'string' ? item.name : '(이름 없음)'
  const status = up(item.status)
  const conclusion = up(item.conclusion)
  if (status !== 'COMPLETED') return { name, label: status || 'UNKNOWN', result: 'pending' }
  return { name, label: conclusion || 'UNKNOWN', result: RUN_OK.has(conclusion) ? 'success' : RUN_BAD.has(conclusion) ? 'failure' : 'pending' }
}

// requiredChecks를 주면 그 이름의 검사만 본다(하나라도 없으면 pending). 주지 않으면 rollup 전부를 본다. 비었으면 pending.
export function parseCiStatus(raw: unknown, requiredChecks?: readonly string[]): CiStatus {
  if (!isObj(raw)) throw new Error('gh CI 응답이 객체가 아니다')
  const head = raw.headRefOid
  if (typeof head !== 'string' || !SHA.test(head)) throw new Error('gh CI 응답에 머리 SHA가 없다')
  const headSha = head.toLowerCase()
  const rollup = Array.isArray(raw.statusCheckRollup) ? raw.statusCheckRollup : []
  const all = rollup.map(readCheck).filter((c): c is Check => c !== null)
  let checks = all
  if (requiredChecks && requiredChecks.length > 0) {
    const missing = requiredChecks.filter((n) => !all.some((c) => c.name === n))
    if (missing.length > 0) return { state: 'pending', headSha, summary: `필수 검사 ${missing.join(', ')}가 이 머리에 아직 없다` }
    checks = all.filter((c) => requiredChecks.includes(c.name))
  }
  if (checks.length === 0) return { state: 'pending', headSha, summary: '이 머리의 검사가 아직 시작되지 않았다' }
  const show = (list: Check[]): string => list.map((c) => `${c.name} ${c.label}`).join(', ')
  const failed = checks.filter((c) => c.result === 'failure')
  if (failed.length > 0) return { state: 'failure', headSha, summary: show(failed) }
  const pending = checks.filter((c) => c.result === 'pending')
  if (pending.length > 0) return { state: 'pending', headSha, summary: show(pending) }
  return { state: 'success', headSha, summary: show(checks) }
}

export function prNumberFromUrl(text: string): number | null {
  const m = /\/pull\/(\d+)\b/.exec(text)
  return m ? Number(m[1]) : null
}
