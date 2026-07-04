/**
 * AgentPanel.tsx — 우측 에이전트 패널 (F4-01, F10-02 강화).
 *
 * F10-02 추가:
 *   - Todos: 진행바(.progress > i) + todo 행(.box/.lab/spin, .done/.running/.planned)
 *   - SubAgent 카드 + SubAgentModal
 *   - FileRow: FileBadge + path(dir+name) + stat(add/del/tag optional) + fchev
 *
 * optional props todos/subagents/files (기본 []) — 라이브 빈상태 유지.
 * <AgentPanel/> 무인자 호출 = 기존 Shell.tsx 그대로 유지.
 *
 * CRITICAL: renderer untrusted — window.api 호출 0.
 * 인라인 색상 0(progress width 동적 % 인라인 style은 허용 — 색 아님).
 */
import { memo, useState, useEffect, useRef, type JSX } from 'react'
import {
  useAppStore,
  selectIsRunning,
  selectChangedFiles,
  selectErrorMessage,
  selectTodos,
  selectSubagents,
  selectTaskScope,
} from '../../store/appStore'
import type { Todo, SubAgentInfo } from '../../lib/agentSampleData'
import type { TodoItem } from '../../../../shared/agent-events'
import { FileBadge } from '../02_file/FileBadge'
import {
  IconCheck,
  IconChevRight,
  IconSearch,
  IconFile,
  IconList,
  IconBot,
} from '../common/icons'
import { SubAgentFullscreen } from './SubAgentFullscreen'
import { SubAgentModelBadge } from './SubAgentModelBadge'
import './AgentPanel.css'

// ── saIcon 헬퍼 ────────────────────────────────────────────────────────────────
function saIcon(name: string, size: number): JSX.Element {
  const n = name.toLowerCase()
  if (n.includes('explore') || n.includes('search') || n.includes('탐색'))
    return <IconSearch size={size} />
  if (n.includes('verify') || n.includes('test') || n.includes('검증'))
    return <IconCheck size={size} />
  if (n.includes('build') || n.includes('구현') || n.includes('code') || n.includes('file'))
    return <IconFile size={size} />
  return <IconBot size={size} />
}

