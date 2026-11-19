import { create } from 'zustand'
import type { MainChatArchive } from '@shared/ipcContract'
import { ipc } from '@renderer/01_Ipc'
import { getPref, setPref } from '@renderer/11_Settings/prefs'
import { cwdKey, sameCwd } from './loopModel'
import { addProject } from './workModel'

export const WORK_CWD_PREF = 'work.cwd'
export const WORK_PROJECTS_PREF = 'work.projects'

export type CenterTab = 'graph' | 'main' | `session:${string}` | `archive:${string}`
export type RightTab = 'board' | 'files'

export interface WorkStore {
  hydrated: boolean
  cwd: string | null
  projects: string[]
  center: CenterTab
  extraTabs: CenterTab[]
  right: RightTab
  archives: MainChatArchive[]
  hydrate: () => void
  choose: (cwd: string) => void
  setCenter: (tab: CenterTab) => void
  openTab: (tab: CenterTab) => void
  closeTab: (tab: CenterTab) => void
  setRight: (tab: RightTab) => void
  loadArchives: (cwd: string) => Promise<void>
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [])

export const useWorkStore = create<WorkStore>((set, get) => ({
  hydrated: false,
  cwd: null,
  projects: [],
  center: 'main',
  extraTabs: [],
  right: 'board',
  archives: [],

  hydrate: () => {
    if (get().hydrated) return
    const saved = getPref<unknown>(WORK_CWD_PREF, null)
    const cwd = typeof saved === 'string' && saved.trim() !== '' ? saved : null
    let projects = strings(getPref<unknown>(WORK_PROJECTS_PREF, []))
    // G3 때 고른 작업 폴더는 목록 설정이 생기기 전에 저장됐다
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
      ...(same ? {} : { center: 'main' as CenterTab, extraTabs: [], archives: [] }),
    })
    if (!same) setPref(WORK_CWD_PREF, cwd)
    if (projects.length !== s.projects.length) setPref(WORK_PROJECTS_PREF, projects)
  },

  setCenter: (tab) => set({ center: tab }),
  openTab: (tab) => {
    const s = get()
    if (tab === 'graph' || tab === 'main') { set({ center: tab }); return }
    set({ center: tab, extraTabs: s.extraTabs.includes(tab) ? s.extraTabs : [...s.extraTabs, tab] })
  },
  closeTab: (tab) => {
    const s = get()
    set({ extraTabs: s.extraTabs.filter((t) => t !== tab), center: s.center === tab ? 'main' : s.center })
  },
  setRight: (tab) => set({ right: tab }),

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
