/**
 * ipc/reference.ts — 레퍼런스 폴더 도메인 채널·타입 계약 (M2-03)
 *
 * 채널: REFERENCE_ADD · REFERENCE_LIST · REFERENCE_TREE
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

import type { FileTreeNode } from './workspace'

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const REFERENCE_CHANNELS = {
  /**
   * 레퍼런스 폴더를 워크스페이스 밖 읽기전용 보조 루트로 등록 (invoke).
   * main이 고유 ID('ref-1', 'ref-2'…)를 발급하고 레지스트리에 저장.
   */
  REFERENCE_ADD: 'reference.add',
  /** 등록된 레퍼런스 폴더 목록 반환 (invoke) */
  REFERENCE_LIST: 'reference.list',
  /**
   * 특정 레퍼런스 루트의 파일 트리 반환 (invoke).
   * 요청의 id는 reference.add 가 발급한 등록 루트 ID여야 한다.
   */
  REFERENCE_TREE: 'reference.tree',
} as const

// ── 레퍼런스 폴더 레코드 ──────────────────────────────────────────────────────

/**
 * 등록된 레퍼런스 폴더 레코드.
 *
 * readOnly 는 리터럴 true — 쓰기 불가를 타입 수준에서 표현한다.
 * 워크스페이스 밖의 보조 루트이므로 fs.read 를 통한 읽기만 허용.
 *
 * id 형식: main이 'ref-1', 'ref-2'… 순서로 발급 (발급 로직은 main-process 담당).
 * rootPath: main이 절대경로 + 존재 + 디렉토리 여부를 검증한 실제 경로.
 *           renderer는 이 값을 표시 목적으로만 사용하고,
 *           파일 접근 시에는 반드시 id를 통해 요청해야 한다.
 */
export interface ReferenceFolder {
  /** main 레지스트리가 발급한 불투명 등록 루트 ID ('ref-1', 'ref-2'…) */
  id: string
  /** 사용자에게 보여줄 폴더 이름 (OS basename) */
  name: string
  /** 실제 절대 경로 (main이 검증 후 저장 — 표시 전용) */
  rootPath: string
  /** 항상 true — 레퍼런스 폴더는 읽기전용 (타입으로 불변식 표현) */
  readOnly: true
}

// ── reference.add ─────────────────────────────────────────────────────────────

/**
 * `reference.add` 요청 — 레퍼런스 폴더 등록.
 *
 * folderPath 주어지면: main이 절대경로 + 존재 + 디렉토리 여부를 검증 후 등록.
 * folderPath 미지정:   main이 OS 폴더 선택 다이얼로그(또는 e2e 환경변수
 *                      AGENTDECK_E2E_REFERENCE)를 사용해 경로를 획득.
 *
 * 보안 불변식: folderPath 는 참고용 힌트일 뿐, main이 항상 재검증한다.
 * 이후 파일 읽기는 reference.add 가 발급한 id 로만 요청 가능(임의 경로 주입 불가).
 */
export interface ReferenceAddRequest {
  /**
   * 등록할 폴더의 절대 경로.
   * undefined 면 main이 OS 다이얼로그(또는 e2e 환경변수)로 경로를 획득.
   * 지정해도 main에서 절대경로 + 존재 + 디렉토리 검증을 수행한다.
   */
  folderPath?: string
}

/** `reference.add` 응답 */
export interface ReferenceAddResponse {
  /**
   * 등록된 레퍼런스 폴더 레코드.
   * 사용자가 다이얼로그를 취소하거나 검증 실패 시 null.
   */
  reference: ReferenceFolder | null
}

// ── reference.list ────────────────────────────────────────────────────────────

/** `reference.list` 요청 (인자 없음) */
export type ReferenceListRequest = Record<string, never>

/** `reference.list` 응답 */
export interface ReferenceListResponse {
  /** 현재 세션에 등록된 레퍼런스 폴더 목록 (등록 순서) */
  references: ReferenceFolder[]
}

// ── reference.tree ────────────────────────────────────────────────────────────

/**
 * `reference.tree` 요청 — 특정 레퍼런스 루트의 파일 트리.
 *
 * id 는 reference.add 가 발급한 등록 루트 ID여야 한다.
 * 미등록 ID면 응답의 tree 가 null 로 반환된다(오류 은닉).
 */
export interface ReferenceTreeRequest {
  /** reference.add 가 발급한 등록 루트 ID */
  id: string
}

/** `reference.tree` 응답 */
export interface ReferenceTreeResponse {
  /**
   * 요청한 레퍼런스 루트의 파일 트리.
   * 미등록 ID이거나 트리 구성 실패 시 null.
   */
  tree: FileTreeNode | null
}
