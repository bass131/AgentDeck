import { memo, useEffect, useRef, useState, type JSX } from 'react'
import type { LoopStatus } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { StatusBoard } from './LoopScreen'
import { ChatItem, MainChatView } from './MainChatView'
import { NodeSessionView, labelOf } from './NodeSessionView'
import { FilesPanel } from './FilesPanel'
import { sameCwd } from './loopModel'
import { useSessionLog } from './useSessionLog'
import { useWorkStore, type CenterTab } from './workStore'
import './Work.css'

const SESSION = 'session:'
const ARCHIVE = 'archive:'

// 세션 push마다 이 화면이 다시 그려진다 — 받은 값이 그대로인 칸은 건너뛰게 한다
const MainChatPane = memo(MainChatView)
const BoardPane = memo(StatusBoard)
const NodeSessionPane = memo(NodeSessionView)
const FilesPane = memo(FilesPanel)
const store = useWorkStore.getState
const openMain = (): void => store().openTab('main')
const openSession = (key: string): void => store().openTab(`${SESSION}${key}`)
const chooseCwd = (c: string): void => store().choose(c)

function useLoopStatus(cwd: string | null): LoopStatus | null {
  const [status, setStatus] = useState<LoopStatus | null>(null)
  const cwdRef = useRef(cwd)
  const pushCount = useRef(0)
  useEffect(() => {
    const off = ipc.loop.onState((s) => {
      if (!sameCwd(s.cwd, cwdRef.current)) return
      pushCount.current++
      setStatus(s)
    })
    return off
  }, [])
  useEffect(() => {
    cwdRef.current = cwd
    setStatus(null)
    if (cwd === null) return
    let alive = true
    const pushesBefore = pushCount.current
    ipc.loop
      .status({ cwd })
      .then((s) => { if (alive && pushCount.current === pushesBefore) setStatus(s) })
      .catch(() => { /* 현황판이 사유를 보인다 */ })
    return () => { alive = false }
  }, [cwd])
  return status
}

function dateOf(at: string | undefined): Date | null {
  if (at === undefined) return null
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? null : d
}

function ArchiveView({ id }: { id: string }): JSX.Element {
  const archive = useWorkStore((s) => s.archives.find((a) => a.id === id))
  const label = dateOf(archive?.at)?.toLocaleString('ko-KR') ?? id
  return (
    <section className="main-chat archive" aria-label={`지난 메인 대화 ${label}`}>
      <div className="node-session-head"><b>지난 메인 대화</b><small>{label}</small></div>
      <div className="mc-thread" role="log" aria-label="지난 메인 대화 기록">
        <div className="mc-col">
          {archive === undefined ? (
            <div className="node-session-empty">이 기록을 찾지 못했어요</div>
          ) : archive.items.length === 0 ? (
            <div className="node-session-empty">비어 있는 기록이에요</div>
          ) : (
            archive.items.map((item) => <ChatItem key={item.id} item={item} />)
          )}
        </div>
      </div>
      <div className="node-session-ro" role="note">
        <span>지난 메인 대화는 보기 전용이야. 이어서 말하려면 지금의 메인 대화에서 해.</span>
        <button type="button" className="loop-btn" onClick={() => useWorkStore.getState().openTab('main')}>메인 대화로</button>
      </div>
    </section>
  )
}

function TabButton({ label, selected, onSelect }: { label: string; selected: boolean; onSelect: () => void }): JSX.Element {
  return (
    <button type="button" role="tab" aria-label={label} aria-selected={selected} className={'work-tab' + (selected ? ' on' : '')} onClick={onSelect}>
      {label}
    </button>
  )
}

export function WorkView(): JSX.Element {
  const cwd = useWorkStore((s) => s.cwd)
  const center = useWorkStore((s) => s.center)
  const extraTabs = useWorkStore((s) => s.extraTabs)
  const right = useWorkStore((s) => s.right)
  const archives = useWorkStore((s) => s.archives)
  const sessions = useSessionLog(cwd)
  const status = useLoopStatus(cwd)

  const rowOf = (key: string) => status?.sessions.find((r) => r.key === key)
  const tabLabel = (t: CenterTab): string => {
    if (t === 'graph') return '그래프'
    if (t === 'main') return '메인 대화'
    if (t.startsWith(SESSION)) {
      const key = t.slice(SESSION.length)
      return labelOf(key, rowOf(key), sessions.get(key))
    }
    const d = dateOf(archives.find((x) => x.id === t.slice(ARCHIVE.length))?.at)
    return d ? `지난 대화 ${d.getMonth() + 1}/${d.getDate()}` : '지난 대화'
  }
  const centerTab = (t: CenterTab): JSX.Element => (
    <TabButton label={tabLabel(t)} selected={center === t} onSelect={() => store().openTab(t)} />
  )
  const openSessionKey = center.startsWith(SESSION) ? center.slice(SESSION.length) : null
  const openArchiveId = center.startsWith(ARCHIVE) ? center.slice(ARCHIVE.length) : null

  return (
    <>
      <div className="work-center">
        <div className="work-tabs" role="tablist" aria-label="가운데 탭">
          {centerTab('graph')}
          {centerTab('main')}
          {extraTabs.map((t) => (
            <span key={t} className={'work-tab-wrap' + (center === t ? ' on' : '')}>
              {centerTab(t)}
              <button type="button" className="work-tab-x" aria-label={`${tabLabel(t)} 탭 닫기`} onClick={() => store().closeTab(t)}>×</button>
            </span>
          ))}
        </div>
        <div className="work-panel" data-tab-panel="graph" hidden={center !== 'graph'}>
          <div className="work-graph-slot">
            <b>그래프</b>
            <span>마일스톤 템플릿의 노드 그래프가 이 탭에 들어온다(G5). 지금은 오른쪽 현황판에서 진척을 봐.</span>
          </div>
        </div>
        {/* 숨기기만 한다 — 내리면 입력하던 글과 구독을 잃는다 */}
        <div className="work-panel" data-tab-panel="main" hidden={center !== 'main'}>
          <MainChatPane cwd={cwd} />
        </div>
        {openSessionKey !== null && (
          <div className="work-panel" data-tab-panel={center}>
            <NodeSessionPane
              cwd={cwd}
              sessionKey={openSessionKey}
              record={sessions.get(openSessionKey)}
              row={rowOf(openSessionKey)}
              onBack={openMain}
            />
          </div>
        )}
        {openArchiveId !== null && (
          <div className="work-panel" data-tab-panel={center}>
            <ArchiveView id={openArchiveId} />
          </div>
        )}
      </div>
      <aside className="work-side">
        <div className="work-tabs work-rtabs" role="tablist" aria-label="오른쪽 탭">
          <TabButton label="현황판" selected={right === 'board'} onSelect={() => store().setRight('board')} />
          <TabButton label="파일·변경" selected={right === 'files'} onSelect={() => store().setRight('files')} />
        </div>
        <div className="work-panel" data-tab-panel="board" hidden={right !== 'board'}>
          <BoardPane cwd={cwd} onCwdChange={chooseCwd} onOpenSession={openSession} onOpenMain={openMain} />
        </div>
        {right === 'files' && (
          <div className="work-panel" data-tab-panel="files">
            <FilesPane cwd={cwd} main={sessions.get('main')} />
          </div>
        )}
      </aside>
    </>
  )
}
