/**
 * ipc/personalization.ts — 개인화(프로필·UI 설정·사용량) 도메인 채널·타입 계약
 *
 * 채널: PROFILE_GET · PROFILE_SET · UI_PREFS_GET · UI_PREFS_SET · USAGE_GET
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const PERSONALIZATION_CHANNELS = {
  /**
   * 저장된 로컬 프로필 읽기 (invoke).
   * 인자 없음. 응답 Profile | null (null = 미설정/첫실행).
   *
   * CRITICAL(신뢰경계·개인화 전용): 닉네임·아바타 색만 — 토큰·시크릿·API 키 0.
   * null 응답 = 첫 실행 판정 → renderer가 온보딩 화면 진입.
   * 구현: main-process profile.ts (userData/profile.json 읽기 + IPC 핸들러).
   * 소비: renderer 부트 3단계 게이트(boot→login→MainApp) + Profile 온보딩 실저장.
   */
  PROFILE_GET: 'profile.get',
  /**
   * 로컬 프로필 저장 (invoke).
   * 요청 Profile. 응답 { ok: boolean }.
   *
   * CRITICAL(신뢰경계·개인화 전용): 저장되는 값은 nickname·color만.
   * 이 채널로 토큰·시크릿·API 키를 전달하면 안 된다 — 호출부 책임.
   * 구현: main-process profile.ts (userData/profile.json 쓰기 + IPC 핸들러).
   * 소비: renderer Profile 컴포넌트 onEnter 콜백(입장하기 제출 시).
   */
  PROFILE_SET: 'profile.set',
  /**
   * UI 환경설정 전체 읽기 (invoke).
   * 인자 없음. 응답 UiPrefs(키-값 blob).
   *
   * CRITICAL(신뢰경계): 이 채널은 UI 표시 설정(패널 크기·줌·테마·플래그 등)만
   * 영속한다. API 키·OAuth 토큰·시크릿 등 민감 자격증명을 이 blob에 저장하면
   * 안 된다 — 호출부(renderer lib/prefs.ts) 책임이며 main도 값을 검증하지 않으므로
   * 계약 수준에서 명시(UIPrefs blob은 무해 설정 전용).
   */
  UI_PREFS_GET: 'ui.getPrefs',
  /**
   * UI 환경설정 단일 키 쓰기 (invoke).
   * 요청 UiPrefsSetReq. 응답 { ok: boolean }.
   *
   * CRITICAL(신뢰경계): value는 JSON 직렬화 가능 무해 설정값만 허용.
   * 민감 자격증명(토큰·시크릿·키)을 value로 전달하면 안 된다 — 호출부 책임.
   */
  UI_PREFS_SET: 'ui.setPref',
  /**
   * OAuth 레이트리밋 게이지 조회 (invoke).
   * 인자 없음. 응답 UsageInfo.
   *
   * CRITICAL(신뢰경계): 토큰/시크릿 미포함 — pct(사용률)·resetsAt(리셋 unix seconds)
   * 파생값만 반환. renderer는 원본 레이트리밋 헤더나 API 키를 직접 받지 않는다.
   * 구현은 main-process(getUsage 핸들러)가 담당.
   */
  USAGE_GET: 'usage.get',
} as const

// ── Profile 타입 (P2 — 로컬 사용자 개인화, 원본 AgentCodeGUI UserProfile 미러) ──

/**
 * 로컬 사용자 프로필 — 닉네임 + 아바타 색 개인화 데이터.
 *
 * 원본 AgentCodeGUI `UserProfile` (protocol.ts L360~363)과 동형:
 *   `{ nickname: string; color: string }` (color = hex, AVATAR_PALETTE 선택값).
 * 우리 `Profile.tsx` 셸의 `UserProfile` interface와도 동형 — 타입명만 IPC 계약으로 상향.
 *
 * 용도: 닉네임 표시('무엇을 도와드릴까요, {닉}님?') · 아바타 색 · 첫실행 판정.
 *
 * CRITICAL(신뢰경계·개인화 전용):
 *   - nickname·color 필드만. 토큰·시크릿·API 키 0.
 *   - `color`는 AVATAR_PALETTE 색상 hex — 임의 CSS/XSS 값 주입은 renderer 책임으로 검증.
 *   - 영속 경로: main-process `userData/profile.json` (OS 사용자 디렉토리, git-ignored).
 *   - 실 인증 아님 — 로컬 개인화 전용(비밀번호·OAuth 토큰 없음).
 *
 * 다음 단계 소비처:
 *   - main-process: `src/main/profile.ts` (profile.json 읽기/쓰기 + IPC 핸들러) → main-process 담당.
 *   - renderer: 부트 3단계 게이트(boot→login→MainApp) + Profile 온보딩 실저장 → renderer 담당.
 */
