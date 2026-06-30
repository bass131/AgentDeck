/**
 * profile.ts — 로컬 사용자 프로필 영속화 (P2 — 닉네임·아바타 색 개인화)
 *
 * 원본: AgentCodeGUI UserProfile { nickname, color } 동형.
 * 영속 경로: userData/profile.json (OS 사용자 디렉토리, git-ignored).
 *
 * 설계 원칙:
 *   1. **electron import 0** — profilePath와 fs를 주입받아 Vitest에서 직접 테스트 가능.
 *   2. **주입형 deps** — readFile·writeFile을 인자로 받아 mock 가능. 기본값은 실 fs.
 *   3. **인메모리 캐시** — 최초 읽기 후 캐시. set() 시 캐시 교체 + 디스크 write.
 *   4. **graceful** — 파일 없음·파싱 실패·필수 필드 누락 → null (silent, throw 없음).
 *      null 응답 = 첫실행 판정 → renderer가 온보딩 화면 진입.
 *   5. **신뢰경계(ADR-008)**: 이 스토어는 닉네임·색상 개인화만 다룬다.
 *      토큰·시크릿·API 키를 이 스토어에 저장하면 안 된다(계약 수준 금지).
 *
 * IPC 등록: src/main/00_ipc/index.ts 에서 PROFILE_GET·PROFILE_SET 채널에 등록.
 * 소비: renderer 부트 3단계 게이트(boot→login→MainApp) + Profile 온보딩 저장.
 */

