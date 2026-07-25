/**
 * ipc/engine.ts — 엔진 상태·설치·버전 관리 도메인 채널·타입 계약
 *
 * 채널: APP_VERSION · ENGINE_INSTALL · ENGINE_INSTALL_PROGRESS · ENGINE_SET_ACTIVE
 *       ENGINE_VERSION_STATE · ENGINE_STATE · ENGINE_CHECK_UPDATE · BACKEND_LIST
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

import type { BackendId } from './common'

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const ENGINE_CHANNELS = {
  /**
   * Electron 앱 버전 조회 (invoke).
   * 인자 없음. 응답 string (예: "0.1.0").
   *
   * 원본 AgentCodeGUI `window.api.app.getVersion()` 미러.
   * 유래: electron `app.getVersion()` — package.json version 반환.
   *
   * 용도: WhatsNew/UpdateNotes 자동 트리거가 seen-key(ui-prefs)와 비교해
   * 첫실행/업데이트 판정 시 현재 앱 버전을 기준값으로 사용한다.
   *
   * CRITICAL(신뢰경계): 시크릿 0 — 앱 버전 문자열만(package.json의 공개 값).
   * 구현: main-process 담당 (ipcMain.handle(APP_VERSION, () => app.getVersion())).
   * 소비: renderer WhatsNew/UpdateNotes — getAppVersion() + getPref(seen-key) 비교.
   */
  APP_VERSION: 'app.getVersion',
  /**
   * 엔진 버전 설치 (invoke).
   * 요청 EngineInstallRequest{version} → 응답 EngineInstallResult{ok, error?}.
   *
   * CRITICAL(신뢰경계, ADR-008):
   *   - version 은 **untrusted** — main 이 strict semver(^\\d+\\.\\d+\\.\\d+) 검증.
   *     검증 실패 시 ok:false, error:'invalid version' 반환.
   *   - 응답 EngineInstallResult 는 ok·error 2개 필드만 — 토큰·API 키·시크릿 0.
   *   - npm 설치 실행은 main 프로세스 단독 — renderer는 이 채널 invoke 만 가능.
   *
   * 구현: main-process engine-versions.ts (핸들러 담당).
   * 소비: renderer EngineGate 설치 버튼.
   */
  ENGINE_INSTALL: 'engine.install',
  /**
   * 엔진 설치 진행 이벤트 — main → renderer push (event형, ipcRenderer.on).
   * 페이로드 EngineInstallProgress.
   *
   * CRITICAL(신뢰경계, ADR-008):
   *   - progress.line 은 **main 이 시크릿 마스킹한 npm stdout/stderr 한 줄만**.
   *     토큰·API 키·환경변수 값·자격증명이 출력에 포함되면 main 이 제거 후 전달한다.
   *   - done=true 라인에는 line 이 없을 수 있다 — ok·error 로 종료 판정.
   *   - renderer 는 이 채널을 onEngineInstallProgress helper 를 통해서만 구독한다.
   *
   * 구현: main-process engine-versions.ts (spawn 후 stdout/stderr pipe → 마스킹 → push).
   * 소비: renderer EngineGate 설치 진행 UI (onEngineInstallProgress 구독).
   */
  ENGINE_INSTALL_PROGRESS: 'engine.installProgress',
  /**
   * 활성 엔진 버전 전환 (invoke).
   * 요청 EngineSetActiveRequest{version} → 응답 {ok: boolean}.
   *
   * CRITICAL(신뢰경계):
   *   - version 은 untrusted — main 이 installed 목록에 포함된 버전인지 검증.
   *     미설치 버전 지정 시 ok:false 반환.
   *   - 응답 {ok} boolean 만 — 토큰·시크릿 0.
   *
   * 구현: main-process engine-versions.ts.
   * 소비: renderer EngineGate 버전 선택 UI.
   */
  ENGINE_SET_ACTIVE: 'engine.setActive',
  /**
   * 설치/활성 버전 상태 조회 (invoke).
   * 인자 없음 → 응답 EngineVersionState.
   *
   * CRITICAL(신뢰경계):
   *   - 응답 EngineVersionState 는 버전 문자열·목록·패키지명만 — 토큰·API 키·시크릿 0.
   *   - **기존 EngineState(authed 불리언 전용)와 별개 개념** — 혼동 금지.
   *     EngineState: SDK 가용/인증 여부(available·authed·version).
   *     EngineVersionState: 멀티버전 설치 관리(package·bundled·active·installed).
   *
   * 구현: main-process engine-versions.ts.
   * 소비: renderer EngineGate 버전 목록 표시.
   */
  ENGINE_VERSION_STATE: 'engine.versionState',
  /**
   * 코딩 엔진 상태 조회 (invoke).
   * 인자 없음. 응답 EngineState.
   *
   * CRITICAL(신뢰경계): `authed` 는 **불리언만** — OAuth 토큰·API 키·시크릿
   * 값은 절대 포함하지 않는다. renderer는 authed 여부로 EngineGate UI를
   * 분기할 뿐 자격증명 자체에 접근하지 않는다.
   *
   * 구현: main-process engine-state.ts (ClaudeCodeBackend.isAvailable() +
   * ~/.claude/.credentials.json accessToken 존재 OR env ANTHROPIC_API_KEY).
   * 소비: renderer AppGate(profile 완료 후 engine.state 체크 → 미authed 시
   * EngineGate 안내 표시).
   */
  ENGINE_STATE: 'engine.state',
  /**
   * 엔진 버전 업데이트 체크 (invoke).
   * 인자 없음. 응답 EngineUpdateInfo.
   *
   * 현재 번들 SDK 버전과 npm registry 최신 stable 버전을 비교하여 결과를 반환한다.
   * 유래: 원본 AgentCodeGUI EngineGate.tsx `engine.listAvailable().latest` + `cmpVer` 미러.
   * 단, 이 채널은 (a) 단계 — **체크 + 알림만** (멀티버전 설치는 이 채널 범위 외).
   *
   * CRITICAL(신뢰경계, ADR-008):
   *   - 응답 EngineUpdateInfo 는 **버전 문자열·boolean 3개 필드만** — OAuth 토큰·API 키·시크릿 0.
   *   - npm registry fetch 는 **main 프로세스(어댑터) 단독** 수행.
   *     renderer 는 이 IPC 채널만 호출 가능 — renderer 측 임의 fetch 금지.
   *   - 실패(오프라인·탐지 불가) 시 current/latest 를 null 로 반환 — 에러 throw 아님.
   *
   * 구현: main-process engine-state.ts 담당 (핸들러 등록).
   * 소비: renderer 엔진 업데이트 알림 배너/아이콘 (UI Worker 담당).
   */
  ENGINE_CHECK_UPDATE: 'engine.checkUpdate',
  /**
   * 등록된 코딩 엔진(백엔드) 상태 목록 조회 (invoke). 인자 없음. 응답 BackendStatus[].
   *
   * 듀얼 프로바이더 상태 패널(B1)용 — registry.listBackends() 순회로 각 백엔드의
   * 가용/버전/최신버전/인증을 한 번에 조회한다. 기존 ENGINE_STATE(claude 단일·authed 전용)와
   * 별개: 여러 백엔드(claude-code·codex …)의 요약을 배열로 반환.
   *
   * CRITICAL(신뢰경계, ADR-008): 응답 BackendStatus 는 **문자열/boolean 필드만** —
   *   OAuth 토큰·API 키·시크릿·자격증명 0. authed 는 불리언만. version/latestVersion 은
   *   문자열만(없으면 null). 탐지/버전조회/인증판정은 **main 프로세스 단독**(어댑터·engine-state).
   * 구현: main-process `src/main/backend-status.ts`(순수) + ipc/index.ts 핸들러 등록.
   * 소비: renderer ProviderStatusPanel(SettingsModal "프로바이더" 섹션).
   */
  BACKEND_LIST: 'backend.list',
} as const

