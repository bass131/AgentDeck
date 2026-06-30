/**
 * slices/viewer.ts — 코드/이미지 뷰어 + 레퍼런스 폴더 슬라이스 (P12 분해).
 *
 * openedFile/Content/Language/Status/Viewer/DataUrl·references·openedRootId + 뷰어 액션.
 * 거동 보존: 액션 본문/초기값은 기존 appStore.ts에서 그대로 이전.
 * CRITICAL: window.api.fsRead 경유만 — fs/Node 직접 0.
 */
import type { StateCreator } from 'zustand'
import { viewerForPath } from '../../lib/viewer'
import type { OpenedViewer } from '../../lib/viewer'
import type { AppStore, ReferenceEntry, OpenedStatus } from './types'

/** 채팅 상단 최근 파일 목록(.chat-files) 최대 개수 — 마지막 열었던 파일부터 5개 */
const MAX_RECENT_FILES = 5

export interface ViewerState {
  // ── 코드 뷰어 (M2-01) ──────────────────────────────────────────────────────
  /** 현재 열린 파일 경로 (null이면 미선택) */
  openedFile: string | null
  /** 파일 내용 (text 응답 시 채워짐) */
  openedContent: string | null
  /** 파일 언어 힌트 (FsReadResponse.language) */
  openedLanguage: string | null
  /** 코드 뷰어 로드 상태 */
  openedStatus: OpenedStatus

  // ── 뷰어 종류 / 이미지 (M2-02) ─────────────────────────────────────────────
  /** 현재 열린 파일의 뷰어 종류 */
  openedViewer: OpenedViewer
  /** 이미지 파일의 data URL (binary 응답 시 채워짐) */
  openedDataUrl: string | null

  // ── 레퍼런스 폴더 (M2-03) ───────────────────────────────────────────────────
  /** 등록된 레퍼런스 폴더 목록 */
  references: ReferenceEntry[]
  /**
   * 현재 열린 파일의 루트 ID.
   * null = 워크스페이스 파일, 'ref-N' = 레퍼런스 파일 → 읽기전용 표시용.
   */
  openedRootId: string | null
}

export interface ViewerActions {
  /**
   * 파일 클릭 → window.api.fsRead(IPC) → 코드 뷰어에 내용 로드.
   * rootId가 있을 때만 root 포함. 없으면 기존 {path} 형태 유지.
   * CRITICAL: window.api.fsRead 경유만 — fs/Node 직접 0.
   */
  openFile: (path: string, rootId?: string) => Promise<void>
  /**
   * 파일 모달 닫기 — openedFile/openedContent/openedStatus/diffFilePath 초기화.
   * openFile 시그니처·기존 셀렉터 무변경.
   */
  closeOpenedFile: () => void
  /**
   * OS 다이얼로그(또는 folderPath 힌트) → referenceAdd IPC → referenceTree IPC
   * → references 배열에 push (중복 id 방지).
   */
  addReference: () => Promise<void>
  /**
   * 세션 시작 시 기존 등록 레퍼런스 목록을 복원.
   * referenceList → 각 id별 referenceTree.
   */
  loadReferences: () => Promise<void>
}

export const createViewerSlice: StateCreator<AppStore, [], [], ViewerState & ViewerActions> = (set, get) => ({
  // ── 초기값 ────────────────────────────────────────────────────────────────
  openedFile: null,
  openedContent: null,
  openedLanguage: null,
  openedStatus: 'idle' as OpenedStatus,
  openedViewer: 'code' as OpenedViewer,
  openedDataUrl: null,
  references: [],
  openedRootId: null,

  openFile: async (path: string, rootId?: string) => {
    // recentFiles 최신순 누적(dedup, 마지막 열었던 파일부터 최근 5개만) — renderer state, IPC 0
    set((s) => {
      const filtered = s.recentFiles.filter((p) => p !== path)
      return { recentFiles: [path, ...filtered].slice(0, MAX_RECENT_FILES) }
    })
    // 파일 종류를 경로로 판별
    const viewer = viewerForPath(path)

    // loading 상태로 전환. openedViewer는 미리 세팅 (깜빡임 최소화)
    set({
      openedFile: path,
      openedStatus: 'loading',
      openedContent: null,
      openedLanguage: null,
      openedDataUrl: null,
      openedViewer: viewer,
      // rootId 유무로 읽기전용 판별 — loading 진입 시 미리 세팅
      openedRootId: rootId ?? null,
    })

    try {
      // 이미지일 때만 asBinary:true. rootId가 있을 때만 root 포함.
      // 기존 {path} 단언이 root 없는 케이스를 검사하므로 조건부로만 추가.
      let req: { path: string; asBinary?: boolean; root?: string }
      if (viewer === 'image') {
        req = rootId ? { path, asBinary: true, root: rootId } : { path, asBinary: true }
      } else {
        req = rootId ? { path, root: rootId } : { path }
      }

      // IPC 경유 — renderer는 fs/Node 직접 0
      const res = await window.api.fsRead(req)

      switch (res.kind) {
        case 'text':
          set({
            openedContent: res.content,
            openedLanguage: res.language,
            openedStatus: 'ready',
            openedDataUrl: null,
          })
          break
        case 'binary':
          // M2-02: 이미지 data URL 세팅
          set({
            openedDataUrl: res.dataUrl,
            openedContent: null,
            openedLanguage: null,
            openedStatus: 'ready',
          })
          break
        case 'too-large':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'too-large' })
          break
        case 'binary-skipped':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'binary-skipped' })
          break
        case 'not-found':
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
          break
        default: {
          // 타입 exhaustive 체크용 — 컴파일 시점에 never
          const _exhaustive: never = res
          void _exhaustive
          set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
        }
      }
    } catch {
      set({ openedContent: null, openedLanguage: null, openedDataUrl: null, openedStatus: 'not-found' })
    }
  },

  // ── 파일 모달 닫기 (F15-02) ──────────────────────────────────────────────
  closeOpenedFile: () => {
    set({
      openedFile: null,
      openedContent: null,
      openedLanguage: null,
      openedStatus: 'idle',
      openedDataUrl: null,
      diffFilePath: null,
    })
  },

  // ── 레퍼런스 폴더 (M2-03) ────────────────────────────────────────────────
  addReference: async () => {
    // IPC 경유 — main이 OS 다이얼로그 / 경로 검증 / ID 발급 담당
    const res = await window.api.referenceAdd({})
    if (!res.reference) return // 사용자 취소 or 검증 실패

    const { id, name } = res.reference

    // 중복 방지 — 이미 같은 id가 등록되어 있으면 skip
    const existing = get().references
    if (existing.some((r) => r.id === id)) return

    // 트리 로드 (IPC 경유)
    const treeRes = await window.api.referenceTree({ id })
    const tree = treeRes.tree

    set((s) => ({
      references: [...s.references, { id, name, tree }],
    }))
  },

  loadReferences: async () => {
    // IPC 경유 — 세션 초기화 시 기존 등록 목록 복원
    const listRes = await window.api.referenceList({})
    const entries = await Promise.all(
      listRes.references.map(async (ref) => {
        const treeRes = await window.api.referenceTree({ id: ref.id })
        return { id: ref.id, name: ref.name, tree: treeRes.tree }
      })
    )
    set({ references: entries })
  },
})