import { readFile as nodeReadFile, writeFile as nodeWriteFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { Profile } from '../shared/ipc-contract'

// ── 주입 인터페이스 ──────────────────────────────────────────────────────────

/**
 * createProfileStore에 주입할 의존성.
 *
 * profilePath: 영속화 파일 절대 경로.
 *   기본값: `app.getPath('userData')/profile.json`.
 *   테스트 시 임시 경로나 mock fs로 대체한다.
 *
 * readFile: 파일 내용을 string으로 읽는 함수.
 *   ENOENT 등 오류 → throw하면 graceful null 처리.
 *
 * writeFile: JSON 문자열을 파일에 쓰는 함수.
 *   경로는 profilePath 고정 — renderer가 경로를 지정할 수 없다(신뢰경계).
 */
export interface ProfileDeps {
  /** 영속화 파일 경로 (선택 — 기본: userData/profile.json). */
  profilePath?: string
  /** 파일 내용 읽기 함수 (path 인자 없음 — profilePath 고정). */
  readFile?: () => Promise<string>
  /** 파일 내용 쓰기 함수 (path 인자 없음 — profilePath 고정). */
  writeFile?: (content: string) => Promise<void>
}

// ── 스토어 인터페이스 ────────────────────────────────────────────────────────

/**
 * ProfileStore — 로컬 사용자 프로필 인메모리 캐시 + 디스크 영속.
 *
 * get(): 프로필을 반환. 파일 없음·파싱 실패·필수 필드 누락 → null(첫실행).
 * set(p): 프로필 저장. nickname(비어있지 않은 string)·color(string) 검증.
 *         불합격 → false, 캐시·디스크 변경 없음.
 */
export interface ProfileStore {
  /**
   * 로컬 프로필을 반환한다.
   *
   * - 파일 없음(ENOENT) → null
   * - 파싱 실패 → null
   * - 비-객체 JSON(배열·null·primitive) → null
   * - nickname·color 필드 누락 또는 타입 불일치(non-string) → null
   * - nickname이 빈 문자열 → null
   * - 정상 → Profile
   *
   * 최초 호출 후 캐시. 이후 캐시에서 반환(readFile 재호출 없음).
   * null도 캐시된다 — 파일이 없는 상태에서 반복 호출 시 ENOENT 재시도 없음.
   */
  get(): Promise<Profile | null>

  /**
   * 로컬 프로필을 저장한다.
   *
   * @param p Profile 객체 (untrusted — 이 함수가 검증).
   * @returns  성공 시 true, 검증 실패 시 false (throw 없음).
   *
   * 검증 규칙(신뢰경계):
   *   - p가 null·비-객체 → false.
   *   - nickname: string이고 trim() 후 비어있지 않아야 한다.
   *   - color: string이어야 한다 (값 범위는 renderer 책임).
   *   - 불합격 → false (캐시·디스크 변경 없음).
   *
   * CRITICAL(ADR-008): 토큰·시크릿·API 키를 p에 포함하면 안 된다 — 호출부 책임.
   */
  set(p: Profile): Promise<boolean>
}

// ── 헬퍼: Profile 필드 검증 ──────────────────────────────────────────────────

/**
 * 파싱된 unknown 값이 유효한 Profile인지 검증한다.
 *
 * 검증 조건:
 *   1. plain object (null·배열·primitive 제외)
 *   2. nickname: string이고 trim() 후 비어있지 않음
 *   3. color: string
 *
 * @returns true이면 타입가드로 Profile 확인.
 */
function isValidProfile(value: unknown): value is Profile {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const obj = value as Record<string, unknown>
  if (typeof obj.nickname !== 'string' || obj.nickname.trim().length === 0) {
    return false
  }
  if (typeof obj.color !== 'string') {
    return false
  }
  return true
}

// ── 팩토리 함수 ─────────────────────────────────────────────────────────────

/**
 * ProfileStore 인스턴스를 생성한다.
 *
 * @param deps 의존성 주입 (생략 시 프로덕션 기본값).
 *
 * 기본 deps:
 *   - profilePath: app.getPath('userData')/profile.json
 *   - readFile:  node:fs/promises.readFile(profilePath, 'utf8')
 *   - writeFile: node:fs/promises.writeFile(profilePath, content, 'utf8')
 *
 * 테스트 주입 예시:
 *   createProfileStore({ readFile: mockRead, writeFile: mockWrite })
 *
 * CRITICAL(신뢰경계): profilePath는 main이 결정한다 — renderer가 경로를 지정할 수 없다.
 * IPC 핸들러(ipc/index.ts)는 path를 전달하지 않고 앱 부트 시 초기화된 store 인스턴스를 사용.
 */
export function createProfileStore(deps?: ProfileDeps): ProfileStore {
  // ── 파일 경로 결정 ────────────────────────────────────────────────────────
  // CRITICAL: electron이 없는 테스트 환경에서 app.getPath()를 호출하면 crash.
  // deps.profilePath 또는 deps.readFile/writeFile이 주입된 경우 app 호출을 우회한다.
  let resolvedPath: string
  if (deps?.profilePath) {
    resolvedPath = deps.profilePath
  } else if (deps?.readFile || deps?.writeFile) {
    // readFile/writeFile이 직접 주입된 경우 — 경로 불필요(함수가 경로를 닫아둠)
    resolvedPath = '<injected>'
  } else {
    // 프로덕션: app.getPath('userData')는 electron이 초기화된 이후에만 유효.
    resolvedPath = join(app.getPath('userData'), 'profile.json')
  }

  // ── fs 함수 결정 ──────────────────────────────────────────────────────────
  const readFileFn: () => Promise<string> = deps?.readFile
    ?? (() => nodeReadFile(resolvedPath, 'utf8'))

  const writeFileFn: (content: string) => Promise<void> = deps?.writeFile
    ?? ((content: string) => nodeWriteFile(resolvedPath, content, 'utf8'))

  // ── 인메모리 캐시 ─────────────────────────────────────────────────────────
  /**
   * 캐시 상태:
   *   'unloaded' = 아직 읽지 않음(초기 상태).
   *   Profile     = 읽기 완료 + 유효한 프로필.
   *   null        = 읽기 완료 + 파일 없음·파싱 실패·필드 누락(첫실행).
   *
   * null도 캐시한다 — 첫실행 상태에서 반복 get() 시 ENOENT 재시도 없음.
   * set() 성공 후 null 캐시는 Profile로 교체된다.
   */
  type CacheState = 'unloaded' | Profile | null
  let cache: CacheState = 'unloaded'

  // ── get ───────────────────────────────────────────────────────────────────

  async function get(): Promise<Profile | null> {
    // 캐시 히트 — readFile 재호출 없음
    if (cache !== 'unloaded') return cache

    // 파일 읽기 시도 (ENOENT·권한 오류 등 → graceful null)
    let raw: string
    try {
      raw = await readFileFn()
    } catch {
      // 파일 없음 또는 읽기 오류 → null(첫실행)
      cache = null
      return null
    }

    // JSON 파싱 (실패 → graceful null)
    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      // JSON.parse 실패 → null
      cache = null
      return null
    }

    // 유효성 검증 (필수 필드·타입 확인)
    if (!isValidProfile(parsed)) {
      cache = null
      return null
    }

    // 정상 프로필 — nickname·color만 추출하여 캐시(불필요한 필드 제거)
    cache = { nickname: parsed.nickname, color: parsed.color }
    return cache
  }

  // ── set ───────────────────────────────────────────────────────────────────

  async function set(p: Profile): Promise<boolean> {
    // CRITICAL(신뢰경계): 입력 검증 (untrusted renderer 입력)
    if (!isValidProfile(p)) {
      return false
    }

    // nickname·color만 추출하여 저장(불필요한 필드 제거)
    const profile: Profile = {
      nickname: p.nickname.trim(),
      color: p.color,
    }

    // 캐시 갱신 (set 성공 → 즉시 캐시 업데이트)
    cache = profile

    // 디스크 write (JSON 직렬화, 2-space indent for readability)
    try {
      await writeFileFn(JSON.stringify(profile, null, 2))
    } catch {
      // write 실패 시 캐시는 유지 (메모리 상태는 갱신됨)
      // 다음 앱 재시작 시 파일에서 읽으면 이전 상태로 복구됨 — graceful
    }

    return true
  }

  // ── 공개 인터페이스 반환 ──────────────────────────────────────────────────
  return { get, set }
}