// ── 엔진 상태 타입 ────────────────────────────────────────────────────────────

/**
 * 코딩 엔진 상태 스냅샷 — `engine.state` 채널 응답 타입.
 *
 * 우리 엔진 모델(ADR-016): `@anthropic-ai/claude-agent-sdk` 하드 의존.
 * 원본 AgentCodeGUI의 `claude` CLI 설치 탐지와 의미가 다름 — 우리 적응판:
 *   - `available`: SDK 모듈 자체의 import·초기화 가능 여부(ClaudeCodeBackend.isAvailable()).
 *   - `authed`: OAuth 자격증명 존재(~/.claude/.credentials.json accessToken) 또는
 *               환경변수 ANTHROPIC_API_KEY 설정 여부. **불리언만 — 토큰/키 값 절대 미노출**.
 *   - `version`: SDK 패키지 버전 문자열(package.json version). SDK를 쓸 수 없으면 null.
 *
 * CRITICAL(신뢰경계 — 절대 규칙):
 *   - 이 타입에 토큰·API 키·시크릿 필드를 추가하면 **안 된다**.
 *   - `authed` 는 불리언으로만 인증 존재 여부를 전달 — 자격증명 값 전달 불가.
 *   - renderer는 authed 여부로 EngineGate UI를 분기할 뿐, 키/토큰 자체를 받지 않는다.
 *   - 필드: available·authed·version **3개만** — 이 계약 밖 필드 추가는 reviewer 필수.
 *
 * 구현 위치(main-process 담당 — 이 파일은 타입 정의만):
 *   - `src/main/engine-state.ts`: ClaudeCodeBackend.isAvailable() + 인증탐지 + 버전조회.
 *   - 인증탐지: ~/.claude/.credentials.json accessToken 존재 OR env ANTHROPIC_API_KEY 비어있지 않음.
 *
 * 소비처:
 *   - renderer AppGate: profile 완료(P2) 후 engine.state 조회 → authed=false 시 EngineGate 안내.
 *   - renderer EngineGate 컴포넌트: available/authed 조합으로 안내 메시지 분기.
 */
