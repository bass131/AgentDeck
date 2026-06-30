/**
 * roots.test.ts — createRootRegistry() 단위 테스트
 *
 * electron import 없음 → vitest node 환경에서 직접 실행 가능.
 * TDD: 이 파일을 먼저 작성(RED) → roots.ts 구현(GREEN) 순서.
 *
 * 보안 불변식 회귀:
 *   - get(미등록 ID) → null (fs.read 가 not-found 를 내는 근거)
 *   - workspace 루트 readOnly = false, 레퍼런스 readOnly = true
 *   - 같은 path 중복 등록 → 동일 ID 반환(멱등성)
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { WORKSPACE_ROOT_ID } from '../../../02.Source/shared/ipc-contract'
import { createRootRegistry } from '../../../02.Source/main/02_fs/roots'

describe('createRootRegistry', () => {
  // 각 테스트마다 새 레지스트리 인스턴스 사용
  let registry: ReturnType<typeof createRootRegistry>

  beforeEach(() => {
    registry = createRootRegistry()
  })

  // ── setWorkspace / get(WORKSPACE_ROOT_ID) ─────────────────────────────────

  it('setWorkspace → WORKSPACE_ROOT_ID 로 조회 가능', () => {
    registry.setWorkspace('/some/project')
    const entry = registry.get(WORKSPACE_ROOT_ID)
    expect(entry).not.toBeNull()
    expect(entry?.id).toBe(WORKSPACE_ROOT_ID)
    expect(entry?.path).toBe('/some/project')
  })

  it('setWorkspace → readOnly 는 false (워크스페이스는 쓰기 가능)', () => {
    registry.setWorkspace('/some/project')
    expect(registry.get(WORKSPACE_ROOT_ID)?.readOnly).toBe(false)
  })

  it('setWorkspace → name은 경로 basename', () => {
    registry.setWorkspace('/some/project')
    expect(registry.get(WORKSPACE_ROOT_ID)?.name).toBe('project')
  })

  it('setWorkspace 두 번 호출 → WORKSPACE_ROOT_ID 경로 갱신', () => {
    registry.setWorkspace('/first/path')
    registry.setWorkspace('/second/path')
    expect(registry.get(WORKSPACE_ROOT_ID)?.path).toBe('/second/path')
  })

  // ── get 미등록 ID → null ──────────────────────────────────────────────────

  it('[보안] get(미등록 ID) → null (fs.read 가 not-found 를 내는 근거)', () => {
    expect(registry.get('ref-999')).toBeNull()
  })

  it('[보안] get(임의 문자열 경로) → null (절대경로 주입 차단)', () => {
    expect(registry.get('/etc/passwd')).toBeNull()
    expect(registry.get('C:\\Windows\\System32')).toBeNull()
  })

  it('[보안] get(빈 문자열) → null', () => {
    expect(registry.get('')).toBeNull()
  })

  it('워크스페이스 미설정 시 get(WORKSPACE_ROOT_ID) → null', () => {
    expect(registry.get(WORKSPACE_ROOT_ID)).toBeNull()
  })

  // ── addReference ──────────────────────────────────────────────────────────

  it('addReference → ref-1, ref-2 … 순차 ID 발급', () => {
    const r1 = registry.addReference('/ref/folderA', 'folderA')
    const r2 = registry.addReference('/ref/folderB', 'folderB')
    expect(r1.id).toBe('ref-1')
    expect(r2.id).toBe('ref-2')
  })

  it('addReference → readOnly 는 true (레퍼런스 불변식)', () => {
    const ref = registry.addReference('/ref/folderA', 'folderA')
    expect(ref.readOnly).toBe(true)
  })

  it('addReference → 등록 후 get(id) 로 조회 가능', () => {
    const ref = registry.addReference('/ref/folderA', 'folderA')
    const entry = registry.get(ref.id)
    expect(entry).not.toBeNull()
    expect(entry?.path).toBe('/ref/folderA')
    expect(entry?.readOnly).toBe(true)
  })

  it('addReference name 생략 → path basename 사용', () => {
    const ref = registry.addReference('/ref/someFolder')
    expect(ref.name).toBe('someFolder')
  })

  it('addReference name 지정 → 지정한 이름 사용', () => {
    const ref = registry.addReference('/ref/folderX', 'MyName')
    expect(ref.name).toBe('MyName')
  })

  // ── 중복 path 방지 (멱등성) ────────────────────────────────────────────────

  it('[멱등] 같은 path 두 번 addReference → 동일 ID 반환', () => {
    const r1 = registry.addReference('/ref/same')
    const r2 = registry.addReference('/ref/same')
    expect(r1.id).toBe(r2.id)
  })

  it('[멱등] 같은 path 중복 시 순차 카운터 증가 없음 (ref-2 미발급)', () => {
    registry.addReference('/ref/same')
    registry.addReference('/ref/same')
    const r3 = registry.addReference('/ref/other')
    // 중복을 건너뛰어 ref-2 가 되어야 함
    expect(r3.id).toBe('ref-2')
  })

  it('[멱등] 중복 path 시 기존 ReferenceFolder 레코드 반환', () => {
    const r1 = registry.addReference('/ref/same', 'first')
    const r2 = registry.addReference('/ref/same', 'second') // name 무시, 기존 반환
    expect(r2.id).toBe(r1.id)
    expect(r2.name).toBe(r1.name) // 기존 name 유지
  })

  // ── listReferences ─────────────────────────────────────────────────────────

  it('listReferences → 워크스페이스 제외, 레퍼런스만 반환', () => {
    registry.setWorkspace('/ws/proj')
    registry.addReference('/ref/folderA', 'folderA')
    registry.addReference('/ref/folderB', 'folderB')
    const list = registry.listReferences()
    expect(list.length).toBe(2)
    expect(list.every(r => r.id !== WORKSPACE_ROOT_ID)).toBe(true)
  })

  it('listReferences → 빈 경우 빈 배열', () => {
    expect(registry.listReferences()).toEqual([])
  })

  it('listReferences → 워크스페이스만 있을 때 빈 배열', () => {
    registry.setWorkspace('/ws/proj')
    expect(registry.listReferences()).toEqual([])
  })

  it('listReferences → 반환 항목의 readOnly 는 모두 true', () => {
    registry.addReference('/ref/a')
    registry.addReference('/ref/b')
    const list = registry.listReferences()
    expect(list.every(r => r.readOnly === true)).toBe(true)
  })

  it('listReferences → 반환 항목이 ReferenceFolder 구조를 가짐 (id, name, rootPath, readOnly)', () => {
    registry.addReference('/ref/folderA', 'folderA')
    const list = registry.listReferences()
    const item = list[0]
    expect(item).toHaveProperty('id')
    expect(item).toHaveProperty('name')
    expect(item).toHaveProperty('rootPath')
    expect(item).toHaveProperty('readOnly', true)
  })

  it('listReferences → rootPath 는 등록한 절대 경로', () => {
    registry.addReference('/ref/folderA', 'folderA')
    const list = registry.listReferences()
    expect(list[0].rootPath).toBe('/ref/folderA')
  })

  // ── 워크스페이스 + 레퍼런스 독립성 ───────────────────────────────────────────

  it('워크스페이스 갱신이 레퍼런스 목록에 영향 없음', () => {
    registry.addReference('/ref/folderA', 'folderA')
    registry.setWorkspace('/new/workspace')
    const list = registry.listReferences()
    expect(list.length).toBe(1)
    expect(list[0].id).toBe('ref-1')
  })
})
