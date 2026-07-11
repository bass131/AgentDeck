/**
 * store.ts — ConversationStore JSON fan-out 구현 (순수 모듈)
 *
 * CRITICAL: electron을 import하지 않는다 → vitest node 환경에서 직접 테스트 가능.
 * 디렉토리 경로를 생성자 인자로 주입 → 임시 디렉토리로 테스트.
 *
 * ADR-006 supersede → JSON fan-out (M1: sqlite 완전 제거).
 * ADR-008: API 키·시크릿 평문 저장 금지 — ConversationRecord에 시크릿 필드 없음.
 *
 * 파일 레이아웃:
 *   <dir>/<id>.json   = { ...ConversationRecord, custom_title: boolean }
 *   <dir>/index.json  = { version: 1, ids: string[] }
 *
 * 정렬 동형성(B1): index.json.ids = 최초 생성순 고정(rowid 동형).
 *   listRecent = updatedAt DESC 1차, ids 인덱스 DESC(후-생성 우선) 2차.
 *
 * 원본 참조: C:/Dev/AgentCodeGUI/src/main/chats.ts
 *   safeId 정규식·변경캐시·손상 graceful skip 기법 미러.
 */

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ConversationRecord, PersistedSubAgent } from '../../shared/ipc-contract'
import { SUBAGENT_PERSIST_LIMITS } from '../../shared/ipc-contract'
import type { TokenUsage, SubAgentTool, SubAgentTranscriptItem } from '../../shared/agent-events'

// ── 타입 정의 ─────────────────────────────────────────────────────────────────

/**
 * save() 입력 타입:
 *   ConversationRecord에서 createdAt/updatedAt 제외 + id 선택적.
 *   id 미지정 시 신규 생성, 지정 시 upsert.
 */
export type ConversationSaveInput = Omit<ConversationRecord, 'createdAt' | 'updatedAt'> & {
  id?: string
}

/**
 * ConversationStore 인터페이스 — 구현 세부사항에 의존하지 않는 계약.
 */
export interface ConversationStore {
  /**
   * 대화 저장 (upsert).
   * id 없으면 신규 UUID 발급.
   * custom_title=true이면 기존 title 보존(자동제목이 사용자제목 덮지 않음).
   * @returns 저장된 대화의 id
   */
  save(record: ConversationSaveInput): string

  /**
   * id로 대화 로드.
   * @returns ConversationRecord 또는 없으면 null
   */
  load(id: string): ConversationRecord | null

  /**
   * 최근 대화 목록 반환 (updatedAt 내림차순).
   * @param limit 최대 개수 (default: 20)
   */
  listRecent(limit?: number): ConversationRecord[]

  /**
   * 대화를 영구 삭제한다.
   * @returns 삭제 성공 여부 (없는 id면 false)
   */
  delete(id: string): boolean

  /**
   * 대화 제목을 변경하고 custom_title=true 플래그를 설정한다.
   * custom_title=true 이후 save()는 해당 대화의 title을 덮지 않는다.
   * @returns 변경 성공 여부 (없는 id면 false)
   */
  rename(id: string, title: string): boolean

  /**
   * 연결 닫기 (JSON 구현은 no-op — 동기 writeFileSync라 flush 불필요).
   * 인터페이스 보존을 위해 메서드는 유지.
   */
  close(): void
}

// ── 내부 파일 타입 ─────────────────────────────────────────────────────────────

/** <id>.json 파일에 저장되는 구조 (ConversationRecord + 내부 필드) */
interface ChatFile extends ConversationRecord {
  /** 사용자 지정 제목 플래그 (true = 사용자 지정, false = 자동) — 반환 record엔 노출 안 함 */
  custom_title: boolean
}

/** <dir>/index.json 파일 구조 */
interface IndexFile {
  version: number
  /** 생성 순서 고정 배열 (rowid 동형) — 절대 MRU 재정렬 금지 */
  ids: string[]
}

// ── safeId 가드 ────────────────────────────────────────────────────────────────

/**
 * path-traversal 차단: chat id는 UUID 또는 `chat-<n>-<base36>` 형식.
 * 원본 AgentCodeGUI/chats.ts L16 미러 + '..' 명시 거부.
 *
 * 정규식은 점(.) 포함 문자를 허용하지만 '..'(현재 디렉토리 상위 탐색)은
 * path.join과 결합 시 경계 탈출 가능 → 명시적 거부.
 */
