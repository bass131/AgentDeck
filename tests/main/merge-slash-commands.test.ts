/**
 * merge-slash-commands.test.ts — mergeSlashCommands() 단위 테스트 (ADR-019)
 *
 * TDD 순서: 이 파일을 먼저 작성(실패) → src/main/settings/merge-slash-commands.ts 구현 → 통과.
 *
 * 테스트 전략:
 *   1. store=[ask,clear,myproj], captured=[clear,config,context] → ask·clear(store 유지)·config·context 추가·myproj
 *   2. captured에 store와 같은 name → store 항목 description/scope 유지(captured description 무시)
 *   3. captured=[] → store 그대로
 *   4. store=[] → captured만(scope='builtin')
 *   5. 양쪽 빈 배열 → []
 *   6. 정렬: builtin→project→user, 그룹 내 알파벳
 *   7. 중복 name: store가 있으면 captured의 동명 항목은 추가되지 않는다
 *
 * CRITICAL(신뢰경계): mergeSlashCommands는 pure 헬퍼 — IO 없음, electron 0.
 *   name/description/argHint/scope 4필드만. 시크릿 0.
 */

import { describe, it, expect } from 'vitest'
import { mergeSlashCommands } from '../../src/main/settings/merge-slash-commands'
import type { SlashCommandInfo } from '../../src/shared/ipc-contract'

// ── 헬퍼: 테스트용 SlashCommandInfo 팩토리 ────────────────────────────────────

function cmd(
  name: string,
  scope: SlashCommandInfo['scope'],
  description = `${name} desc`,
  argHint?: string
): SlashCommandInfo {
  const base: SlashCommandInfo = { name, description, scope }
  if (argHint !== undefined) base.argHint = argHint
  return base
}

// ══════════════════════════════════════════════════════════════════════════════
// 테스트
// ══════════════════════════════════════════════════════════════════════════════