export interface Profile {
  /** 표시 닉네임 — 최대 20자, 앞뒤 공백 trim 후 저장. */
  nickname: string
  /**
   * 아바타 색 hex (예: '#6366f1').
   * AVATAR_PALETTE(renderer/src/lib/avatarColor.ts) 12색 중 하나.
   * Conversation 빈화면 인사말 아바타 + Profile 미리보기에 사용.
   */
  color: string
}

// ── UI Prefs 타입 (P1 — 원본 AgentCodeGUI lib/prefs.ts 미러) ─────────────────

/**
 * UI 환경설정 키-값 blob.
 *
 * 용도: 패널 크기·줌·테마·workspace.mode·첫실행 seen 플래그 등 무해 표시 설정을
 * `userData/ui-prefs.json`에 영속한다. 원본 AgentCodeGUI lib/prefs.ts 1:1 미러.
 *
 * CRITICAL(신뢰경계·무해 설정 전용):
 *   - API 키·OAuth 토큰·시크릿 등 민감 자격증명을 이 blob에 저장하면 **안 된다**.
 *   - 값은 JSON 직렬화 가능한 무해 표시 설정(number·string·boolean·null·배열·객체)만 허용.
 *   - 호출부(renderer `lib/prefs.ts`)의 책임이며 main은 값 내용을 검증하지 않는다.
 *   - 민감 자격증명 영속은 OS 자격증명 스토어(ADR-008) 경유 별도 채널 사용.
 *
 * 구현:
 *   - main P1-main Worker: `src/main/prefs.ts` (`userData/ui-prefs.json` 읽기/쓰기 + IPC 핸들러).
 *   - renderer: `src/renderer/src/lib/prefs.ts` (boot loadPrefs + getPref/setPref 인메모리 캐시).
 */
export type UiPrefs = Record<string, unknown>

/**
 * `ui.setPref` 요청 — 단일 키-값 쓰기.
 *
 * key:   설정 키(예: 'theme', 'zoomFactor', 'panelSize', 'seenWhatsNew').
 * value: JSON 직렬화 가능 무해 설정값.
 *
 * CRITICAL(신뢰경계): value에 민감 자격증명(토큰·시크릿·키)을 전달하지 말 것.
 * 이 채널은 UI 표시 설정 전용 — 호출부 책임으로 명시.
 */
export interface UiPrefsSetReq {
  /** 저장할 설정 키 */
  key: string
  /**
   * 저장할 설정값 (JSON 직렬화 가능 무해 설정만).
   * 민감 자격증명(API 키·토큰·시크릿) 저장 금지 — 호출부 책임.
   */
  value: unknown
}

// ── Usage 타입 (B8 — OAuth 레이트리밋 게이지) ────────────────────────────────

/**
 * 단일 레이트리밋 윈도우(5시간 또는 주간)의 사용률 스냅샷.
 *
 * pct: 0~100 사용률 (100 = 한도 소진).
 * resetsAt: 윈도우 리셋 unix seconds. 정보 미제공 시 null.
 *
 * CRITICAL(신뢰경계): 토큰·API 키·시크릿 미포함.
 * main이 OAuth 레이트리밋 헤더에서 파생한 *비율·시각*만 전달한다.
 * renderer는 이 값을 표시 목적(게이지 UI)으로만 사용해야 한다.
 */
export interface UsageWindow {
  /** 0~100 사용률 (100 = 한도 소진) */
  pct: number
  /** 윈도우 리셋 unix seconds (정보 미제공 시 null) */
  resetsAt: number | null
}

/**
 * `usage.get` 응답 — 5시간·주간 레이트리밋 게이지 정보.
 *
 * fiveHour: 5시간 슬라이딩 윈도우 사용률. 정보 없으면 null.
 * weekly:   주간(7일) 윈도우 사용률. 정보 없으면 null.
 *
 * CRITICAL(신뢰경계): 모든 필드는 파생값(pct·resetsAt)만 — 토큰/시크릿 0.
 * 구현(getUsage 핸들러): main-process 담당.
 * 소비: renderer ContextStrip 3칩(5h 게이지·주간 게이지·리셋 타이머) 담당.
 */
export interface UsageInfo {
  /** 5시간 슬라이딩 윈도우 (정보 없으면 null) */
  fiveHour: UsageWindow | null
  /** 주간(7일) 윈도우 (정보 없으면 null) */
  weekly: UsageWindow | null
}

// ── Zoom 범위상수 + per-region 공존 정의 (FB1 P02 — read-only 조회 계약) ─────
//
// 신규 IPC 채널 0 — plan-auditor 스파이크(2026-07-04) 결과, Electron 기본 View
// 메뉴 zoom role(Ctrl+=/−/0)이 이미 동작·프로덕션 우발 영속까지 확인되어
// "기본 role 유지 + 조회/영속만 앱 소유로 추가"가 채택되었다.
// 적용 = native role(zoomIn/zoomOut/resetZoom) 몫. 영속 = 기존 UI_PREFS_SET
// (`ui.setPref('zoomFactor', factor)`) 재사용 — 신규 채널 아님. 이 섹션이
// 추가하는 것은 ① 범위 상수(clamp 방어용) ② preload read-only 조회
// (`window.api.getZoomFactor()`, 실제 노출부는 `02.Source/preload/index.ts`
// — webFrame.getZoomFactor() 단일 getter 래핑, 이 파일 아님) ③ 아래
// per-region 공존 정의뿐이다.

