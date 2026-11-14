// renderer IPC 클라이언트 (M05 G10) — 컴포넌트·store·hook은 window.api를 직접 부르지 않고 이 `ipc`를 거친다.
// 읽기는 지연(getter)이다: import 시점에는 window.api를 읽지 않고(bl1-p03 하네스처럼 브리지가 없는 환경),
// 부를 때마다 지금의 window.api를 본다(테스트 mock 교체). push 구독 함수는 window.api의 것과 같은 함수 객체다.
import type { IpcApi } from '@shared/01_Ipc/apiRoutes'

type Flat = Window['api']

function flat(): Flat {
  return window.api
}

// 위치 인자를 받던 평면 함수를 요청 객체 하나로 받게 맞춘다. 함수가 없으면 없음(undefined)을 그대로 둔다.
function adapt<F, G>(fn: F | undefined, wrap: (fn: F) => G): G {
  return (fn ? wrap(fn) : undefined) as G
}

// preload 브리지가 있는지 — 기능 감지는 이것과 함께 `typeof ipc.<묶음>.<동작> === 'function'`으로 한다.
export function hasBridge(): boolean {
  return typeof window !== 'undefined' && window.api != null
}

export const ipc: IpcApi = {
  get agent(): IpcApi['agent'] {
    const a = flat()
    return {
      run: a.agentRun,
      abort: a.agentAbort,
      interrupt: a.agentInterrupt,
      taskStop: a.agentTaskStop,
      setMode: a.agentSetMode,
      setModel: a.agentSetModel,
      permissionRespond: a.permissionRespond,
      questionRespond: a.questionRespond,
      onEvent: a.onAgentEvent,
    }
  },
  get sessions(): IpcApi['sessions'] {
    const a = flat()
    return {
      load: a.conversationLoad,
      save: a.conversationSave,
      delete: a.conversationDelete,
      rename: a.conversationRename,
      multiLoad: a.multiSessionLoad,
      multiUpsert: adapt(a.multiCmdUpsert, (fn) => (req) => fn(req.session)),
      multiCreate: a.multiCmdCreate,
      multiDelete: adapt(a.multiCmdDelete, (fn) => (req) => fn(req.id)),
      multiRename: adapt(a.multiCmdRename, (fn) => (req) => fn(req.id, req.title)),
      multiSelect: adapt(a.multiCmdSelect, (fn) => (req) => fn(req.id)),
    }
  },
  get workspace(): IpcApi['workspace'] {
    const a = flat()
    return {
      open: a.workspaceOpen,
      tree: a.workspaceTree,
      diff: a.fsDiff,
      read: a.fsRead,
      listFiles: a.listFiles,
      listDir: a.fsListDir,
      saveImage: a.saveImageData,
      pathForFile: a.pathForFile,
      pickFolder: a.pickFolder,
      referenceAdd: a.referenceAdd,
      referenceList: a.referenceList,
      referenceTree: a.referenceTree,
    }
  },
  get git(): IpcApi['git'] {
    return flat().git
  },
  get lsp(): IpcApi['lsp'] {
    return flat().lsp
  },
  get engine(): IpcApi['engine'] {
    const a = flat()
    return {
      appVersion: a.getAppVersion,
      state: a.getEngineState,
      checkUpdate: a.checkEngineUpdate,
      listBackends: a.listBackends,
      install: adapt(a.installEngine, (fn) => (req) => fn(req.version)),
      setActive: adapt(a.setActiveEngine, (fn) => (req) => fn(req.version)),
      versionState: a.getEngineVersionState,
      onInstallProgress: a.onEngineInstallProgress,
      usage: a.getUsage,
    }
  },
  get settings(): IpcApi['settings'] {
    const a = flat()
    return {
      listCommands: a.listSlashCommands,
      listMcp: a.listMcpServers,
      setMcpEnabled: a.setMcpEnabled,
      listSkills: a.listSkills,
      setSkillEnabled: a.setSkillEnabled,
      getProfile: a.getProfile,
      setProfile: a.setProfile,
      getUiPrefs: a.getUiPrefs,
      setUiPref: a.setUiPref,
    }
  },
  get window(): IpcApi['window'] {
    const a = flat()
    return {
      minimize: a.windowMinimize,
      maximizeToggle: a.windowMaximizeToggle,
      close: a.windowClose,
      isMaximized: a.windowIsMaximized,
      getBounds: a.windowGetBounds,
      setBounds: a.windowSetBounds,
      dragStart: a.windowDragStart,
      dragEnd: a.windowDragEnd,
      resizeStart: adapt(a.windowResizeStart, (fn) => (req) => fn(req.edge)),
      resizeEnd: a.windowResizeEnd,
      onState: a.onWindowState,
      getZoomFactor: a.getZoomFactor,
      setZoomFactor: a.setZoomFactor,
    }
  },
}