export interface EngineState {
  /**
   * SDK 사용 가능 여부.
   * `ClaudeCodeBackend.isAvailable()` — SDK 모듈 import·초기화 성공 시 true.
   * false면 authed 값에 관계없이 엔진을 쓸 수 없는 상태.
   */
  available: boolean
  /**
   * 인증 존재 여부 — **불리언만, 토큰·키 값 절대 미노출**.
   *
   * true: ~/.claude/.credentials.json 에 accessToken 존재
   *       OR 환경변수 ANTHROPIC_API_KEY 가 비어있지 않음.
   * false: 두 경로 모두 미인증 → renderer가 EngineGate 안내를 표시.
   *
   * CRITICAL(신뢰경계): 실제 토큰·API 키 문자열을 이 필드에 담거나,
   * 이 타입에 token/key/secret 필드를 추가하면 신뢰경계 위반.
   */
  authed: boolean
  /**
   * SDK 버전 문자열(예: '1.2.3').
   * `@anthropic-ai/claude-agent-sdk` package.json version.
   * available=false 또는 버전 조회 불가 시 null.
   */
  version: string | null
}

// ── 엔진 업데이트 체크 타입 (폴리싱 #2a) ─────────────────────────────────────

/**
 * 엔진 업데이트 체크 결과 — ENGINE_CHECK_UPDATE 채널 응답 타입.
 *
 * 현재 번들 SDK 버전과 npm registry 최신 stable 버전을 비교한 결과를 담는다.
 * 유래: 원본 AgentCodeGUI EngineGate.tsx `engine.listAvailable().latest` + `cmpVer` 미러.
 *
 * CRITICAL(신뢰경계, ADR-008):
 *   - **버전 문자열·boolean 3개 필드만** — OAuth 토큰·API 키·시크릿·자격증명 필드 0.
 *   - token / apiKey / secret / accessToken / credentials 등 민감 필드를 이 타입에
 *     추가하면 신뢰경계 위반 — reviewer 게이트 필수.
 *   - npm registry fetch 는 main 프로세스 단독 수행 — renderer는 이 결과만 수신.
 *
 * 구현 위치: main-process `src/main/engine-state.ts` (핸들러 담당).
 * 소비처: renderer 엔진 업데이트 알림 배너/아이콘 (UI Worker 담당).
 */
export interface EngineUpdateInfo {
  /**
   * 현재 사용 중인 엔진(SDK) 버전 문자열 (예: '1.2.3').
   * `@anthropic-ai/claude-agent-sdk` package.json version 에서 탐지.
   * 탐지 실패 시 null.
   */
  current: string | null
  /**
   * npm registry 최신 stable 버전 문자열 (예: '1.3.0').
   * main 프로세스가 npm registry fetch 후 반환.
   * 오프라인 또는 fetch 실패 시 null.
   */
  latest: string | null
  /**
   * 업데이트 가능 여부.
   * current < latest 이면 true.
   * current 또는 latest 가 한쪽이라도 null 이면 false.
   *
   * CRITICAL(신뢰경계): boolean 값만 — 토큰·시크릿 값 0.
   */
  updateAvailable: boolean
}