/**
 * 전역 page zoom(webFrame 전체 배율) factor 유효 범위 — 클램프 방어용 상수(단일 공급원).
 *
 * 용도: main-process(P03)가 부팅 시 `ui-prefs.json`의 `zoomFactor` 값을
 * `webFrame.setZoomFactor()`에 적용하기 전에 이 범위로 clamp해 손상되거나
 * 비정상적으로 커진 저장값(예: 파일 수동 조작·마이그레이션 버그)을 방어한다.
 *
 * MIN 0.5(50%)·MAX 2.0(200%)은 Electron 기본 zoom role 실측 step(스파이크
 * 결과: 1→1.095→1.2… 곱연산 증가)과 호환되는 넉넉한 범위다. 원본
 * `renderer/src/lib/zoom.tsx`의 per-region MIN/MAX(0.5~3)와는 **별도 범위**
 * — 전역 zoom은 앱 전체 텍스트/레이아웃에 곱연산으로 반영되므로 상한을
 * per-region보다 보수적으로 잡았다(아래 공존 정의 참고).
 *
 * CRITICAL(계약 정의만): 이 상수는 값만 정의한다 — 실제 clamp 로직
 * (`Math.min(MAX, Math.max(MIN, v))` 적용)은 main-process(P03, 부팅 시
 * zoomFactor 복원)의 구현 몫이다. 이 파일에 clamp 함수를 두지 않는다.
 *
 * 소비: main-process P03(부팅 복원 clamp) · 계약 골든 테스트(회귀 방지).
 */
export const ZOOM_FACTOR_RANGE = {
  /** 최소 허용 factor (50%) */
  MIN: 0.5,
  /** 최대 허용 factor (200%) */
  MAX: 2.0,
} as const

/**
 * 전역 page zoom × per-region CSS zoom **공존 정의** (plan-auditor 🟡 봉합, FB1 P02).
 *
 * 이 앱은 서로 독립적인 두 종류의 "줌"을 **곱연산으로 공존**시킨다. 두
 * 개념을 혼동하면 배지가 왜 2개인지, 값이 왜 안 맞는지 헷갈리기 쉬우므로
 * 이 주석을 유일한 통합 정의 지점으로 삼는다(구현 변경 시 함께 갱신할 것).
 *
 * 1) 전역 page zoom (이 파일이 정의하는 계약의 대상)
 *    - 적용: Electron 기본 View 메뉴 zoom role(Ctrl+=/−/0) — `webFrame`
 *      전체 배율. 커스텀 IPC 적용 채널 없음(신규 채널 0, 위 스파이크 결정).
 *    - 조회: `window.api.getZoomFactor()`(preload read-only getter,
 *      `webFrame.getZoomFactor()` 래핑) — 이 파일은 범위 상수만 정의하고
 *      getter 자체의 노출은 `02.Source/preload/index.ts` 몫.
 *    - 영속: 기존 `UI_PREFS_SET`(`ui.setPref('zoomFactor', factor)`) 재사용.
 *      부팅 시 복원은 main-process(P03)가 `ZOOM_FACTOR_RANGE`로 clamp 후 적용.
 *    - 배지: 없음 — Electron 네이티브 role이라 앱 자체 UI 배지를 그리지 않는다.
 *
 * 2) per-region CSS zoom (`02.Source/renderer/src/lib/zoom.tsx`의 `useZoom`)
 *    - 적용: 채팅·뷰어 등 개별 영역의 Ctrl+휠 → CSS `zoom` 스타일(국소 배율,
 *      해당 파일 자체 MIN 0.5~MAX 3, step 0.1).
 *    - 영속: `localStorage`(`agentdeck.zoom.<key>`) — `ui-prefs.json`과
 *      완전히 별도인 저장소.
 *    - 배지: `ZoomBadge`("N%" 일시 pill) — 전역 page zoom과 별개의 배지.
 *
 * 최종 렌더 배율 = 전역 page zoom factor × per-region CSS zoom factor
 * (예: 전역 120% × 국소 110% = 실효 132%). 두 메커니즘은 서로의 존재를
 * 모르는 채 각자의 저장소·배지·조정 방식을 독립적으로 유지한다.
 *
 * 실효 상한: 전역 `ZOOM_FACTOR_RANGE.MAX`(2.0) × per-region MAX(3.0) = 이론상
 * 최대 6.0배(600%)까지 곱연산 도달 가능 — 현재 어느 쪽도 상대 배율을 인지한
 * 클램프를 걸지 않는다. 곱연산 상한 클램프 정책이 필요해지면 main-process
 * P03(부팅 복원 clamp는 전역 factor만 대상)·renderer P04(표시)에서 이 지점을
 * 참고할 것.
 */