const safeId = (id: unknown): id is string =>
  typeof id === 'string' &&
  id !== '..' &&
  /^[A-Za-z0-9._-]+$/.test(id)

// ── 표시 메타 정규화 (untrusted renderer 입력) ──────────────────────────────────

/** contextWindow: 유한 비음수 number만 통과, 그 외 undefined. */
function sanitizeContextWindow(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined
}

/**
 * TokenUsage: inputTokens·outputTokens가 유한 number인 객체만 통과.
 * 알려진 수치 필드만 추출(임의 중첩 데이터 저장 차단 — 신뢰경계). 그 외 undefined.
 */
function sanitizeUsage(v: unknown): TokenUsage | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const u = v as Record<string, unknown>
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
  if (!num(u.inputTokens) || !num(u.outputTokens)) return undefined
  const out: TokenUsage = { inputTokens: u.inputTokens, outputTokens: u.outputTokens }
  if (num(u.cacheCreationTokens)) out.cacheCreationTokens = u.cacheCreationTokens
  if (num(u.cacheReadTokens)) out.cacheReadTokens = u.cacheReadTokens
  return out
}

/**
 * SubAgentTool 단일 항목 검증(신뢰경계): id/verb/target이 string, status가 알려진 리터럴만
 * 통과. 알려진 필드만 추출(임의 중첩 차단). 형상 불일치 시 undefined(호출측에서 필터).
 */
function sanitizeSubagentTool(v: unknown): SubAgentTool | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const t = v as Record<string, unknown>
  const str = (x: unknown): x is string => typeof x === 'string'
  if (!str(t.id) || !str(t.verb) || !str(t.target)) return undefined
  if (t.status !== 'running' && t.status !== 'done' && t.status !== 'queued') return undefined
  return { id: t.id, verb: t.verb, target: t.target, status: t.status }
}

/**
 * SubAgentTranscriptItem 단일 항목 검증(신뢰경계): kind가 알려진 리터럴만 통과.
 * text는 maxTextChars로 절삭(untrusted 모델 출력 — 무제한 저장 방지).
 * 알려진 필드만 추출(임의 중첩 차단). 형상 불일치 시 undefined(호출측에서 필터).
 */
function sanitizeTranscriptItem(v: unknown): SubAgentTranscriptItem | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const item = v as Record<string, unknown>
  if (item.kind !== 'text' && item.kind !== 'thinking' && item.kind !== 'tool') return undefined
  const out: SubAgentTranscriptItem = { kind: item.kind }
  if (typeof item.text === 'string') {
    out.text = item.text.slice(0, SUBAGENT_PERSIST_LIMITS.maxTextChars)
  }
  if (typeof item.verb === 'string') out.verb = item.verb
  if (typeof item.target === 'string') out.target = item.target
  if (item.status === 'running' || item.status === 'done' || item.status === 'queued') {
    out.status = item.status
  }
  if (typeof item.id === 'string') out.id = item.id
  return out
}

/**
 * PersistedSubAgent 단일 원소 검증(신뢰경계): id/name/role이 string, status가 알려진
 * 리터럴, tools가 배열, afterMessageIndex가 0 이상의 정수(음수·실수는 rebuildThreadWithSubagents가
 * 어떤 메시지 인덱스와도 매칭 못 해 고아 카드를 유발하므로 차단)만 통과(필수 shape).
 * 알려진 필드만 추출(임의 중첩 차단) + 하위 배열(tools/transcript)·텍스트(activity) 상한 절삭.
 * 형상 불일치 시 undefined(호출측 sanitizeSubagents가 배열에서 필터).
 */