// ── 백엔드 상태 타입 (B1 — 듀얼 프로바이더 상태 패널) ───────────────────────

/**
 * 단일 백엔드(코딩 엔진)의 상태 요약 — `backend.list` 채널 응답 BackendStatus[] 의 원소.
 *
 * registry.listBackends() 의 각 어댑터에 대해 main 프로세스가 가용/버전/최신버전/인증을
 * 조회·조합한다. claude-code 의 authed 는 engine-state(getEngineState().authed) 결합,
 * codex(stub) 등은 false.
 *
 * CRITICAL(신뢰경계 — ADR-008, 절대 규칙):
 *   - 필드는 **id·name·available·version·latestVersion·authed 6개만**.
 *   - OAuth 토큰·API 키·시크릿·자격증명·경로·URL·패키지명 등 민감/구체값 0.
 *   - authed 는 **불리언만**(인증 존재 여부) — 자격증명 값 전달 불가.
 *   - version/latestVersion 은 문자열만(없으면 null). 이 계약 밖 필드 추가는 reviewer 필수.
 */
export interface BackendStatus {
  /** 백엔드 식별자(BackendId). */
  id: BackendId
  /** 표시 이름(BACKEND_LABELS[id]). */
  name: string
  /**
   * 이 환경에서 사용 가능한지(AgentBackend.isAvailable()).
   * codex(stub)는 항상 false.
   */
  available: boolean
  /**
   * 설치/번들된 엔진 버전 문자열(AgentBackend.version()). 미설치·탐지 실패 시 null.
   * CRITICAL: 버전 문자열만 — 시크릿 0.
   */
  version: string | null
  /**
   * 최신 가용 버전 문자열(AgentBackend.latestVersion()). 오프라인·미지원 시 null.
   * version 과의 비교로 업데이트 가능 여부 표시.
   */
  latestVersion: string | null
  /**
   * 인증 존재 여부 — **불리언만, 토큰·키 값 절대 미노출**.
   * claude-code: getEngineState().authed(credentials/env 존재). codex 등: false.
   * CRITICAL(신뢰경계): 실제 토큰·키 문자열을 담거나 token/key/secret 필드 추가 금지.
   */
  authed: boolean
}

// ── 엔진 설치/버전 관리 타입 (폴리싱 #2b+c — ADR-018) ───────────────────────

/**
 * `engine.install` 요청 — 설치할 엔진 버전.
 *
 * CRITICAL(신뢰경계, ADR-008):
 *   - version 은 **untrusted** — main 이 strict semver(`^\d+\.\d+\.\d+`) 검증 후 npm 설치에만 사용.
 *   - 검증 실패 시 EngineInstallResult{ok:false, error:'invalid version'} 반환.
 *   - 이 타입에 토큰·API 키·시크릿 필드를 추가하면 **신뢰경계 위반** — reviewer 필수.
 *
 * 구현: main-process `src/main/engine-versions.ts` (semver 검증 → npm install → 결과 반환).
 * 소비: renderer EngineGate 설치 버튼.
 */
export interface EngineInstallRequest {
  /**
   * 설치할 버전 문자열 (예: '1.2.3').
   * **untrusted** — main 이 strict semver 검증(`^\d+\.\d+\.\d+`) 후에만 npm 인자화.
   * 검증 실패(빈 문자열·범위 표현·비semver 문자) 시 ok:false, error:'invalid version' 반환.
   */
  version: string
}

/**
 * `engine.install` 결과.
 *
 * CRITICAL(신뢰경계): ok·error 2개 필드만 — 토큰·API 키·시크릿·npm 전체 출력 0.
 * npm 출력은 ENGINE_INSTALL_PROGRESS 이벤트로 스트리밍(main 이 마스킹 후 전달).
 */
