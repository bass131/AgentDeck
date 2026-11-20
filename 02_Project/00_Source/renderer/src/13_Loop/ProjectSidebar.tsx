import { useEffect, useRef, useState, type JSX } from 'react'
import type { LoopStatus } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { IconPlus } from '@renderer/02_Common/icons'
import { cwdKey, sameCwd } from './loopModel'
import { folderName, projectTag } from './workModel'
import { useWorkStore } from './workStore'
import { alertsOf, useAlertStore } from './alertStore'

function useProjectStatuses(projects: readonly string[]): ReadonlyMap<string, LoopStatus> {
  const [map, setMap] = useState<ReadonlyMap<string, LoopStatus>>(() => new Map())
  const listRef = useRef(projects)
  listRef.current = projects

  useEffect(() => {
    const off = ipc.loop.onState((s) => {
      const hit = listRef.current.find((p) => sameCwd(p, s.cwd))
      if (hit === undefined) return
      setMap((m) => new Map(m).set(cwdKey(hit), s))
    })
    return off
  }, [])

  const keys = projects.map(cwdKey).join('\n')
  useEffect(() => {
    let alive = true
    for (const p of listRef.current) {
      ipc.loop
        .status({ cwd: p })
        .then((s) => {
          if (!alive) return
          setMap((m) => (m.has(cwdKey(p)) ? m : new Map(m).set(cwdKey(p), s)))
        })
        .catch(() => { /* 꼬리표 없이 둔다 */ })
    }
    return () => { alive = false }
  }, [keys])

  return map
}

function clockLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`
}

export function ProjectSidebar(): JSX.Element {
  const cwd = useWorkStore((s) => s.cwd)
  const projects = useWorkStore((s) => s.projects)
  const center = useWorkStore((s) => s.center)
  const archives = useWorkStore((s) => s.archives)
  const statuses = useProjectStatuses(projects)
  const alerts = useAlertStore((s) => s.alerts)
  const [branch, setBranch] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const active = cwd === null ? undefined : statuses.get(cwdKey(cwd))

  useEffect(() => { setBranch(null) }, [cwd])
  // goal이 바뀌면 브랜치도 바뀐다 — 노드·단계가 바뀔 때마다 다시 읽는다
  useEffect(() => {
    if (cwd === null) return
    let alive = true
    ipc.git
      .status({ root: cwd })
      .then((g) => { if (alive) setBranch(g?.branch ?? null) })
      .catch(() => { /* 브랜치 없이 둔다 */ })
    return () => { alive = false }
  }, [cwd, active?.node, active?.phase])

  // 새 메인 대화는 장 표지를 바꾼다. 마운트 뒤 첫 push는 그 사이 장이 바뀌었을 수 있어 다시 읽는다
  useEffect(() => {
    if (cwd === null) return
    void useWorkStore.getState().loadArchives(cwd)
    let chapter: string | null = null
    const off = ipc.loop.onMainState((v) => {
      if (!sameCwd(v.cwd, cwd) || v.chapter === chapter) return
      chapter = v.chapter
      void useWorkStore.getState().loadArchives(cwd)
    })
    return off
  }, [cwd])

  const openProject = async (): Promise<void> => {
    setError(null)
    try {
      const r = await ipc.workspace.pickFolder()
      if (r.path !== null) useWorkStore.getState().choose(r.path)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="sb-projects">
      <div className="sb-label">프로젝트</div>
      <ul className="sb-proj-list" aria-label="프로젝트">
        {projects.map((p) => {
          const active = sameCwd(p, cwd)
          const tag = projectTag(statuses.get(cwdKey(p)) ?? null)
          const alert = alertsOf(alerts, p)[0]
          return (
            <li key={p} className="sb-proj" data-active={active ? 'true' : 'false'}>
              <button type="button" className="sb-proj-head" title={alert ? `${p}\n${alert.text}` : p} onClick={() => useWorkStore.getState().choose(p)}>
                <span className="sb-proj-name">{folderName(p)}</span>
                {tag !== null && <small className="sb-proj-tag" data-tone={tag.tone}>{tag.label}</small>}
                {alert && <span className="sb-proj-alert" data-level={alert.level} aria-hidden="true" />}
              </button>
              {active && (
                <div className="sb-proj-body">
                  <div className="sb-proj-wt">{`기본 폴더 · ${branch ?? '—'}`}</div>
                  <button
                    type="button"
                    className={'sb-proj-item' + (center === 'main' ? ' on' : '')}
                    onClick={() => useWorkStore.getState().openTab('main')}
                  >
                    메인 대화
                  </button>
                  {archives.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      className={'sb-proj-item past' + (center === `archive:${a.id}` ? ' on' : '')}
                      onClick={() => useWorkStore.getState().openTab(`archive:${a.id}`)}
                    >
                      {`지난 메인 대화 · ${clockLabel(a.at)}`}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )
        })}
      </ul>
      {projects.length === 0 && <div className="sb-empty">아직 프로젝트가 없어요</div>}
      <button type="button" className="sb-proj-open" onClick={() => void openProject()}>
        <IconPlus size={13} />
        <span>프로젝트 열기</span>
      </button>
      {error !== null && <div className="sb-proj-err">{error}</div>}
    </div>
  )
}
