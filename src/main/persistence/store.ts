/**
 * store.ts — ConversationStore better-sqlite3 구현 (순수 모듈)
 *
 * CRITICAL: electron을 import하지 않는다 → vitest node 환경에서 직접 테스트 가능.
 *   DB 경로를 생성자 인자로 주입 → ':memory:' 또는 임시 경로로 테스트.
 *
 * ADR-006: better-sqlite3 동기 API, main 프로세스 전용.
 * ADR-008: API 키·시크릿 평문 저장 금지 — 이 스키마에 시크릿 컬럼 없음.
 *
 * 마이그레이션 원칙 (ADR-006 append-only):
 *   - 출시된 마이그레이션(migrations 배열 기존 항목)은 수정 금지.
 *   - 스키마 변경 시 새 항목을 배열 끝에 추가.
 *
 * 트레이드오프:
 *   better-sqlite3는 동기 API다. 짧은 트랜잭션(< 수십ms)이면 UI 블록 없음.
 *   긴 배치 연산은 worker thread에서 실행해야 한다 (MVP 범위 밖).
 */

import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { ConversationRecord } from '../../shared/ipc-contract'

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
 * 테스트에서 인메모리 구현으로 교체 가능하도록 인터페이스 분리.
 */
export interface ConversationStore {
  /**
   * 대화 저장 (upsert).
   * id 없으면 신규 UUID 발급.
   * custom_title=1 이면 기존 title 보존(renderer 자동제목이 덮지 않음).
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
   * 대화 제목을 변경하고 custom_title=1 플래그를 설정한다.
   * custom_title=1 이후 save()는 해당 대화의 title을 덮지 않는다.
   * @returns 변경 성공 여부 (없는 id면 false)
   */
  rename(id: string, title: string): boolean

  /**
   * DB 연결 닫기 (테스트 정리 + 앱 종료 시).
   */
  close(): void
}

// ── DB 행 타입 (내부용) ───────────────────────────────────────────────────────

interface ConversationRow {
  id: string
  title: string
  messages_json: string
  backend_id: string
  created_at: string
  updated_at: string
  /** v2 마이그레이션 추가: 사용자 지정 제목 플래그 (1=사용자 지정, 0=자동) */
  custom_title: number
  /** v3 마이그레이션 추가: 대화 앵커 작업폴더 경로 (nullable) */
  cwd: string | null
}

// ── 마이그레이션 (append-only) ────────────────────────────────────────────────

/**
 * 마이그레이션 목록 — 출시 후 기존 항목 수정 금지.
 * 새 마이그레이션은 배열 끝에 추가.
 *
 * migrations 테이블이 버전을 추적하며, 이미 적용된 것은 건너뜀.
 */