function sanitizeSubagentEntry(v: unknown): PersistedSubAgent | undefined {
  if (v === null || typeof v !== 'object') return undefined
  const s = v as Record<string, unknown>
  const str = (x: unknown): x is string => typeof x === 'string'
  const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)

  if (!str(s.id) || !str(s.name) || !str(s.role)) return undefined
  if (s.status !== 'queued' && s.status !== 'running' && s.status !== 'done') return undefined
  if (!Array.isArray(s.tools)) return undefined
  // afterMessageIndex는 0-based 정수 위치 앵커(rebuildThreadWithSubagents가 정확히 일치하는
  // k와만 매칭) — 음수/실수는 어떤 메시지 인덱스와도 매칭되지 않아 고아 카드(위치 없는 subagent)를
  // 유발한다. 신뢰경계(renderer untrusted) 조임: 정수 + 0 이상만 통과.
  if (!num(s.afterMessageIndex) || !Number.isInteger(s.afterMessageIndex) || s.afterMessageIndex < 0) {
    return undefined
  }

  const tools = s.tools
    .map(sanitizeSubagentTool)
    .filter((x): x is SubAgentTool => x !== undefined)
    .slice(0, SUBAGENT_PERSIST_LIMITS.maxTools)

  const out: PersistedSubAgent = {
    id: s.id,
    name: s.name,
    role: s.role,
    status: s.status,
    tools,
    afterMessageIndex: s.afterMessageIndex
  }

  if (typeof s.activity === 'string') {
    out.activity = s.activity.slice(0, SUBAGENT_PERSIST_LIMITS.maxTextChars)
  }
  if (Array.isArray(s.transcript)) {
    out.transcript = s.transcript
      .map(sanitizeTranscriptItem)
      .filter((x): x is SubAgentTranscriptItem => x !== undefined)
      .slice(0, SUBAGENT_PERSIST_LIMITS.maxTranscriptItems)
  }
  if (typeof s.model === 'string') out.model = s.model
  if (typeof s.displayName === 'string') out.displayName = s.displayName

  return out
}

/**
 * PersistedSubAgent[]: 배열이 아니면 undefined. 각 원소는 sanitizeSubagentEntry로
 * shape 검증 + 알려진 필드만 추출(임의 중첩 차단, 신뢰경계 — renderer untrusted) 후
 * 형상 불일치 원소는 필터링(전체 무효화 아님 — graceful, 나머지 chat 파일 손상 skip 철학 미러).
 * 배열 전체는 maxSubagents로 절삭. 상한은 SUBAGENT_PERSIST_LIMITS 단일 출처.
 */
function sanitizeSubagents(v: unknown): PersistedSubAgent[] | undefined {
  if (!Array.isArray(v)) return undefined
  return v
    .map(sanitizeSubagentEntry)
    .filter((x): x is PersistedSubAgent => x !== undefined)
    .slice(0, SUBAGENT_PERSIST_LIMITS.maxSubagents)
}

// ── 구현 ──────────────────────────────────────────────────────────────────────

/**
 * ConversationStore의 JSON fan-out 구현을 생성한다.
 *
 * @param dir 대화 파일을 저장할 디렉토리 경로.
 *   (기존 시그니처 `dbPath: string`과 동일한 위치 — 의미만 디렉토리로 변경)
 * @returns ConversationStore 인스턴스
 *
 * 사용 예:
 *   const store = createConversationStore(join(app.getPath('userData'), 'chats'))
 *   // 테스트:
 *   const store = createConversationStore(fs.mkdtempSync(path.join(os.tmpdir(),'store-')))
 */