describe('mergeSlashCommands()', () => {

  // ── 기본 머지 동작 ──────────────────────────────────────────────────────────

  describe('기본 머지 — store ∪ captured(store에 없는 name만 추가)', () => {
    it('store=[ask,clear,myproj], captured=[clear,config,context] → ask·clear·config·context·myproj 반환', () => {
      const store: SlashCommandInfo[] = [
        cmd('ask', 'builtin'),
        cmd('clear', 'builtin'),
        cmd('myproj', 'project'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('clear', 'builtin', 'captured clear desc'),
        cmd('config', 'builtin', 'configure settings'),
        cmd('context', 'builtin', 'context management'),
      ]
      const result = mergeSlashCommands(store, captured)
      const names = result.map(c => c.name)

      // 5개 항목: ask + clear + myproj + config + context
      expect(names).toContain('ask')
      expect(names).toContain('clear')
      expect(names).toContain('myproj')
      expect(names).toContain('config')
      expect(names).toContain('context')
      expect(result).toHaveLength(5)
    })

    it('clear는 중복 없이 1개만 존재한다', () => {
      const store: SlashCommandInfo[] = [
        cmd('ask', 'builtin'),
        cmd('clear', 'builtin'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('clear', 'builtin', 'captured clear'),
      ]
      const result = mergeSlashCommands(store, captured)
      const clears = result.filter(c => c.name === 'clear')
      expect(clears).toHaveLength(1)
    })

    it('captured에만 있는 config·context는 scope="builtin"으로 추가된다', () => {
      const store: SlashCommandInfo[] = [
        cmd('ask', 'builtin'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('config', 'builtin', 'configure'),
        cmd('context', 'builtin', 'context mgmt'),
      ]
      const result = mergeSlashCommands(store, captured)
      const config = result.find(c => c.name === 'config')
      const context = result.find(c => c.name === 'context')
      expect(config?.scope).toBe('builtin')
      expect(context?.scope).toBe('builtin')
    })
  })

  // ── store 우선(dedup) ──────────────────────────────────────────────────────

  describe('store 우선 — captured의 동명 항목은 description/scope 무시', () => {
    it('store에 있는 clear의 description은 captured description으로 덮이지 않는다', () => {
      const store: SlashCommandInfo[] = [
        cmd('clear', 'builtin', 'store clear description'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('clear', 'builtin', 'captured clear description (무시됨)'),
      ]
      const result = mergeSlashCommands(store, captured)
      const clearItem = result.find(c => c.name === 'clear')
      expect(clearItem?.description).toBe('store clear description')
    })

    it('store에 있는 항목의 scope는 captured scope로 덮이지 않는다', () => {
      // store에 project scope clear가 있다면(드문 경우), captured builtin으로 변경되면 안 됨
      const store: SlashCommandInfo[] = [
        cmd('myproj', 'project', 'project command'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('myproj', 'builtin', 'captured as builtin (무시됨)'),
      ]
      const result = mergeSlashCommands(store, captured)
      const item = result.find(c => c.name === 'myproj')
      expect(item?.scope).toBe('project')
    })

    it('store에 있는 항목의 argHint는 captured argHint로 덮이지 않는다', () => {
      const store: SlashCommandInfo[] = [
        cmd('compact', 'builtin', 'compact desc', '[summary]'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('compact', 'builtin', 'captured desc', '[other hint]'),
      ]
      const result = mergeSlashCommands(store, captured)
      const item = result.find(c => c.name === 'compact')
      expect(item?.argHint).toBe('[summary]')
    })
  })

  // ── captured=[] graceful ──────────────────────────────────────────────────

  describe('captured=[] → store 그대로', () => {
    it('captured가 빈 배열이면 store 항목만 반환된다', () => {
      const store: SlashCommandInfo[] = [
        cmd('ask', 'builtin'),
        cmd('clear', 'builtin'),
        cmd('myproj', 'project'),
      ]
      const result = mergeSlashCommands(store, [])
      expect(result).toHaveLength(3)
      expect(result.map(c => c.name).sort()).toEqual(['ask', 'clear', 'myproj'].sort())
    })
  })

  // ── store=[] graceful ──────────────────────────────────────────────────────

  describe('store=[] → captured만 반환(헬퍼 계약)', () => {
    it('store가 빈 배열이면 captured의 모든 항목이 반환된다', () => {
      const captured: SlashCommandInfo[] = [
        cmd('config', 'builtin'),
        cmd('context', 'builtin'),
      ]
      const result = mergeSlashCommands([], captured)
      expect(result).toHaveLength(2)
    })

    it('양쪽 모두 빈 배열이면 빈 배열을 반환한다', () => {
      expect(mergeSlashCommands([], [])).toEqual([])
    })
  })

  // ── 정렬 ──────────────────────────────────────────────────────────────────

  describe('정렬 — builtin→project→user, 그룹 내 알파벳', () => {
    it('builtin → project → user 순서로 정렬된다', () => {
      const store: SlashCommandInfo[] = [
        cmd('zuser', 'user'),
        cmd('aproject', 'project'),
        cmd('ask', 'builtin'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('config', 'builtin'),
      ]
      const result = mergeSlashCommands(store, captured)
      const scopes = result.map(c => c.scope)
      const firstBuiltin = scopes.indexOf('builtin')
      const firstProject = scopes.indexOf('project')
      const firstUser = scopes.indexOf('user')
      expect(firstBuiltin).toBeLessThan(firstProject)
      expect(firstProject).toBeLessThan(firstUser)
    })

    it('builtin 그룹 내에서는 name 알파벳순으로 정렬된다', () => {
      const store: SlashCommandInfo[] = [
        cmd('security-review', 'builtin'),
        cmd('ask', 'builtin'),
        cmd('clear', 'builtin'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('compact', 'builtin'),
        cmd('config', 'builtin'),
      ]
      const result = mergeSlashCommands(store, captured)
      const builtins = result.filter(c => c.scope === 'builtin').map(c => c.name)
      const sorted = [...builtins].sort((a, b) => a.localeCompare(b))
      expect(builtins).toEqual(sorted)
    })

    it('project 그룹 내에서는 name 알파벳순으로 정렬된다', () => {
      const store: SlashCommandInfo[] = [
        cmd('z-build', 'project'),
        cmd('a-lint', 'project'),
      ]
      const result = mergeSlashCommands(store, [])
      const projects = result.filter(c => c.scope === 'project').map(c => c.name)
      expect(projects).toEqual(['a-lint', 'z-build'])
    })

    it('user 그룹 내에서는 name 알파벳순으로 정렬된다', () => {
      const store: SlashCommandInfo[] = [
        cmd('zebra', 'user'),
        cmd('alpha', 'user'),
        cmd('mango', 'user'),
      ]
      const result = mergeSlashCommands(store, [])
      const users = result.filter(c => c.scope === 'user').map(c => c.name)
      expect(users).toEqual(['alpha', 'mango', 'zebra'])
    })

    it('완전한 정렬: builtin(알파) → project(알파) → user(알파)', () => {
      const store: SlashCommandInfo[] = [
        cmd('ask', 'builtin'),
        cmd('clear', 'builtin'),
        cmd('myproj', 'project'),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('clear', 'builtin', 'captured'),
        cmd('config', 'builtin'),
        cmd('context', 'builtin'),
      ]
      const result = mergeSlashCommands(store, captured)
      const names = result.map(c => c.name)
      // builtin: ask, clear, config, context(알파순) → project: myproj
      expect(names).toEqual(['ask', 'clear', 'config', 'context', 'myproj'])
    })
  })

  // ── 신뢰경계: 반환값 4필드만 ──────────────────────────────────────────────

  describe('신뢰경계 — 반환값은 name/description/argHint/scope 4필드만', () => {
    it('반환 항목에 허용된 필드 외 추가 필드가 없다', () => {
      const store: SlashCommandInfo[] = [cmd('ask', 'builtin', 'Ask a question', '[question]')]
      const result = mergeSlashCommands(store, [])
      const item = result[0]
      const allowedKeys = new Set(['name', 'description', 'argHint', 'scope'])
      for (const key of Object.keys(item)) {
        expect(allowedKeys.has(key)).toBe(true)
      }
    })

    it('captured 항목에 argHint가 있으면 추가 시 보존된다', () => {
      const store: SlashCommandInfo[] = [cmd('ask', 'builtin')]
      const captured: SlashCommandInfo[] = [cmd('loop', 'builtin', 'loop desc', '[n]')]
      const result = mergeSlashCommands(store, captured)
      const loop = result.find(c => c.name === 'loop')
      expect(loop?.argHint).toBe('[n]')
    })

    it('captured 항목에 argHint가 없으면 추가된 항목에 argHint가 undefined이다', () => {
      const store: SlashCommandInfo[] = [cmd('ask', 'builtin')]
      const captured: SlashCommandInfo[] = [{ name: 'context', description: 'ctx', scope: 'builtin' }]
      const result = mergeSlashCommands(store, captured)
      const ctx = result.find(c => c.name === 'context')
      expect(ctx?.argHint).toBeUndefined()
    })
  })

  // ── store 큐레이션 보존 시나리오 ──────────────────────────────────────────

  describe('store 큐레이션 보존 — 클라 인터셉트(ask·clear)는 항상 store 항목 유지', () => {
    it('ask가 store에 있으면 captured에 ask가 있어도 store의 ask가 보존된다', () => {
      const store: SlashCommandInfo[] = [
        cmd('ask', 'builtin', '한국어 설명 ask', undefined),
      ]
      const captured: SlashCommandInfo[] = [
        cmd('ask', 'builtin', 'English ask description from SDK'),
      ]
      const result = mergeSlashCommands(store, captured)
      const asks = result.filter(c => c.name === 'ask')
      expect(asks).toHaveLength(1)
      expect(asks[0].description).toBe('한국어 설명 ask')
    })
  })
})