export interface EngineInstallResult {
  /** 설치 성공 여부 */
  ok: boolean
  /**
   * 실패 시 오류 메시지.
   * main 이 시크릿·자격증명 값을 제거한 안전 문자열만 포함한다.
   * 성공 시 undefined.
   */
  error?: string
}

/**
 * `engine.installProgress` 이벤트 페이로드 — npm 설치 진행(스트리밍).
 *
 * main 이 ipcRenderer.on('engine.installProgress') push, preload 의 onEngineInstallProgress helper 경유.
 *
 * CRITICAL(신뢰경계, ADR-008):
 *   - line 은 **main 이 시크릿 마스킹한 npm stdout/stderr 한 줄만**.
 *     토큰·API 키·환경변수 값·OAuth 자격증명이 npm 출력에 포함되면 main 이 제거/마스킹 후 전달.
 *   - done=true 라인에는 line 이 없을 수 있다 — ok·error 로 종료 판정.
 *   - env/args/url/command/headers 같은 시크릿 운반 필드를 추가하면 **신뢰경계 위반**.
 *
 * 구현: main-process engine-versions.ts (child_process stdout pipe → 마스킹 → webContents.send).
 * 소비: renderer EngineGate 설치 진행 UI (onEngineInstallProgress 구독).
 */
export interface EngineInstallProgress {
  /** 설치 중인 버전 문자열 */
  version: string
  /**
   * npm stdout/stderr 한 줄 (main 이 시크릿 마스킹 후 전달).
   * 마스킹 규칙: 토큰 패턴(Bearer .../sk-ant-...) → '[REDACTED]' 치환.
   * done 라인에는 없을 수 있다(undefined).
   */
  line?: string
  /**
   * 설치 종료 표지.
   * true 면 npm 프로세스가 종료(성공 또는 실패)되었음을 의미.
   * undefined(미지정) = 진행 중 이벤트.
   */
  done?: boolean
  /**
   * done 시 성공 여부.
   * done=true 일 때만 의미 있음 — 진행 중 이벤트에서는 undefined.
   */
  ok?: boolean
  /**
   * done 시 오류 메시지.
   * ok=false 일 때 main 이 시크릿 마스킹한 오류 설명. 성공/진행 중에는 undefined.
   */
  error?: string
}

/**
 * `engine.setActive` 요청 — 활성 엔진 버전 전환.
 *
 * CRITICAL(신뢰경계):
 *   - version 은 untrusted — main 이 installed 목록에 포함된 버전인지 검증.
 *     미설치 버전 지정 시 ok:false 반환.
 *   - version 필드 1개만 — 토큰·시크릿·자격증명 필드 0.
 *
 * 구현: main-process engine-versions.ts.
 * 소비: renderer EngineGate 버전 선택 UI.
 */
export interface EngineSetActiveRequest {
  /**
   * 활성화할 버전 문자열 (예: '1.2.3').
   * untrusted — main 이 installed 목록 포함 여부 검증.
   */
  version: string
}

/**
 * `engine.versionState` 응답 — 설치/활성 버전 상태.
 *
 * CRITICAL(신뢰경계, 혼동 방지):
 *   - **기존 EngineState(authed 전용: available·authed·version)와 완전히 별개 개념**.
 *     EngineState = SDK 가용/인증 여부(불리언).
 *     EngineVersionState = 멀티버전 설치 관리(버전 문자열·목록 — 시크릿 0).
 *   - 이 타입에 authed·available·token·apiKey·secret 필드를 추가하면 **신뢰경계 위반**.
 *   - 버전 문자열·목록·패키지명만 — 자격증명 필드 없음.
 *
 * 구현: main-process engine-versions.ts.
 * 소비: renderer EngineGate 버전 목록/활성 표시.
 */
export interface EngineVersionState {
  /**
   * 엔진 npm 패키지명 (표시용).
   * 예: '@anthropic-ai/claude-agent-sdk'.
   */
  package: string
  /**
   * 앱에 번들된 기준 버전.
   * 번들 버전 탐지 불가 시 null.
   */
  bundled: string | null
  /**
   * 현재 활성 설치 버전.
   * null = 추가 설치된 버전 없음 → 번들 버전을 그대로 사용.
   */
  active: string | null
  /**
   * 설치된 버전 목록(최신순).
   * 빈 배열 = 추가 설치 없음 (번들만 존재).
   */
  installed: string[]
}
