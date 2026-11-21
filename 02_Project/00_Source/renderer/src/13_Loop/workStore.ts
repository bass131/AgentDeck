import { create } from 'zustand'
import type { MainChatArchive } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { getPref, setPref } from '@renderer/11_Settings/prefs'
import { cwdKey, sameCwd } from './loopModel'
import { addProject } from './workModel'

const WORK_CWD_PREF = 'work.cwd'
const WORK_PROJECTS_PREF = 'work.projects'

export type CenterTab = 'graph' | 'main' | `session:${string}` | `archive:${string}`
// node(「노드 설정」)는 그래프 탭이 열려 있을 때만 있다 — 가운데가 그래프를 떠나면 현황판으로 돌아간다
type RightTab = 'node' | 'board' | 'files'

interface WorkStore {
  hydrated: boolean
  cwd: string | null
  projects: string[]
  center: CenterTab
  extraTabs: CenterTab[]
  right: RightTab
  archives: MainChatArchive[]
  selectedNode: string | null
  hydrate: () => void
  choose: (cwd: string) => void
  setCenter: (tab: CenterTab) => void
  openTab: (tab: CenterTab) => void
  closeTab: (tab: CenterTab) => void
  setRight: (tab: RightTab) => void
  selectNode: (id: string) => void
  loadArchives: (cwd: string) => Promise<void>
}

const rightFor = (center: CenterTab, right: RightTab): RightTab => (right === 'node' && center !== 'graph' ? 'board' : right)

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])

export const useWorkStore = create<WorkStore>((set, get) => ({
  hydrated: false,
  cwd: null,
  projects: [],
  center: 'main',
  extraTabs: [],
  right: 'board',
  archives: [],
  selectedNode: null,

  hydrate: () => {
    if (get().hydrated) return
    const saved = getPref<unknown>(WORK_CWD_PREF, null)
    const cwd = typeof saved === 'string' && saved.trim() !== '' ? saved : null
    let projects = strings(getPref<unknown>(WORK_PROJECTS_PREF, []))
    // 목록 설정이 생기기 전에 저장된 작업 폴더도 목록에 넣는다
    if (cwd !== null) projects = addProject(projects, cwd)
    set({ hydrated: true, cwd, projects })
  },

  choose: (cwd) => {
    const s = get()
    const projects = addProject(s.projects, cwd)
    const same = sameCwd(s.cwd, cwd)
    set({
      cwd: same && s.cwd !== null ? s.cwd : cwd,
      projects,
      ...(same ? {} : { center: 'main' as CenterTab, extraTabs: [], archives: [], selectedNode: null, right: rightFor('main', s.right) }),
    })
    if (!same) setPref(WORK_CWD_PREF, cwd)
    if (projects.length !== s.projects.length) setPref(WORK_PROJECTS_PREF, projects)
  },

  setCenter: (tab) => set({ center: tab, right: rightFor(tab, get().right) }),
  openTab: (tab) => {
    const s = get()
    const right = rightFor(tab, s.right)
    if (tab === 'graph' || tab === 'main') { set({ center: tab, right }); return }
    set({ center: tab, right, extraTabs: s.extraTabs.includes(tab) ? s.extraTabs : [...s.extraTabs, tab] })
  },
  closeTab: (tab) => {
    const s = get()
    const center = s.center === tab ? 'main' : s.center
    set({ extraTabs: s.extraTabs.filter((t) => t !== tab), center, right: rightFor(center, s.right) })
  },
  setRight: (tab) => set({ right: rightFor(get().center, tab) }),
  selectNode: (id) => set({ selectedNode: id, right: 'node' }),

  loadArchives: async (cwd) => {
    try {
      const r = await ipc.loop.mainArchives({ cwd })
      if (cwdKey(get().cwd ?? '') !== cwdKey(cwd)) return
      set({ archives: r.archives })
    } catch {
      // 읽기 실패는 지난 목록을 그대로 둔다
    }
  },
}))
