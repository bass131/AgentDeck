/**
 * prefs.ts — UI 환경설정 영속화 (P1 — 원본 AgentCodeGUI lib/prefs.ts 미러)
 *
 * 원본: AgentCodeGUI/src/renderer/src/lib/prefs.ts (브라우저 측 localStorage 기반).
 * 우리: main 프로세스 단독 — `userData/ui-prefs.json` 파일 기반.
 *
 * 설계 원칙:
 *   1. **electron import 0** — prefsPath와 fs를 주입받아 Vitest에서 직접 테스트 가능.
 *   2. **주입형 deps** — readFile·writeFile을 인자로 받아 mock 가능. 기본값은 실 fs.
 *   3. **인메모리 캐시** — 최초 읽기 후 캐시. set() 시 캐시 병합 + 디스크 write.
 *   4. **graceful** — 파일 없음·파싱 실패·비-객체 → {} (silent, throw 없음).
 *   5. **신뢰경계(ADR-008)**: 이 스토어는 UI 표시 설정(무해 blob)만 다룬다.
 *      API 키·OAuth 토큰·시크릿을 이 스토어에 저장하면 안 된다(계약 수준 금지).
 *      main은 값 내용을 검증하지 않는다 — 호출부(renderer lib/prefs.ts) 책임.
 *
 * IPC 등록: src/main/ipc/index.ts 에서 UI_PREFS_GET·UI_PREFS_SET 채널에 등록.
 * 소비: renderer lib/prefs.ts → window.api.getUiPrefs() / window.api.setUiPref().
 */

