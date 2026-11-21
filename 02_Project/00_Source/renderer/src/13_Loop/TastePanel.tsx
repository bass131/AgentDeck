// 읽기 전용 — 고치는 길은 메인 대화의 문답과 초안 카드의 확정뿐이다. 이 칸은 턴을 스스로 보내지 않는다.
import { useEffect, useRef, useState, type JSX } from 'react'
import { sameDocText, TASTE_DOC_LABEL, type DocRead, type MainChatView, type TasteDialogScope, type TasteDocsRead, type TastePrNote } from '@shared/ipcContract'
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

// 기록은 main이 PR이 열려 있는 동안만 둔다. 그래도 PR이 쓴 원문이 이미 로컬에 있으면 보이지 않는다
function pendingPr(docs: TasteDocsRead | null, note: TastePrNote | undefined): TastePrNote | null {
  if (docs === null || note === undefined) return null
  if (note.doc === undefined || note.text === undefined) return note
  const local = note.doc === 'charter' ? docs.charter : docs.project
  return !local.absent && sameDocText(local.raw, note.text) ? null : note
}

export function TastePanel({ cwd, onOpened }: { cwd: string | null; onOpened: () => void }): JSX.Element {
  const [docs, setDocs] = useState<TasteDocsRead | null>(null)
  const [readError, setReadError] = useState<string | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [opening, setOpening] = useState(false)
  const [reads, setReads] = useState(0)
  const [prNote, setPrNote] = useState<TastePrNote | undefined>(undefined)
  const cwdRef = useRef(cwd)
  const cardIds = useRef<string | null>(null)

  useEffect(() => {
    cwdRef.current = cwd
    cardIds.current = null
    setDocs(null)
    setReadError(null)
    setOpenError(null)
    setPrNote(undefined)
    if (cwd === null) return
    let live = true
    let pushed = false
    // 초안 카드가 생기거나 사라지면(확정·반려) 문서가 바뀌었을 수 있다
    const seen = (v: MainChatView): void => {
      const ids = tasteIds(v.cards)
      if (cardIds.current !== null && cardIds.current !== ids) setReads((n) => n + 1)
      cardIds.current = ids
      setPrNote(v.tastePr)
    }
    const off = ipc.loop.onMainState((v) => {
      if (!sameCwd(v.cwd, cwdRef.current)) return
      pushed = true
      seen(v)
    })
    ipc.loop.mainRead({ cwd })
      .then((v) => { if (live && !pushed) seen(v) })
      .catch(() => { /* 대화 기록을 못 읽어도 문서는 보인다 */ })
    return () => { live = false; off() }
  }, [cwd])

  useEffect(() => {
    if (cwd === null) return
    let live = true
    ipc.taste.read({ cwd })
      .then((d) => { if (live) { setDocs(d); setReadError(null) } })
      .catch((e: unknown) => { if (live) setReadError(errText(e)) })
    return () => { live = false }
  }, [cwd, reads])

  const open = async (scope: TasteDialogScope): Promise<void> => {
    const c = cwdRef.current
    if (c === null || opening) return
    setOpening(true)
    setOpenError(null)
    try {
      const r = await ipc.loop.tasteOpen({ cwd: c, scope })
      if (!sameCwd(c, cwdRef.current)) return
      if (r.ok) onOpened()
      else setOpenError(r.reason ?? '문답을 열지 못했어요')
    } catch (e) {
      setOpenError(errText(e))
    } finally {
      setOpening(false)
    }
  }

  const pr = pendingPr(docs, prNote)
  const missing = docs === null ? [] : [
    docs.global.absent && '전역 Taste',
    docs.charter.absent && pr?.doc !== 'charter' && '프로젝트 헌장',
  ].filter((x): x is string => typeof x === 'string')

  return (
    <section className="files-panel" aria-label="헌장·Taste">
      {missing.length > 0 && (
        <div className="loop-notice" role="note">{`${missing.join('·')}이 아직 없어요 — 아래 「문답 열기」로 메인과 같이 써요`}</div>
      )}
      {pr !== null && (
        <div className="loop-notice" role="status">{`${pr.doc ? `${TASTE_DOC_LABEL[pr.doc]} 확정` : '문서 확정'} PR #${pr.pr}(${pr.branch})이 열려 있어요 — 병합해 이 브랜치로 받으면 아래에 보여요`}</div>
      )}
      <div className="loop-actions">
        <button type="button" className="loop-btn" disabled={cwd === null || opening} onClick={() => void open('global')}>전역 Taste 문답 열기</button>
        <button type="button" className="loop-btn" disabled={cwd === null || opening} onClick={() => void open('project')}>헌장·Taste 문답 열기</button>
      </div>
      {openError !== null && <div className="loop-err">{openError}</div>}
      {readError !== null && <div className="loop-err">{`문서를 읽지 못했어요 — ${readError}`}</div>}
      {docs === null ? (
        readError === null && <div className="board-empty">문서를 읽는 중…</div>
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
