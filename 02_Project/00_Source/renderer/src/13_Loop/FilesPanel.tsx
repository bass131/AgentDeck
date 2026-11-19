import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { GitChange, LoopSessionRecord } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { useAppStore, selectWorkspaceRoot } from '@renderer/00_App/appStore'
import { TodosSection } from '@renderer/03_Agent'
import { FileExplorer } from '@renderer/07_Workspace/file'
import { errText, sameCwd } from './loopModel'
import { mainPanelOf, panelKeyOf } from './sessionLogModel'
import { folderName } from './workModel'

export interface FilesPanelProps {
  cwd: string | null
  main: LoopSessionRecord | undefined
}

// 탐색기를 작업 폴더로 옮기면 채팅 모드의 작업 폴더가 바뀌므로, 다른 폴더를 보일 때는 알리기만 한다
function explorerNote(cwd: string | null, chatRoot: string | null): string | null {
  if (cwd === null) return null
  if (chatRoot === null) return '탐색기는 채팅 모드에서 연 폴더를 보여요 — 채팅에서 아직 연 폴더가 없어요'
  if (!sameCwd(chatRoot, cwd)) return `탐색기는 채팅 모드에서 연 폴더(${folderName(chatRoot)})를 보여요`
  return null
}

export function FilesPanel({ cwd, main }: FilesPanelProps): JSX.Element {
  const chatRoot = useAppStore(selectWorkspaceRoot)
  const [changes, setChanges] = useState<GitChange[] | null>(null)
  const [branch, setBranch] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panelKey = panelKeyOf(main)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const panel = useMemo(() => mainPanelOf(main), [panelKey])
  const note = explorerNote(cwd, chatRoot)

  const reload = useCallback((): (() => void) => {
    let alive = true
    setError(null)
    if (cwd === null) { setChanges(null); setBranch(null); return () => { alive = false } }
    ipc.git
      .status({ root: cwd })
      .then((g) => {
        if (!alive) return
        setChanges(g?.changes ?? [])
        setBranch(g?.branch ?? null)
      })
      .catch((e: unknown) => { if (alive) setError(errText(e)) })
    return () => { alive = false }
  }, [cwd])
  useEffect(() => reload(), [reload])

  return (
    <section className="files-panel" aria-label="파일·변경">
      <section className="board-box" aria-label="파일">
        <h3 className="board-h"><span>파일</span>{cwd !== null && <small>{`${folderName(cwd)}${branch ? ` · ${branch}` : ''}`}</small>}</h3>
        {note !== null && <div className="board-empty">{note}</div>}
        <div className="files-explorer">
          <FileExplorer />
        </div>
      </section>

      <section className="board-box" aria-label="변경된 파일">
        <h3 className="board-h">
          <span>변경된 파일</span>
          {changes !== null && <small>{changes.length}</small>}
          <button type="button" className="loop-btn files-reload" disabled={cwd === null} onClick={() => { reload() }}>새로 읽기</button>
        </h3>
        {error !== null && <div className="loop-err">{error}</div>}
        {cwd === null ? (
          <div className="board-empty">작업 폴더를 먼저 골라요</div>
        ) : changes === null ? (
          <div className="board-empty">읽는 중이에요</div>
        ) : changes.length === 0 ? (
          <div className="board-empty">아직 변경된 파일이 없어요</div>
        ) : (
          <ul className="files-changes">
            {changes.map((c) => (
              <li key={c.path} className="files-change">
                <span className="loop-mono files-path" title={c.path}>{c.path}</span>
                <span className="files-stat">
                  {c.add !== null && <span className="add">{`+${c.add}`}</span>}
                  {c.del !== null && <span className="del">{`−${c.del}`}</span>}
                  <span className="loop-muted">{c.status}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="board-box" aria-label="할 일">
        <TodosSection todos={panel.todos} />
      </section>

      <section className="board-box" aria-label="서브에이전트">
        <h3 className="board-h"><span>서브에이전트</span><small>{panel.subagents.length}</small></h3>
        {panel.subagents.length === 0 ? (
          <div className="board-empty">메인이 띄운 서브에이전트가 여기 보여</div>
        ) : (
          <ul className="files-subs">
            {panel.subagents.map((a) => (
              <li key={a.id} className="files-sub">
                <span>{a.name}</span>
                <span className="loop-muted">{a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}
