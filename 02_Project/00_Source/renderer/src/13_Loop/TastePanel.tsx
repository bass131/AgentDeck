// 읽기 전용 — 고치는 길은 메인 대화의 문답과 초안 카드의 확정뿐이다. 이 칸은 턴을 스스로 보내지 않는다.
import { useEffect, useRef, useState, type JSX } from 'react'
import type { DocRead, TasteDialogScope, TasteDocsRead } from '@shared/ipcContract'
import type { CharterDoc, TasteDoc } from '@shared/14_Taste/tasteDoc'
import { ipc } from '@renderer/01_Ipc'
import { errText, sameCwd } from './loopModel'

function TasteBody({ doc }: { doc: TasteDoc }): JSX.Element {
  if (doc.items.length === 0) return <div className="board-empty">항목이 없어요</div>
  return (
    <ul className="files-changes">
      {doc.items.map((it) => (
        <li key={it.id}>
          <div className="loop-node-title">{`${it.id} ${it.title}`}</div>
          {it.fields.map((f, i) => (
            <div key={i}><span className="loop-muted">{`${f.name}: `}</span><span>{f.text}</span></div>
          ))}
        </li>
      ))}
    </ul>
  )
}

function CharterBody({ doc }: { doc: CharterDoc }): JSX.Element {
  return (
    <>
      <div className="loop-muted">목표</div>
      {doc.goal.map((l, i) => <div key={i}>{l}</div>)}
      <div className="loop-muted">하지 않을 것</div>
      {doc.nonGoals === null ? <div className="board-empty">(절이 없어요)</div> : doc.nonGoals.map((l, i) => <div key={i}>{l}</div>)}
    </>
  )
}

function DocSection<T>({ title, read, body }: { title: string; read: DocRead<T>; body: (doc: T) => JSX.Element }): JSX.Element {
  return (
    <section className="board-box" aria-label={title}>
      <h3 className="board-h"><span>{title}</span></h3>
      <div className="loop-mono board-empty">{read.path}</div>
      {read.absent ? (
        <div className="board-empty">아직 없어요</div>
      ) : read.problems.length > 0 ? (
        <>
          <ul className="files-changes loop-err">
            {read.problems.map((p, i) => <li key={i}>{p.line !== null ? `${p.line}줄 — ${p.message}` : p.message}</li>)}
          </ul>
          <pre className="loop-pre">{read.raw}</pre>
        </>
      ) : body(read.doc)}
    </section>
  )
}

const tasteIds = (cards: readonly { kind: string; requestId: string }[]): string =>
  cards.filter((c) => c.kind === 'taste').map((c) => c.requestId).sort().join('\n')

export function TastePanel({ cwd, onOpened }: { cwd: string | null; onOpened: () => void }): JSX.Element {
  const [docs, setDocs] = useState<TasteDocsRead | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [reads, setReads] = useState(0)
  const cwdRef = useRef(cwd)
  const cardIds = useRef<string | null>(null)

  useEffect(() => {
    cwdRef.current = cwd
    cardIds.current = null
    setDocs(null)
    setError(null)
    if (cwd === null) return
    // 초안 카드가 생기거나 사라지면(확정·반려) 문서가 바뀌었을 수 있다
    return ipc.loop.onMainState((v) => {
      if (!sameCwd(v.cwd, cwdRef.current)) return
      const ids = tasteIds(v.cards)
      if (cardIds.current !== null && cardIds.current !== ids) setReads((n) => n + 1)
      cardIds.current = ids
    })
  }, [cwd])

  useEffect(() => {
    if (cwd === null) return
    let live = true
    ipc.taste.read({ cwd })
      .then((d) => { if (live) setDocs(d) })
      .catch((e: unknown) => { if (live) setError(errText(e)) })
    return () => { live = false }
  }, [cwd, reads])

  const open = async (scope: TasteDialogScope): Promise<void> => {
    const c = cwdRef.current
    if (c === null || opening) return
    setOpening(true)
    setError(null)
    try {
      const r = await ipc.loop.tasteOpen({ cwd: c, scope })
      if (!sameCwd(c, cwdRef.current)) return
      if (r.ok) onOpened()
      else setError(r.reason ?? '문답을 열지 못했어요')
    } catch (e) {
      setError(errText(e))
    } finally {
      setOpening(false)
    }
  }

  const missing = docs === null ? [] : [docs.global.absent && '전역 Taste', docs.charter.absent && '프로젝트 헌장'].filter((x): x is string => x !== false)

  return (
    <section className="files-panel" aria-label="헌장·Taste">
      {missing.length > 0 && (
        <div className="loop-notice" role="note">{`${missing.join('·')}이 아직 없어요 — 아래 「문답 열기」로 메인과 같이 써요`}</div>
      )}
      <div className="loop-actions">
        <button type="button" className="loop-btn" disabled={cwd === null || opening} onClick={() => void open('global')}>전역 Taste 문답 열기</button>
        <button type="button" className="loop-btn" disabled={cwd === null || opening} onClick={() => void open('project')}>헌장·Taste 문답 열기</button>
      </div>
      {error !== null && <div className="loop-err">{error}</div>}
      {docs === null ? (
        error === null && <div className="board-empty">문서를 읽는 중…</div>
      ) : (
        <>
          <DocSection title="전역 Taste" read={docs.global} body={(d) => <TasteBody doc={d} />} />
          <DocSection title="프로젝트 헌장" read={docs.charter} body={(d) => <CharterBody doc={d} />} />
          <DocSection title="프로젝트 Taste" read={docs.project} body={(d) => <TasteBody doc={d} />} />
        </>
      )}
    </section>
  )
}
