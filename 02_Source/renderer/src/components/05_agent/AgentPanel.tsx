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
import type { TodoItem } from '../../../../shared/agentEvents'
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

export function TodosSection({ todos, isRunning = false }: { todos: Todo[]; isRunning?: boolean }): JSX.Element {
  const doneTodos = todos.filter((t) => t.status === 'done').length
  return (
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
  )
}

function SubAgent({
  a,
  onOpen,
}: {
  a: SubAgentInfo
  onOpen: (a: SubAgentInfo) => void
}): JSX.Element {
  const displayLabel = a.displayName ?? a.name
  return (
    <button className={'subagent ' + a.status} onClick={() => onOpen(a)}>
      <span className="sa-ic">{saIcon(displayLabel, 15)}</span>
      <div className="sa-main">
        <div className="sa-name">{displayLabel}</div>
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

export function AgentPanel({
  todos: todosProp,
  subagents: subagentsProp,
  files,
  conversationKey: conversationKeyProp,
}: {
  todos?: Todo[]
  subagents?: SubAgentInfo[]
  files?: FileRowData[]
  conversationKey?: string | null
}): JSX.Element {
  const isRunning = useAppStore(selectIsRunning)
  const changedFiles = useAppStore(selectChangedFiles)
  const errorMessage = useAppStore(selectErrorMessage)
  const scope = useAppStore(selectTaskScope)
  const openFile = useAppStore((s) => s.openFile)
  const storeTodos = useAppStore(selectTodos)
  const todos: Todo[] = todosProp !== undefined ? todosProp : (storeTodos as TodoItem[] as Todo[])

  const storeSubagents = useAppStore(selectSubagents)
  const allSubagents: SubAgentInfo[] = subagentsProp !== undefined ? subagentsProp : storeSubagents

  const storeConversationId = useAppStore((s) => s.conversationId)
  const conversationKey: string | null =
    conversationKeyProp !== undefined ? conversationKeyProp : storeConversationId

  const lastSeenRef = useRef<Map<string, SubAgentInfo>>(new Map())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(() => new Set())

  const prevConversationKeyRef = useRef(conversationKey)
  useEffect(() => {
    if (prevConversationKeyRef.current === conversationKey) return
    prevConversationKeyRef.current = conversationKey
    timersRef.current.forEach((t) => clearTimeout(t))
    timersRef.current.clear()
    lastSeenRef.current.clear()
  }, [conversationKey])

  useEffect(() => {
    for (const a of allSubagents) {
      const prevSeen = lastSeenRef.current.get(a.id)
      if (prevSeen === a) continue
      lastSeenRef.current.set(a.id, a)

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

      if (a.status !== 'done') continue

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
  useEffect(() => () => { timersRef.current.forEach((t) => clearTimeout(t)) }, [])

  const subagents: SubAgentInfo[] = allSubagents.filter((a) => !(a.status === 'done' && hiddenIds.has(a.id)))

  const [openedSubId, setOpenedSubId] = useState<string | null>(null)

  const status = isRunning ? 'running' : errorMessage ? 'error' : 'idle'
  const statusLabel =
    status === 'running' ? '작업 중' : status === 'error' ? '오류' : '대기 중'

  const fileRows: FileRowData[] =
    files != null
      ? files
      : [...changedFiles].map((p) => ({ path: p }))

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
        {(fileRows.length > 0 || scope.toolCount > 0) && (
          <div className="ag-scope" aria-label="작업 범위">
            <span className="ag-scope-chip">파일 {fileRows.length}</span>
            <span className="ag-scope-chip">도구 {scope.toolCount}</span>
          </div>
        )}

        <TodosSection todos={todos} isRunning={isRunning} />

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

      <SubAgentFullscreen
        agent={openedSubId ? (allSubagents.find((sa) => sa.id === openedSubId) ?? null) : null}
        onClose={() => setOpenedSubId(null)}
      />
    </div>
  )
}

export default memo(AgentPanel)
