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
import { memo, useState, type JSX } from 'react'
import {
  useAppStore,
  selectIsRunning,
  selectChangedFiles,
  selectErrorMessage,
  selectTodos,
  selectSubagents,
} from '../store/appStore'
import type { Todo, SubAgentInfo } from '../lib/agentSampleData'
import type { TodoItem } from '../../../shared/agent-events'
import { FileBadge } from './FileBadge'
import {
  IconCheck,
  IconChevRight,
  IconSearch,
  IconFile,
  IconList,
  IconBot,
} from './icons'
import { SubAgentFullscreen } from './SubAgentFullscreen'
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
  return (
    <button className={'subagent ' + a.status} onClick={() => onOpen(a)}>
      <span className="sa-ic">{saIcon(a.name, 15)}</span>
      <div className="sa-main">
        <div className="sa-name">{a.name}</div>
        {a.role && <div className="sa-sub">{a.role}</div>}
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
}): JSX.Element {
  const isRunning = useAppStore(selectIsRunning)
  const changedFiles = useAppStore(selectChangedFiles)
  const errorMessage = useAppStore(selectErrorMessage)
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
  const subagents: SubAgentInfo[] = subagentsProp !== undefined ? subagentsProp : storeSubagents

  // SubAgentModal 상태 — AgentPanel 로컬 state
  const [openedAgent, setOpenedAgent] = useState<SubAgentInfo | null>(null)

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
                <SubAgent key={a.id} a={a} onOpen={setOpenedAgent} />
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
      {/* SubAgentFullscreen — 풀스크린 뷰(Phase 37 #3, R2): transcript 포함 */}
      <SubAgentFullscreen agent={openedAgent} onClose={() => setOpenedAgent(null)} />
    </div>
  )
}

export default memo(AgentPanel)