// ── Todos 섹션 ─────────────────────────────────────────────────────────────────
function Todos({ todos }: { todos: Todo[] }): JSX.Element {
  const total = todos.length
  const done = todos.filter((t) => t.status === 'done').length
  const pct = total ? Math.round((done / total) * 100) : 0
  return (
    <div>
      <div className="progress">
        <i style={{ width: pct + '%' }} />
      </div>
      <div className="todos scroll">
        {todos.map((t) => (
          <div key={t.id} className={'todo ' + t.status}>
            <span className="box">
              {t.status === 'done' && <IconCheck size={12} />}
            </span>
            <span className="lab">{t.label}</span>
            {t.status === 'running' && (
              <span style={{ marginLeft: 'auto' }}>
                <span className="spin" />
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── SubAgent 카드 ──────────────────────────────────────────────────────────────
function SubAgent({
  a,
  onOpen,
}: {
  a: SubAgentInfo
  onOpen: (a: SubAgentInfo) => void
}): JSX.Element {
  // CP1 렌더러 후속(P07 displayName 소비 — 모델배지 3곳 확장 선례와 동일하게 이 우측 패널
  // 카드도 함께 배선): 사람이 붙인 표시명이 있으면 그걸 우선 노출한다. NG-1 계약 불변
  // (a.name=subagent_type은 별개 필드로 보존, 여기서 덮어쓰지 않는다).
  const displayLabel = a.displayName ?? a.name
  return (
    <button className={'subagent ' + a.status} onClick={() => onOpen(a)}>
      <span className="sa-ic">{saIcon(displayLabel, 15)}</span>
      <div className="sa-main">
        <div className="sa-name">{displayLabel}</div>
        {/* 모델 배지(영호 재육안 2026-07-04 진단): 이 행이 SubAgentModelBadge 노출 지점
            확대(SubAgentInline/SubAgentFullscreen, 영호 육안 피드백 2026-07-04)에서
            누락된 세 번째 표시 지점이었다 — 단일챗 전용(멀티패널엔 이 우측 패널 자체가
            없음) 위젯인데 배지가 여기만 빠져 있었다. role은 순수 텍스트(.sa-sub, NG-1
            혼입금지 계약 유지 — role/모델을 같은 요소에 합성하지 않는다), 배지는 별도
            칩(compact). 둘 다 없으면 행 자체 미렌더(자리 예약 금지, 배지 비동기 도착 —
            FB2 P07 — 시 레이아웃 점프 최소화). */}
        {(a.role || a.model) && (
          <div className="sa-meta">
            {a.role && <div className="sa-sub">{a.role}</div>}
            <SubAgentModelBadge model={a.model} running={a.status === 'running'} compact />
          </div>
        )}
      </div>
      <span className="sa-status">
        {a.status === 'running' && <span className="spin" />}
        {a.status === 'done' && (
          <span className="sa-check">
            <IconCheck size={12} />
          </span>
        )}
        {a.status === 'queued' && <span className="sa-dot" />}
      </span>
      <IconChevRight className="sa-chev" size={15} />
    </button>
  )
}

// ── FileRow ────────────────────────────────────────────────────────────────────
interface FileRowData {
  path: string
  add?: number
  del?: number
  tag?: 'new' | 'edit'
}

function FileRow({ f, onOpen }: { f: FileRowData; onOpen: (path: string) => void }): JSX.Element {
  const slash = Math.max(f.path.lastIndexOf('/'), f.path.lastIndexOf('\\'))
  const dir = slash >= 0 ? f.path.slice(0, slash + 1) : ''
  const name = slash >= 0 ? f.path.slice(slash + 1) : f.path
  const hasStats = f.add != null || f.del != null || f.tag != null
  return (
    <button
      type="button"
      className="file"
      title={f.path}
      onClick={() => onOpen(f.path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(f.path)
        }
      }}
    >
      <FileBadge path={f.path} size={18} />
      <span className="path">
        <span className="dir">{dir}</span>
        {name}
      </span>
      {hasStats && (
        <span className="stat">
          {f.add != null ? <span className="add">+{f.add}</span> : null}
          {f.del != null ? <span className="del">-{f.del}</span> : null}
          {f.tag != null ? (
            <span className={'tag ' + (f.tag === 'new' ? 'new' : 'edit')}>
              {f.tag === 'new' ? 'NEW' : 'EDIT'}
            </span>
          ) : null}
        </span>
      )}
      <IconChevRight size={14} className="fchev" />
    </button>
  )
}

// ── AgentPanel ─────────────────────────────────────────────────────────────────
export function AgentPanel({
  todos: todosProp,
  subagents: subagentsProp,
  files,
  conversationKey: conversationKeyProp,
}: {
  /**
   * optional: 할 일 목록.
   * 전달 시 prop 우선(테스트·시각 override). 미전달 시 store selectTodos로 자동 채움.
   * Phase 24a: store 배선 완료 — 실행 중 백엔드 TodoWrite 이벤트가 자동 반영됨.
   */
  todos?: Todo[]
  /**
   * optional: 서브에이전트 목록.
   * 전달 시 prop 우선(테스트·시각 override). 미전달 시 store selectSubagents로 자동 채움.
   * Phase 24b: store 배선 완료 — 실행 중 subagent 이벤트가 자동 반영됨.
   */
  subagents?: SubAgentInfo[]
  /** optional: 변경파일 + 태그 (있을 때만 stat 렌더 — M4 diff 데이터 후속) */
  files?: FileRowData[]
  /**
   * optional: 현재 표시 중인 대화 식별자(CP1 P06 ③, 전환 감지 신호).
   * 전달 시 prop 우선(테스트 override). 미전달 시 store의 conversationId로 자동 채움.
   * AgentPanel은 대화가 바뀌어도 리마운트되지 않는 Shell 수명 컴포넌트라(key 없음),
   * lastSeenRef/timersRef(F-D 2초 숨김 타이머 추적)가 대화 경계를 넘어 그대로
   * 유지된다 — 이 값이 바뀌면(전환 감지) 그 추적 상태를 초기화한다.
   */
  conversationKey?: string | null
}): JSX.Element {
  const isRunning = useAppStore(selectIsRunning)
  const changedFiles = useAppStore(selectChangedFiles)
  const errorMessage = useAppStore(selectErrorMessage)
  // B2: 작업 범위(파일·도구 수) — 실데이터(changedFiles + thread toolgroup) 파생.
  const scope = useAppStore(selectTaskScope)
  // openFile: store action — IPC 담당. renderer에서 직접 fs/window.api 호출 0.
  const openFile = useAppStore((s) => s.openFile)
  // 24a: store 할 일 목록 — prop 없을 때 자동 채움
  const storeTodos = useAppStore(selectTodos)
  // prop 전달 시 prop 우선(테스트/시각 override), 미전달 시 store 사용
  // Todo와 TodoItem은 동형(id·label·status 구조 동일) → 타입 캐스트 불필요
  const todos: Todo[] = todosProp !== undefined ? todosProp : (storeTodos as TodoItem[] as Todo[])

  // 24b: store 서브에이전트 목록 — prop 없을 때 자동 채움
  const storeSubagents = useAppStore(selectSubagents)
  // prop 전달 시 prop 우선(테스트/시각 override), 미전달 시 store 사용
  const allSubagents: SubAgentInfo[] = subagentsProp !== undefined ? subagentsProp : storeSubagents

  // CP1 P06 ③: 현재 표시 중인 대화 식별자 — prop 우선(테스트 override), 미전달 시 store.
  const storeConversationId = useAppStore((s) => s.conversationId)
  const conversationKey: string | null =
    conversationKeyProp !== undefined ? conversationKeyProp : storeConversationId

  // ── F-D: 완료 서브에이전트를 "마지막 갱신 후" 2초 뒤 우측 패널에서 제거 ──────────
  // 사용자 요구(원 설계): 끝난 SubAgent가 계속 남는 문제 → 완료 즉시 제거가 아니라 2초 뒤
  // 표기 제거. 타이머는 reducer 밖(순수성 보존) — 컴포넌트 effect에서. 채팅 인라인 카드
  // (F-G)는 영속(미적용).
  //
  // coordinator 결정(2026-07-04, F-D vs 지연 모델배지 경합 진단 후속 — (b) 채택):
  // 기존엔 "최초 done 관측 시점" 기준 1회 고정 스케줄이라, FB2 P07처럼 모델 필드가 done
  // 이후 늦게 도착하면 이미 지나간 타이머가 카드를 지워버려 배지를 영영 볼 수 없었다
  // (실증: m4-4-subagent-panel.test.tsx "[위험 실증]" — 2026-07-04 진단, 이 커밋에서
  // fix 테스트로 전환). 대안 비교: (a) 임의 연장은 지연폭 실측 근거가 없고, (c) 모델
  // 미도착 에이전트는 카드가 영구 잔존해 정리 기능 자체가 무력화된다. (b) 데이터 갱신 시
  // 타이머 리셋을 채택 — "done 후 2초"가 "마지막 갱신 후 2초"로 의미가 자연스럽게 바뀌고
  // 신규 상수 0, 기존 UX 의도(완료 후 잠깐 보이다 사라짐)를 그대로 보존한다. 늦게 도착한
  // 모델은 배지가 그 시점부터 다시 2초간 보인 뒤 숨겨진다.
  //
  // 변경 감지: 참조 동일성만 본다(깊은 비교 불필요) — reducer 전역 관례(notice.ts
  // handleSubagent/text.ts handleText/tool.ts 전부 `sa.id !== targetId ? sa : {...}` 패턴
  // 이라 변경 안 된 항목은 항상 같은 객체 참조를 유지, 이 컴포넌트가 임의로 가정한 게
  // 아니라 리듀서 쪽 기존 불변식). id별 타이머를 Map으로 관리해 갱신 시 clear 후 재스케줄.
  const lastSeenRef = useRef<Map<string, SubAgentInfo>>(new Map())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())

  // CP1 P06 ③(대화 전환 감지 — "완만 재노출" 엣지 봉합): AgentPanel은 대화가 바뀌어도
  // 리마운트되지 않는다(Shell 수명, key 없음) — lastSeenRef/timersRef가 대화 경계를
  // 넘어 그대로 유지된다. store의 대화 전환 경로 중 일부(sessions.ts selectConversation
  // 디스크 로드 경로)는 subagents 필드 참조를 항상 재설정하지 않으므로, 배열 참조가
  // 안 바뀌면 아래 프루닝 이펙트(②, [allSubagents] 의존)조차 재실행되지 않아 이전
  // 대화에서 예약된 숨김 타이머가 취소되지 않고 살아남을 수 있다 — 사용자가 이미 다른
  // 대화를 보고 있는 동안 뒤늦게 발화해 상태를 오염시킨다. conversationKey 변화를
  // 배열 참조와 독립된 전환 신호로 써서 즉시 정리한다. 최초 마운트(ref 초기값이 곧
  // 현재 값)는 전환이 아니므로 초기화하지 않는다.
  const prevConversationKeyRef = useRef(conversationKey)
  useEffect(() => {
    if (prevConversationKeyRef.current === conversationKey) return
    prevConversationKeyRef.current = conversationKey
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current.clear()
    lastSeenRef.current.clear()
    // hiddenIds는 건드리지 않는다 — id가 실제로 재사용되지 않는 한(전역 유일 tool_use id)
    // 새 대화의 항목과 충돌하지 않으므로, 굳이 비워 "이미 숨겨졌어야 할" 항목을 화면에
    // 되살릴 필요가 없다(② 프루닝이 배열에서 사라진 id의 hiddenIds 잔존은 별도 범위).
  }, [conversationKey])

  useEffect(() => {
    for (const a of allSubagents) {
      const prevSeen = lastSeenRef.current.get(a.id)
      if (prevSeen === a) continue // 참조 불변 = 이 항목은 갱신 안 됨(다른 항목 변경으로 배열만 재생성) — 스킵.
      lastSeenRef.current.set(a.id, a)

      // 갱신됐다 — 예정된 숨김 타이머가 있으면 취소(재스케줄 전 clear, coordinator 지시)하고,
      // 혹시 이미 숨겨져 있었다면 즉시 재노출(늦게 도착한 데이터를 2초간 다시 보여준다).
      const existingTimer = timersRef.current.get(a.id)
      if (existingTimer) {
        clearTimeout(existingTimer)
        timersRef.current.delete(a.id)
      }
      setHiddenIds((prev) => {
        if (!prev.has(a.id)) return prev
        const next = new Set(prev)
        next.delete(a.id)
        return next
      })

      if (a.status !== 'done') continue // running/queued — 숨김 스케줄 불필요(reviewer #2 가드 계승).

      // done이고 "지금" 갱신됨 → 이 시점부터 2초 뒤 숨김.
      const t = setTimeout(() => {
        timersRef.current.delete(a.id)
        setHiddenIds((prev) => {
          if (prev.has(a.id)) return prev
          const next = new Set(prev)
          next.add(a.id)
          return next
        })
      }, 2000)
      timersRef.current.set(a.id, t)
    }

    // CP1 P06 ②(맵 프루닝): allSubagents에서 사라진 id는 lastSeenRef/timersRef에 방치되면
    // 안 된다 — 예약된 타이머가 이미 화면에 없는 항목을 위해 계속 살아있는 누수이자,
    // (드물게 id가 재사용되면) 잘못된 시점에 발화할 위험도 있다. 배열 교체(예: 대화 초기화
    // subagents: [])마다 현재 존재하는 id 집합과 diff해 사라진 항목만 정리한다.
    const currentIds = new Set(allSubagents.map((a) => a.id))
    for (const id of lastSeenRef.current.keys()) {
      if (currentIds.has(id)) continue
      lastSeenRef.current.delete(id)
      const staleTimer = timersRef.current.get(id)
      if (staleTimer) {
        clearTimeout(staleTimer)
        timersRef.current.delete(id)
      }
    }
  }, [allSubagents])
  // 언마운트 시 예정된 타이머 전부 정리(누수 0).
  useEffect(() => () => { timersRef.current.forEach((t) => clearTimeout(t)) }, [])

  // hide는 "현재 done이고 2초 경과(hiddenIds)" 일 때만 — done→running 역전 시 다시 표시(reviewer #2 가드).
  const subagents: SubAgentInfo[] = allSubagents.filter((a) => !(a.status === 'done' && hiddenIds.has(a.id)))

  // F-E: 상세는 id 기반 라이브 조회 — 열린 동안 transcript가 실시간 갱신됨(스냅샷 아님).
  const [openedSubId, setOpenedSubId] = useState<string | null>(null)

  const status = isRunning ? 'running' : errorMessage ? 'error' : 'idle'
  const statusLabel =
    status === 'running' ? '작업 중' : status === 'error' ? '오류' : '대기 중'

  // files prop 있으면 prop 우선, 없으면 store changedFiles(경로만 — stat 미렌더)
  const fileRows: FileRowData[] =
    files != null
      ? files
      : [...changedFiles].map((p) => ({ path: p }))

  const doneTodos = todos.filter((t) => t.status === 'done').length
  const runningSub = subagents.filter((a) => a.status === 'running').length
  const doneSub = subagents.filter((a) => a.status === 'done').length

  return (
    <div className="agent-panel">
      <div className="ag-head">
        <span className="ag-title">에이전트</span>
        <span className={`ag-pill ${status}`}>
          <span className="ag-pill-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </div>

      <div className="ag-scroll">
        {/* B2: 작업 범위 칩 (파일·도구 수) — 실데이터 있을 때만 표시 */}
        {(fileRows.length > 0 || scope.toolCount > 0) && (
          <div className="ag-scope" aria-label="작업 범위">
            <span className="ag-scope-chip">파일 {fileRows.length}</span>
            <span className="ag-scope-chip">도구 {scope.toolCount}</span>
          </div>
        )}

        {/* 할 일 */}
        <section className="ag-sec">
          <div className="ag-sec-head">
            <IconList size={14} className="ag-sec-icon" />
            <span className="ag-sec-title">할 일</span>
            <span className="ag-count">
              {doneTodos}/{todos.length || 0}
            </span>
          </div>
          {todos.length ? (
            <Todos todos={todos} />
          ) : (
            <p className="ag-empty">
              {isRunning ? '계획을 수립하는 중…' : '아직 할 일이 없어요'}
            </p>
          )}
        </section>

        {/* 서브에이전트 */}
        <section className="ag-sec">
          <div className="ag-sec-head">
            <IconBot size={14} className="ag-sec-icon" />
            <span className="ag-sec-title">서브에이전트</span>
            <span className="ag-count">
              {runningSub > 0
                ? runningSub + ' 실행 중'
                : doneSub + '/' + (subagents.length || 0)}
            </span>
          </div>
          {subagents.length ? (
            <div className="subagents">
              {subagents.map((a) => (
                <SubAgent key={a.id} a={a} onOpen={(sa) => setOpenedSubId(sa.id)} />
              ))}
            </div>
          ) : (
            <p className="ag-empty">아직 서브에이전트가 없어요</p>
          )}
        </section>

        {/* 변경된 파일 */}
        <section className="ag-sec">
          <div className="ag-sec-head">
            <IconFile size={14} className="ag-sec-icon" />
            <span className="ag-sec-title">변경된 파일</span>
            <span className="ag-count">{fileRows.length}</span>
          </div>
          {fileRows.length ? (
            <div className="files">
              {fileRows.map((f) => (
                <FileRow key={f.path} f={f} onOpen={openFile} />
              ))}
            </div>
          ) : (
            <p className="ag-empty">아직 변경된 파일이 없어요</p>
          )}
        </section>
      </div>

      {/* SubAgentModal — F10-02 시각자산 보존(삭제 금지) */}
      {/* SubAgentFullscreen — 풀스크린 뷰(Phase 37 #3, R2): transcript 포함.
          F-E: openedSubId로 allSubagents에서 라이브 조회 — 열린 동안 실시간 갱신 + hide 후에도 열람 가능. */}
      <SubAgentFullscreen
        agent={openedSubId ? (allSubagents.find((sa) => sa.id === openedSubId) ?? null) : null}
        onClose={() => setOpenedSubId(null)}
      />
    </div>
  )
}

export default memo(AgentPanel)
