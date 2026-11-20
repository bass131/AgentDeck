import { useCallback, useEffect, useMemo, useState, type JSX } from 'react'
import type { GitChange, LoopSessionRecord } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { TodosSection } from '@renderer/03_Agent'
import { FileExplorer, type ExplorerSource } from '@renderer/07_Workspace/file'
import { errText } from './loopModel'
import { mainPanelOf, panelKeyOf } from './sessionLogModel'
import { folderName } from './workModel'

interface FilesPanelProps {
  cwd: string | null
  main: LoopSessionRecord | undefined
}

const UNAVAILABLE = '루프 화면에서 이 폴더의 실행기를 열면 파일이 보여요'

// 탐색기는 작업 폴더를 받아 그 트리만 그린다 — 채팅 모드의 폴더·참조 폴더는 읽지도 바꾸지도 않는다(M11 G4)
function workSource(cwd: string): ExplorerSource {
  return { root: cwd, list: (relDir) => ipc.loop.listDir({ cwd, relDir }), unavailable: UNAVAILABLE }
}

export function FilesPanel({ cwd, main }: FilesPanelProps): JSX.Element {
  const source = useMemo(() => (cwd === null ? null : workSource(cwd)), [cwd])
  const [changes, setChanges] = useState<GitChange[] | null>(null)
  const [branch, setBranch] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const panelKey = panelKeyOf(main)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const panel = useMemo(() => mainPanelOf(main), [panelKey])

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
        <div className="files-explorer">
          {source === null
            ? <div className="board-empty">작업 폴더를 먼저 골라요</div>
            : <FileExplorer key={source.root} source={source} />}
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
