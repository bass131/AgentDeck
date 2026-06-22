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
  }
  // 향후 마이그레이션은 version: 2, 3 ... 으로 여기에 추가
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

  const stmtUpsert = db.prepare(`
    INSERT INTO conversations (id, title, messages_json, backend_id, created_at, updated_at)
    VALUES (@id, @title, @messages_json, @backend_id, @created_at, @updated_at)
    ON CONFLICT(id) DO UPDATE SET
      title        = excluded.title,
      messages_json = excluded.messages_json,
      backend_id   = excluded.backend_id,
      updated_at   = excluded.updated_at
  `)

  const stmtSelectById = db.prepare<[string], ConversationRow>(
    'SELECT * FROM conversations WHERE id = ?'
  )

  const stmtSelectRecent = db.prepare<[number], ConversationRow>(
    'SELECT * FROM conversations ORDER BY updated_at DESC, rowid DESC LIMIT ?'
  )

  // ── 헬퍼 ────────────────────────────────────────────────────────────────────

  function rowToRecord(row: ConversationRow): ConversationRecord {
    return {
      id: row.id,
      title: row.title,
      messages: JSON.parse(row.messages_json),
      backendId: row.backend_id as ConversationRecord['backendId'],
      createdAt: row.created_at,
      updatedAt: row.updated_at
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
        updated_at: now
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

    close(): void {
      db.close()
    }
  }
}