const migrations: { version: number; sql: string }[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE IF NOT EXISTS conversations (
        id          TEXT PRIMARY KEY,
        title       TEXT NOT NULL DEFAULT '',
        messages_json TEXT NOT NULL DEFAULT '[]',
        backend_id  TEXT NOT NULL DEFAULT 'claude-code',
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
        ON conversations (updated_at DESC);
    `
  },
  {
    // 출시 후 수정 금지 — append-only (ADR-006).
    // custom_title=1: 사용자가 rename()으로 지정한 제목 → save() upsert에서 덮지 않음.
    // custom_title=0(default): 자동 생성 제목 → save() upsert에서 갱신 가능.
    version: 2,
    sql: 'ALTER TABLE conversations ADD COLUMN custom_title INTEGER NOT NULL DEFAULT 0;'
  },
  {
    // 출시 후 수정 금지 — append-only (ADR-006).
    // cwd: 대화 앵커 작업폴더 절대경로 (ADR-020).
    // nullable(기존 행은 자동 NULL) → 하위 호환 graceful.
    // NULL 허용 이유: 기존 대화·마이그레이션 전 행이 NULL을 가져야 함.
    //   (NOT NULL DEFAULT 대신 NULL 허용 — custom_title과 다른 패턴 의도적 선택.)
    version: 3,
    sql: 'ALTER TABLE conversations ADD COLUMN cwd TEXT;'
  }
  // 향후 마이그레이션은 version: 4, 5 ... 으로 여기에 추가
]

// ── 구현 ──────────────────────────────────────────────────────────────────────

/**
 * ConversationStore의 better-sqlite3 구현을 생성한다.
 *
 * @param dbPath DB 파일 경로. ':memory:' 또는 임시 경로로 테스트 가능.
 * @returns ConversationStore 인스턴스
 *
 * 사용 예:
 *   const store = createConversationStore(app.getPath('userData') + '/conversations.db')
 *   // 테스트:
 *   const store = createConversationStore(':memory:')
 */
export function createConversationStore(dbPath: string): ConversationStore {
  const db = new Database(dbPath)

  // WAL 모드: 읽기/쓰기 동시성 향상 (better-sqlite3 권장)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 마이그레이션 테이블 초기화
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `)

  // 미적용 마이그레이션 실행
  const getApplied = db.prepare<[], { version: number }>('SELECT version FROM _migrations')
  const appliedVersions = new Set(getApplied.all().map((r) => r.version))

  const insertMigration = db.prepare(
    'INSERT INTO _migrations (version, applied_at) VALUES (?, ?)'
  )

  for (const migration of migrations) {
    if (!appliedVersions.has(migration.version)) {
      db.exec(migration.sql)
      insertMigration.run(migration.version, new Date().toISOString())
    }
  }

  // ── Prepared statements ──────────────────────────────────────────────────

  // upsert: custom_title=1인 기존 행의 title은 갱신하지 않는다 (🟡-3 함정 방어).
  // ON CONFLICT DO UPDATE 절에서 custom_title=0인 경우에만 title을 갱신하고,
  // custom_title 자체는 SET에 포함하지 않아 rename()이 설정한 값을 보존한다.
  // cwd: 매 save마다 덮어쓰기 — 대화가 현재 워크스페이스에 앵커됨 (ADR-020).
  const stmtUpsert = db.prepare(`
    INSERT INTO conversations (id, title, messages_json, backend_id, created_at, updated_at, cwd)
    VALUES (@id, @title, @messages_json, @backend_id, @created_at, @updated_at, @cwd)
    ON CONFLICT(id) DO UPDATE SET
      title         = CASE WHEN custom_title = 1 THEN title ELSE excluded.title END,
      messages_json = excluded.messages_json,
      backend_id    = excluded.backend_id,
      updated_at    = excluded.updated_at,
      cwd           = excluded.cwd
  `)

  const stmtSelectById = db.prepare<[string], ConversationRow>(
    'SELECT * FROM conversations WHERE id = ?'
  )

  const stmtSelectRecent = db.prepare<[number], ConversationRow>(
    'SELECT * FROM conversations ORDER BY updated_at DESC, rowid DESC LIMIT ?'
  )

  // delete: 영향 행 수로 존재 여부 판단
  const stmtDelete = db.prepare<[string]>(
    'DELETE FROM conversations WHERE id = ?'
  )

  // rename: 제목 변경 + custom_title=1 설정 + updated_at 갱신
  const stmtRename = db.prepare<[string, string, string]>(
    'UPDATE conversations SET title = ?, custom_title = 1, updated_at = ? WHERE id = ?'
  )

  // ── 헬퍼 ────────────────────────────────────────────────────────────────────

  function rowToRecord(row: ConversationRow): ConversationRecord {
    // cwd: NULL 또는 빈 문자열 → undefined (graceful — 미설정 기존 행 하위호환)
    const cwd = row.cwd && row.cwd.length > 0 ? row.cwd : undefined
    return {
      id: row.id,
      title: row.title,
      messages: JSON.parse(row.messages_json),
      backendId: row.backend_id as ConversationRecord['backendId'],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ...(cwd !== undefined ? { cwd } : {})
    }
  }

  // ── 인터페이스 구현 ──────────────────────────────────────────────────────────

  return {
    save(record: ConversationSaveInput): string {
      // 입력 검증 (renderer는 untrusted)
      if (!Array.isArray(record.messages)) {
        throw new Error('messages must be an array')
      }

      const id = record.id || randomUUID()
      const now = new Date().toISOString()

      // 기존 레코드의 createdAt 보존 (upsert 시 최초 생성 시각 유지)
      const existing = stmtSelectById.get(id)
      const createdAt = existing ? existing.created_at : now

      stmtUpsert.run({
        id,
        title: record.title ?? '',
        messages_json: JSON.stringify(record.messages),
        backend_id: record.backendId,
        created_at: createdAt,
        updated_at: now,
        // cwd: undefined/null → SQL NULL (하위호환 — 기존 대화 graceful 유지)
        cwd: record.cwd ?? null
      })

      return id
    },

    load(id: string): ConversationRecord | null {
      const row = stmtSelectById.get(id)
      return row ? rowToRecord(row) : null
    },

    listRecent(limit = 20): ConversationRecord[] {
      const rows = stmtSelectRecent.all(limit)
      return rows.map(rowToRecord)
    },

    delete(id: string): boolean {
      // untrusted id는 핸들러에서 타입 검증 완료 후 진입 — 여기서는 DB 연산만.
      const result = stmtDelete.run(id)
      return result.changes > 0
    },

    rename(id: string, title: string): boolean {
      // untrusted 입력은 핸들러에서 타입·비어있음 검증 완료 후 진입.
      const now = new Date().toISOString()
      const result = stmtRename.run(title, now, id)
      return result.changes > 0
    },

    close(): void {
      db.close()
    }
  }
}
