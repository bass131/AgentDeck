// 열린 모달의 층(M11 G4 — 설계 감사 22). 모달은 열릴 때 오르고 닫힐 때 내린다. 판정은 CSS 클래스가 아니라 이 층이다.
//   - modal: 맨 위 하나만 Esc를 받는다. Esc 처리가 없는 맨 위(기동 관문)면 아래 모달도 닫히지 않는다.
//   - aside: 권한 카드·최소화 알약·선택 막대. 열린 것으로 세어 Shell의 중단과 Shift+Tab을 막지만 모달보다 위가 되지 않는다.
//     모달이 없을 때는 Esc 처리가 있는 곁 층(알약) 가운데 나중에 오른 하나만 Esc를 받는다.
//   - 판정은 키 한 번마다 window의 capture 단계에서 처음 본 층으로 한다 — 앞 처리기가 층을 내려도 같은 키의 뒤 처리기는 같은 답을 본다.
import { useEffect, useRef } from 'react'

type ModalLayerKind = 'modal' | 'aside'
interface ModalLayerOptions {
  kind?: ModalLayerKind
  onEscape?: () => void
}

interface Layer { id: number; kind: ModalLayerKind; onEscape?: () => void }
interface Seen { any: boolean; top: number | null; esc: number | null }

const layers: Layer[] = []
const seen = new WeakMap<Event, Seen>()
let nextId = 0
let listeningOn: Window | null = null

function last(ok: (l: Layer) => boolean): Layer | undefined {
  for (let i = layers.length - 1; i >= 0; i--) if (ok(layers[i])) return layers[i]
  return undefined
}

function snapshot(e: Event): Seen {
  const got = seen.get(e)
  if (got) return got
  const top = last((l) => l.kind === 'modal')?.id ?? null
  const esc = top ?? last((l) => l.onEscape !== undefined)?.id ?? null
  const s = { any: layers.length > 0, top, esc }
  seen.set(e, s)
  return s
}

function onKeyCapture(e: KeyboardEvent): void {
  const s = snapshot(e)
  if (e.key !== 'Escape' || s.esc === null) return
  layers.find((l) => l.id === s.esc)?.onEscape?.()
}

function listen(): void {
  if (typeof window === 'undefined' || listeningOn === window) return
  listeningOn?.removeEventListener('keydown', onKeyCapture, true)
  window.addEventListener('keydown', onKeyCapture, true)
  listeningOn = window
}

// 층에 오른다. 돌려준 함수로 내린다(두 번 불러도 한 번만 내린다)
export function pushModalLayer(o: ModalLayerOptions = {}): () => void {
  listen()
  const layer: Layer = { id: ++nextId, kind: o.kind ?? 'modal', ...(o.onEscape ? { onEscape: o.onEscape } : {}) }
  layers.push(layer)
  return () => {
    const i = layers.indexOf(layer)
    if (i >= 0) layers.splice(i, 1)
  }
}

// 키 사건을 넘기면 그 키를 처음 본 때의 층으로 답한다
export function isAnyModalOpen(e?: Event): boolean {
  return e ? snapshot(e).any : layers.length > 0
}

// 곁 층을 뺀 모달만 — 최소화 알약이 Esc를 다른 모달에 양보할 때 쓴다
export function isBlockingModalOpen(e?: Event): boolean {
  return e ? snapshot(e).top !== null : last((l) => l.kind === 'modal') !== undefined
}

// 모달 컴포넌트의 등록 한 줄. Esc 처리는 매 렌더의 최신 함수를 부른다
export function useModalLayer(active: boolean, onEscape?: () => void, kind: ModalLayerKind = 'modal'): void {
  const ref = useRef(onEscape)
  ref.current = onEscape
  const hasEscape = onEscape !== undefined
  useEffect(() => {
    if (!active) return
    return pushModalLayer({ kind, ...(hasEscape ? { onEscape: () => ref.current?.() } : {}) })
  }, [active, kind, hasEscape])
}