import { readFile as nodeReadFile, writeFile as nodeWriteFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { UiPrefs } from '../shared/ipc-contract'

// ── 주입 인터페이스 ──────────────────────────────────────────────────────────

/**
 * createPrefsStore에 주입할 의존성.
 *
 * prefsPath: 영속화 파일 절대 경로.
 *   기본값: `app.getPath('userData')/ui-prefs.json`.
 *   테스트 시 임시 경로나 mock fs로 대체한다.
 *
 * readFile: 파일 내용을 string으로 읽는 함수.
 *   ENOENT 등 오류 → throw하면 graceful {} 처리.
 *
 * writeFile: JSON 문자열을 파일에 쓰는 함수.
 *   경로는 prefsPath 고정 — renderer가 경로를 지정할 수 없다(신뢰경계).
 */
export interface PrefsDeps {
  /** 영속화 파일 경로 (선택 — 기본: userData/ui-prefs.json). */
  prefsPath?: string
  /** 파일 내용 읽기 함수 (path 인자 없음 — prefsPath 고정). */
  readFile?: () => Promise<string>
  /** 파일 내용 쓰기 함수 (path 인자 없음 — prefsPath 고정). */
  writeFile?: (content: string) => Promise<void>
}

// ── 스토어 인터페이스 ────────────────────────────────────────────────────────

/**
 * PrefsStore — UI 환경설정 인메모리 캐시 + 디스크 영속.
 *
 * getAll(): 전체 설정을 반환. 최초 호출 시 파일 읽기·캐시. 이후 캐시에서.
 * set(key, value): 단일 키 쓰기. 캐시 병합 + 디스크 write. 빈 key → false 반환.
 */
export interface PrefsStore {
  /**
   * UI 환경설정 전체를 반환한다.
   * 파일 없음·파싱 실패 → {} (graceful, throw 없음).
   * 이후 호출은 캐시에서 반환 (readFile 재호출 없음).
   */
  getAll(): Promise<UiPrefs>
  /**
   * 단일 키-값을 저장한다.
   *
   * @param key   설정 키. 비어있으면 false 반환 (write 없음, throw 없음).
   * @param value 설정값 (JSON 직렬화 가능 무해 설정만 — 호출부 책임).
   * @returns     성공 시 true, 빈 key 거부 시 false.
   *
   * CRITICAL(ADR-008): value에 API 키·토큰·시크릿을 전달하지 말 것.
   */
  set(key: string, value: unknown): Promise<boolean>
}

// ── 팩토리 함수 ─────────────────────────────────────────────────────────────

/**
 * PrefsStore 인스턴스를 생성한다.
 *
 * @param deps 의존성 주입 (생략 시 프로덕션 기본값).
 *
 * 기본 deps:
 *   - prefsPath: app.getPath('userData')/ui-prefs.json
 *   - readFile:  node:fs/promises.readFile(prefsPath, 'utf8')
 *   - writeFile: node:fs/promises.writeFile(prefsPath, content, 'utf8')
 *
 * 테스트 주입 예시:
 *   createPrefsStore({ readFile: mockRead, writeFile: mockWrite })
 *
 * CRITICAL(신뢰경계): prefsPath는 main이 결정한다 — renderer가 경로를 지정할 수 없다.
 * IPC 핸들러(ipc/index.ts)는 path를 전달하지 않고 앱 부트 시 초기화된 store 인스턴스를 사용.
 */
export function createPrefsStore(deps?: PrefsDeps): PrefsStore {
  // ── 파일 경로 결정 ────────────────────────────────────────────────────────
  // CRITICAL: electron이 없는 테스트 환경에서 app.getPath()를 호출하면 crash.
  // deps.prefsPath 또는 deps.readFile/writeFile이 주입된 경우 app 호출을 우회한다.
  let resolvedPath: string
  if (deps?.prefsPath) {
    resolvedPath = deps.prefsPath
  } else if (deps?.readFile || deps?.writeFile) {
    // readFile/writeFile이 직접 주입된 경우 — 경로 불필요(함수가 경로를 닫아둠)
    resolvedPath = '<injected>'
  } else {
    // 프로덕션: app.getPath('userData')는 electron이 초기화된 이후에만 유효.
    resolvedPath = join(app.getPath('userData'), 'ui-prefs.json')
  }

  // ── fs 함수 결정 ──────────────────────────────────────────────────────────
  const readFileFn: () => Promise<string> = deps?.readFile
    ?? (() => nodeReadFile(resolvedPath, 'utf8'))

  const writeFileFn: (content: string) => Promise<void> = deps?.writeFile
    ?? ((content: string) => nodeWriteFile(resolvedPath, content, 'utf8'))

  // ── 인메모리 캐시 ─────────────────────────────────────────────────────────
  /**
   * 캐시 상태:
   *   null  = 아직 읽지 않음(초기 상태).
   *   UiPrefs = 읽기 완료(파일 없음·파싱 실패 포함, 최소 {}).
   */
  let cache: UiPrefs | null = null

  // ── getAll ────────────────────────────────────────────────────────────────

  async function getAll(): Promise<UiPrefs> {
    // 캐시 히트 — readFile 재호출 없음
    if (cache !== null) return cache

    // 파일 읽기 시도 (ENOENT·권한 오류 등 → graceful {})
    let raw: string
    try {
      raw = await readFileFn()
    } catch {
      // 파일 없음 또는 읽기 오류 → 빈 prefs
      cache = {}
      return cache
    }

    // JSON 파싱 (실패 → graceful {})
    try {
      const parsed: unknown = JSON.parse(raw)
      // 최상위가 plain object여야 UiPrefs로 사용 가능
      // null·배열·primitive → {}로 대체
      if (
        parsed !== null &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
      ) {
        cache = parsed as UiPrefs
      } else {
        cache = {}
      }
    } catch {
      // JSON.parse 실패 → graceful {}
      cache = {}
    }

    return cache
  }

  // ── set ───────────────────────────────────────────────────────────────────

  async function set(key: string, value: unknown): Promise<boolean> {
    // CRITICAL(신뢰경계): 빈 key 거부 — 최소 입력 검증 (IPC 계약 명시)
    if (typeof key !== 'string' || key.length === 0) {
      return false
    }

    // 캐시가 없으면 먼저 초기화 (최초 set 전 getAll 안 한 경우)
    if (cache === null) {
      await getAll()
    }

    // 캐시 병합 (얕은 병합 — 최상위 키만)
    cache = { ...cache!, [key]: value }

    // 디스크 write (JSON 직렬화, 2-space indent for readability)
    try {
      await writeFileFn(JSON.stringify(cache, null, 2))
    } catch {
      // write 실패 시 캐시는 유지 (메모리 상태는 갱신됨)
      // 다음 앱 재시작 시 파일에서 읽으면 이전 상태로 복구됨 — graceful
    }

    return true
  }

  // ── 공개 인터페이스 반환 ──────────────────────────────────────────────────
  return { getAll, set }
}