export function createConversationStore(dir: string): ConversationStore {
  // 디렉토리 확보
  fs.mkdirSync(dir, { recursive: true })

  const indexPath = path.join(dir, 'index.json')
  const chatFile = (id: string): string => path.join(dir, `${id}.json`)

  // 변경캐시: id → 마지막으로 기록한 JSON 문자열
  // 내용 동일 시 재기록 skip (원본 chats.ts L19/L86-88 미러)
  const cache = new Map<string, string>()

  // ── index 읽기/쓰기 헬퍼 ──────────────────────────────────────────────────

  function readIndex(): IndexFile {
    try {
      const raw = fs.readFileSync(indexPath, 'utf8')
      const parsed = JSON.parse(raw) as IndexFile
      if (!Array.isArray(parsed.ids)) {
        // 손상된 index — 빈 상태로 복구 (원본 L44-46 graceful skip 미러)
        return { version: 1, ids: [] }
      }
      return parsed
    } catch {
      // 파일 없음 또는 파싱 실패 → 초기 상태 (원본 graceful skip 미러)
      return { version: 1, ids: [] }
    }
  }

  function writeIndex(index: IndexFile): void {
    const json = JSON.stringify(index)
    // index도 변경캐시로 불필요 재기록 skip
    if (cache.get('__index__') === json) return
    fs.writeFileSync(indexPath, json)
    cache.set('__index__', json)
  }

  // ── 개별 chat 파일 읽기 헬퍼 ─────────────────────────────────────────────

  function readChatFile(id: string): ChatFile | null {
    try {
      const raw = fs.readFileSync(chatFile(id), 'utf8')
      const parsed = JSON.parse(raw) as ChatFile
      // 캐시 갱신 (재기동 후 첫 읽기 시)
      cache.set(id, raw)
      return parsed
    } catch {
      // 파일 없음 또는 파싱 실패 — graceful skip (원본 L113-115 미러)
      return null
    }
  }

  /** ChatFile → 반환 ConversationRecord (custom_title 내부 필드 제외) */
  function toRecord(chat: ChatFile): ConversationRecord {
    const cwd = chat.cwd && chat.cwd.length > 0 ? chat.cwd : undefined
    const sessionId = chat.sessionId && chat.sessionId.length > 0 ? chat.sessionId : undefined
    // 표시 메타(게이지) — 디스크 파일 손상/수기수정 방어 위해 읽기 때도 재정규화.
    const lastContextWindow = sanitizeContextWindow(chat.lastContextWindow)
    const lastUsage = sanitizeUsage(chat.lastUsage)
    // CP1 P05: 디스크 파일 손상/수기수정 방어 위해 읽기 때도 재정규화(sanitizeContextWindow/
    //   sanitizeUsage 선례 미러). 누락 시 저장은 되는데 load에서 사라지는 버그 방지.
    const subagents = sanitizeSubagents(chat.subagents)
    // replMode(LR4 P07) — 디스크 손상/수기수정 방어 위해 읽기 때도 재정규화(sanitize 선례 미러).
    //   false는 유효값 — undefined와 구분해 보존(typeof 게이트만, "빈/falsy면 omit" 금지).
    const replMode = typeof chat.replMode === 'boolean' ? chat.replMode : undefined
    return {
      id: chat.id,
      title: chat.title,
      messages: chat.messages,
      backendId: chat.backendId,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      ...(cwd !== undefined ? { cwd } : {}),
      ...(sessionId !== undefined ? { sessionId } : {}),
      ...(lastContextWindow !== undefined ? { lastContextWindow } : {}),
      ...(lastUsage !== undefined ? { lastUsage } : {}),
      ...(subagents !== undefined ? { subagents } : {}),
      ...(replMode !== undefined ? { replMode } : {})
    }
  }

  // ── 인터페이스 구현 ──────────────────────────────────────────────────────────

  return {
    save(record: ConversationSaveInput): string {
      // 1. messages 검증 (renderer 입력은 untrusted)
      if (!Array.isArray(record.messages)) {
        throw new Error('messages must be an array')
      }

      // 2. id 처리: 명시 id면 safeId 검증, 없으면 UUID 발급
      if (record.id !== undefined) {
        if (!safeId(record.id)) {
          throw new Error(`save: unsafe id rejected: ${String(record.id)}`)
        }
      }
      const id = record.id || randomUUID()
      const now = new Date().toISOString()

      // 3. 기존 파일 읽기 (upsert 로직)
      const existing = readChatFile(id)
      const createdAt = existing ? existing.createdAt : now

      // 4. custom_title 보존: 기존 파일에 custom_title=true이면 incoming title 무시
      const customTitle = existing?.custom_title ?? false
      const title = customTitle ? existing!.title : (record.title ?? '')

      // 5. cwd: 매 save 덮어쓰기. 빈 문자열/누락 → undefined
      const cwd = record.cwd && record.cwd.length > 0 ? record.cwd : undefined
      // 5b. sessionId(Phase 1.5): 매 save 덮어쓰기(최신 세션). 빈/누락 → undefined.
      const sessionId = record.sessionId && record.sessionId.length > 0 ? record.sessionId : undefined
      // 5c. 표시 메타(게이지) — untrusted renderer 입력이므로 수치/형상 정규화 후 저장.
      const lastContextWindow = sanitizeContextWindow(record.lastContextWindow)
      const lastUsage = sanitizeUsage(record.lastUsage)
      // 5d. 서브에이전트 스냅샷(CP1 P05) — untrusted renderer 입력 shape 검증 + 상한 절삭.
      const subagents = sanitizeSubagents(record.subagents)
      // 5e. replMode(LR4 P07, 대화별 REPL 토글) — boolean만 통과. false는 유효한 저장값이므로
      //   sessionId류 "빈/falsy면 omit" 패턴을 쓰면 안 된다(false가 소실되어 OFF 세션이
      //   재로드 시 기본 ON으로 되살아남). 포함 판정은 typeof(여기)·!== undefined(spread) 둘뿐.
      const replMode = typeof record.replMode === 'boolean' ? record.replMode : undefined

      const chatData: ChatFile = {
        id,
        title,
        messages: record.messages,
        backendId: record.backendId,
        createdAt,
        updatedAt: now,
        custom_title: customTitle,
        ...(cwd !== undefined ? { cwd } : {}),
        ...(sessionId !== undefined ? { sessionId } : {}),
        ...(lastContextWindow !== undefined ? { lastContextWindow } : {}),
        ...(lastUsage !== undefined ? { lastUsage } : {}),
        ...(subagents !== undefined ? { subagents } : {}),
        ...(replMode !== undefined ? { replMode } : {})
      }

      // 6. 변경캐시 확인 → 내용 동일 시 재기록 skip
      const json = JSON.stringify(chatData)
      if (cache.get(id) !== json) {
        fs.writeFileSync(chatFile(id), json)
        cache.set(id, json)
      }

      // 7. index 갱신: 신규 id면 push, 기존이면 위치 불변 (절대 MRU 재정렬 금지 — B1)
      const index = readIndex()
      if (!index.ids.includes(id)) {
        index.ids.push(id)
        writeIndex(index)
      }

      return id
    },

    load(id: string): ConversationRecord | null {
      // safeId 거부 → null (S1 계약)
      if (!safeId(id)) return null

      const chat = readChatFile(id)
      if (!chat) return null

      return toRecord(chat)
    },

    listRecent(limit = 20): ConversationRecord[] {
      const index = readIndex()

      // ids 배열 + 인덱스 위치(생성 순서) 기록
      const records: Array<{ record: ConversationRecord; idsIndex: number }> = []

      for (let i = 0; i < index.ids.length; i++) {
        const id = index.ids[i]
        if (!safeId(id)) continue
        const chat = readChatFile(id)
        if (!chat) continue // 손상/누락 파일 graceful skip
        records.push({ record: toRecord(chat), idsIndex: i })
      }

      // 정렬: updatedAt DESC 1차, ids 인덱스 DESC 2차 (sqlite ORDER BY updated_at DESC, rowid DESC 동형)
      records.sort((a, b) => {
        const timeDiff = b.record.updatedAt.localeCompare(a.record.updatedAt)
        if (timeDiff !== 0) return timeDiff
        // 동률 시 ids 인덱스 DESC (후-생성 우선)
        return b.idsIndex - a.idsIndex
      })

      return records.slice(0, limit).map(r => r.record)
    },

    delete(id: string): boolean {
      // safeId 거부 → false (S1 계약)
      if (!safeId(id)) return false

      const filePath = chatFile(id)
      // 파일 존재 여부 확인
      if (!fs.existsSync(filePath)) return false

      // 파일 삭제
      try {
        fs.unlinkSync(filePath)
      } catch {
        return false
      }
      cache.delete(id)

      // index에서 제거
      const index = readIndex()
      const before = index.ids.length
      index.ids = index.ids.filter(existingId => existingId !== id)
      if (index.ids.length < before) {
        // index 캐시 무효화 후 재기록
        cache.delete('__index__')
        writeIndex(index)
      }

      return true
    },

    rename(id: string, title: string): boolean {
      // safeId 거부 → false (S1 계약)
      if (!safeId(id)) return false

      const existing = readChatFile(id)
      if (!existing) return false

      const now = new Date().toISOString()
      const chatData: ChatFile = {
        ...existing,
        title,
        custom_title: true,
        updatedAt: now
      }

      // 변경캐시: rename은 항상 내용이 다르므로 재기록
      const json = JSON.stringify(chatData)
      // cache 무효화 후 재기록
      cache.delete(id)
      fs.writeFileSync(chatFile(id), json)
      cache.set(id, json)

      return true
    },

    close(): void {
      // JSON 구현은 동기 writeFileSync → pending write 없음 → no-op 안전.
      // 인터페이스 유지를 위해 메서드만 보존.
    }
  }
}
