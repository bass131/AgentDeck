/**
 * skills.test.ts — createSkillsStore() 단위 테스트 (P5a — Settings Skill 탭 실동작)
 *
 * TDD 순서: 이 파일을 먼저 작성(실패) → src/main/05_settings/skills.ts 구현 → 통과.
 *
 * 테스트 전략:
 *   1. mock fs(homedir/userData/readdir/readFile/writeFile 주입) — electron import 0.
 *   2. listSkills: global만·local 합산·frontmatter 파싱·name 폴백·디렉토리 없음 graceful.
 *   3. listSkills: disabled 오버레이 반영(enabled=false).
 *   4. setSkillEnabled: 추가/제거 영속(오버레이 JSON 라운드트립)·쓰기 실패 graceful.
 *   5. disabledSkillOverrides: 빈→null·항목→{name:'off'}.
 *
 * CRITICAL(신뢰경계):
 *   - fs 읽기/쓰기는 main 단독(주입 deps로 mock 대체).
 *   - SKILL.md에서 name/description만 추출 — 시크릿 0.
 *   - 오버레이는 userData — 사용자 ~/.claude/skills는 읽기만, 절대 수정 금지.
 */

import { describe, it, expect, vi } from 'vitest'

// ── 구현 파일 import (아직 없음 → 이 시점에서 테스트 실패 예상) ──────────────
import { createSkillsStore } from '../../../02.Source/main/05_settings/skills'

// ═══════════════════════════════════════════════════════════════════════════════
// 헬퍼: mock deps 팩토리
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 스킬 디렉토리 구조를 가상 파일시스템으로 표현한다.
 *
 * skillDirs[scope][dirName] = SKILL.md 내용 문자열.
 * null이면 해당 scope 디렉토리 자체가 없음(ENOENT).
 */
interface MockSkillDirs {
  global?: Record<string, string> | null  // null = 디렉토리 없음
  local?: Record<string, string> | null   // null = 디렉토리 없음
}

/**
 * mock deps 생성.
 *
 * @param opts.homedir       homedir() 반환값 (기본 '/home/user')
 * @param opts.userData      userData 경로 (기본 '/userdata')
 * @param opts.skillDirs     스킬 디렉토리 구조
 * @param opts.initialDisabled 초기 disabled 목록 (기본 [])
 * @param opts.writeFileFail true면 writeFile throw 시뮬레이션
 */
function makeMockDeps(opts: {
  homedir?: string
  userData?: string
  skillDirs?: MockSkillDirs
  initialDisabled?: string[]
  writeFileFail?: boolean
} = {}) {
  const homedir = opts.homedir ?? '/home/user'
  const userData = opts.userData ?? '/userdata'
  const skillDirs = opts.skillDirs ?? {}
  const writeFileFail = opts.writeFileFail ?? false

  // 오버레이 저장소 (skills-disabled.json)
  let disabledContent: string | null =
    opts.initialDisabled && opts.initialDisabled.length > 0
      ? JSON.stringify({ disabled: opts.initialDisabled })
      : null

  const lastWritten = { value: null as string | null }

  // homedir 함수
  const homedirFn = vi.fn(() => homedir)

  // userData 함수
  const getUserDataFn = vi.fn(() => userData)

  /** 경로를 POSIX 슬래시로 정규화 (Windows path.join이 \\ 반환하므로 비교 시 정규화 필요) */
  const normPath = (p: string): string => p.replace(/\\/g, '/')

  // readdir: 해당 scope 디렉토리의 서브디렉토리 목록 반환
  const readdirFn = vi.fn((dir: string): Array<{ name: string; isDirectory: () => boolean }> => {
    const normed = normPath(dir)
    const globalSkillsDir = normPath(`${homedir}/.claude/skills`)

    // global 스킬 디렉토리
    if (normed === globalSkillsDir) {
      if (skillDirs.global === null || skillDirs.global === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      return Object.keys(skillDirs.global).map(name => ({
        name,
        isDirectory: () => true,
      }))
    }

    // local 스킬 디렉토리 (workspaceRoot/.claude/skills) — global이 아닌 .claude/skills 경로
    if (normed.endsWith('/.claude/skills') && normed !== globalSkillsDir) {
      if (skillDirs.local === null || skillDirs.local === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      return Object.keys(skillDirs.local).map(name => ({
        name,
        isDirectory: () => true,
      }))
    }

    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  })

  // readFile: SKILL.md 내용 + 오버레이 읽기
  const readFileFn = vi.fn((filePath: string): string => {
    const normed = normPath(filePath)

    // 오버레이 파일 (skills-disabled.json)
    const overlayPath = normPath(`${userData}/skills-disabled.json`)
    if (normed === overlayPath) {
      if (disabledContent === null) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      return disabledContent
    }

    // SKILL.md 파일 경로 파싱
    const globalSkillsDir = normPath(`${homedir}/.claude/skills`)
    if (normed.startsWith(globalSkillsDir + '/')) {
      const rest = normed.slice(globalSkillsDir.length + 1)
      const parts = rest.split('/')
      if (parts.length >= 2 && parts[1] === 'SKILL.md') {
        const dirName = parts[0]
        const content = skillDirs.global?.[dirName]
        if (content !== undefined) return content
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }

    // local SKILL.md (workspaceRoot/.claude/skills/dirName/SKILL.md)
    if (normed.includes('/.claude/skills/') && normed.endsWith('/SKILL.md')) {
      const skillsIdx = normed.indexOf('/.claude/skills/')
      const afterSkills = normed.slice(skillsIdx + '/.claude/skills/'.length)
      const parts = afterSkills.split('/')
      if (parts.length >= 2 && parts[1] === 'SKILL.md') {
        const dirName = parts[0]
        const content = skillDirs.local?.[dirName]
        if (content !== undefined) return content
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }

    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  })

  // writeFile: 오버레이 저장
  const writeFileFn = vi.fn((filePath: string, content: string): void => {
    if (writeFileFail) {
      throw new Error('EPERM: write failed')
    }
    const normed = normPath(filePath)
    const overlayPath = normPath(`${userData}/skills-disabled.json`)
    if (normed === overlayPath) {
      lastWritten.value = content
      disabledContent = content
    }
  })

  // mkdirSync: no-op (graceful)
  const mkdirSyncFn = vi.fn((): void => { /* no-op */ })

  return {
    homedir: homedirFn,
    getUserData: getUserDataFn,
    readdir: readdirFn,
    readFile: readFileFn,
    writeFile: writeFileFn,
    mkdirSync: mkdirSyncFn,
    get lastWritten() { return lastWritten.value },
    get disabledContent() { return disabledContent },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 테스트
// ═══════════════════════════════════════════════════════════════════════════════

describe('createSkillsStore()', () => {

  // ── listSkills: global만 ────────────────────────────────────────────────────

  describe('listSkills() — global 스킬 스캔', () => {
    it('global 스킬 디렉토리에서 SKILL.md를 읽어 SkillInfo[]를 반환한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-skill': '---\nname: My Skill\ndescription: 멋진 스킬\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('My Skill')
      expect(result[0].description).toBe('멋진 스킬')
      expect(result[0].scope).toBe('global')
      expect(result[0].enabled).toBe(true)
    })

    it('workspaceRoot가 null이면 global 스킬만 반환한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'skill-a': '---\nname: Skill A\ndescription: A\n---\n',
          },
          local: {
            'skill-b': '---\nname: Skill B\ndescription: B\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Skill A')
    })

    it('global 스킬 디렉토리가 없으면(ENOENT) 빈 배열을 반환한다(graceful)', () => {
      const deps = makeMockDeps({
        skillDirs: { global: null },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result).toHaveLength(0)
    })

    it('global 스킬이 여러 개면 모두 반환한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'skill-z': '---\nname: Skill Z\ndescription: Z\n---\n',
            'skill-a': '---\nname: Skill A\ndescription: A\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result).toHaveLength(2)
      // 이름순 정렬 확인
      expect(result[0].name).toBe('Skill A')
      expect(result[1].name).toBe('Skill Z')
    })
  })

  // ── listSkills: local 합산 ──────────────────────────────────────────────────

  describe('listSkills() — global + local 합산', () => {
    it('workspaceRoot 있으면 global + local 스킬을 합산해서 반환한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'global-skill': '---\nname: Global Skill\ndescription: 전역\n---\n',
          },
          local: {
            'local-skill': '---\nname: Local Skill\ndescription: 로컬\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills('/workspace')
      expect(result).toHaveLength(2)
      const global = result.find(s => s.scope === 'global')
      const local = result.find(s => s.scope === 'local')
      expect(global?.name).toBe('Global Skill')
      expect(local?.name).toBe('Local Skill')
    })

    it('local 스킬 디렉토리가 없으면(ENOENT) global만 반환한다(graceful)', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'global-skill': '---\nname: Global Skill\ndescription: 전역\n---\n',
          },
          local: null,
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills('/workspace')
      expect(result).toHaveLength(1)
      expect(result[0].scope).toBe('global')
    })

    it('global과 local 모두 없으면 빈 배열을 반환한다(graceful)', () => {
      const deps = makeMockDeps({
        skillDirs: { global: null, local: null },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills('/workspace')
      expect(result).toHaveLength(0)
    })
  })

  // ── FB2 P04: 빈 디렉토리(존재하지만 서브디렉토리 0개) graceful 처리 ─────────

  describe('listSkills() — 빈 디렉토리(존재하지만 스킬 0개)', () => {
    it('global 디렉토리가 존재하지만 비어있으면 graceful하게 빈 배열을 반환한다', () => {
      const deps = makeMockDeps({
        skillDirs: { global: {} },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result).toHaveLength(0)
    })

    it('local 디렉토리가 존재하지만 비어있으면 graceful하게 빈 배열을 반환한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: { 'g-skill': '---\nname: G\ndescription: g\n---\n' },
          local: {},
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills('/workspace')
      expect(result).toHaveLength(1)
      expect(result[0].scope).toBe('global')
    })
  })

  // ── FB2 P04: 스킬은 단일 레벨 전용(2단계 중첩 미지원 — 회귀 확인) ───────────
  //
  // 진단 대비: commands.ts와 달리 skills.ts는 원래부터(discoverSkills) 서브디렉토리를
  // 1단계까지만 스캔 — 이는 Claude Code 스킬 컨벤션 자체가 네임스페이스를 지원하지
  // 않기 때문(스킬 = <skillsDir>/<name>/SKILL.md 고정 1단계, 커맨드와 다름). P04 수정은
  // commands.ts만 재귀로 확장했고 skills.ts는 의도적으로 그대로 둔다 — 이 테스트는
  // 그 경계가 유지됨을 확인하는 회귀 가드다(SKILL.md가 1단계 더 안쪽에 있으면 무시).

  describe('listSkills() — 2단계 중첩 스킬(SKILL.md가 한 단계 더 안쪽)은 무시된다(회귀 가드)', () => {
    it('서브디렉토리 안에 SKILL.md가 없는 폴더는 크래시 없이 건너뛴다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'real-skill': '---\nname: Real\ndescription: 실제 스킬\n---\n',
          },
        },
      })
      // 'category'라는 서브디렉토리는 readdir에는 있지만 category/SKILL.md는 없음
      // (2단계 더 안쪽 category/nested/SKILL.md 구조를 가정) → discoverSkills가
      // category/SKILL.md 읽기 실패 시 그냥 skip해야 한다(크래시 0).
      const originalReaddir = deps.readdir
      deps.readdir = ((dir: string) => {
        const entries = originalReaddir(dir)
        if (dir.replace(/\\/g, '/').endsWith('/.claude/skills')) {
          return [...entries, { name: 'category', isDirectory: () => true }]
        }
        return entries
      }) as typeof deps.readdir

      const store = createSkillsStore(deps)
      expect(() => store.listSkills(null)).not.toThrow()
      const result = store.listSkills(null)
      // real-skill만 반환되고 'category'(2단계 중첩)는 무시된다
      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Real')
    })
  })

  // ── listSkills: frontmatter 파싱 ────────────────────────────────────────────

  describe('listSkills() — frontmatter name/description 파싱', () => {
    it('frontmatter에 name이 있으면 해당 값을 사용한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-dir': '---\nname: Custom Name\ndescription: 설명\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].name).toBe('Custom Name')
    })

    it('frontmatter에 description이 있으면 해당 값을 사용한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-dir': '---\nname: Skill\ndescription: 상세한 설명입니다\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].description).toBe('상세한 설명입니다')
    })

    it('frontmatter에 name이 없으면 디렉토리명을 name으로 사용한다(폴백)', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-skill-dir': '---\ndescription: 설명만 있음\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].name).toBe('my-skill-dir')
    })

    it('frontmatter에 description이 없으면 빈 문자열을 사용한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-dir': '---\nname: No Desc\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].description).toBe('')
    })

    it('frontmatter가 없는 SKILL.md는 디렉토리명을 name, 빈 문자열을 description으로 사용한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'plain-skill': '# 스킬 설명\n이것은 마크다운입니다.',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].name).toBe('plain-skill')
      expect(result[0].description).toBe('')
    })

    it('frontmatter 값이 따옴표로 감싸여 있으면 따옴표를 제거한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'quoted-skill': '---\nname: "Quoted Name"\ndescription: \'Single Quoted\'\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].name).toBe('Quoted Name')
      expect(result[0].description).toBe('Single Quoted')
    })

    it('BOM이 있는 SKILL.md를 올바르게 파싱한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            // U+FEFF = BOM
            'bom-skill': '﻿---\nname: BOM Skill\ndescription: BOM 있음\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].name).toBe('BOM Skill')
    })
  })

  // ── listSkills: disabled 오버레이 반영 ───────────────────────────────────────

  describe('listSkills() — disabled 오버레이 반영', () => {
    it('disabled 오버레이에 name이 있으면 enabled=false를 반환한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-skill': '---\nname: My Skill\ndescription: 설명\n---\n',
          },
        },
        initialDisabled: ['My Skill'],
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].enabled).toBe(false)
    })

    it('disabled 오버레이에 name이 없으면 enabled=true를 반환한다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-skill': '---\nname: My Skill\ndescription: 설명\n---\n',
          },
        },
        initialDisabled: ['Other Skill'],  // My Skill은 disabled 아님
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].enabled).toBe(true)
    })

    it('오버레이 파일이 없으면(ENOENT) 모든 스킬이 enabled=true이다(graceful)', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-skill': '---\nname: My Skill\ndescription: 설명\n---\n',
          },
        },
        // initialDisabled 없음 → 오버레이 파일 없음
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].enabled).toBe(true)
    })

    it('여러 스킬 중 일부만 disabled이면 해당 스킬만 enabled=false이다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'skill-a': '---\nname: Skill A\ndescription: A\n---\n',
            'skill-b': '---\nname: Skill B\ndescription: B\n---\n',
            'skill-c': '---\nname: Skill C\ndescription: C\n---\n',
          },
        },
        initialDisabled: ['Skill B'],
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      const a = result.find(s => s.name === 'Skill A')
      const b = result.find(s => s.name === 'Skill B')
      const c = result.find(s => s.name === 'Skill C')
      expect(a?.enabled).toBe(true)
      expect(b?.enabled).toBe(false)
      expect(c?.enabled).toBe(true)
    })
  })

  // ── listSkills: 이름 정렬 ────────────────────────────────────────────────────

  describe('listSkills() — global→local 순, 이름 정렬', () => {
    it('결과는 이름 알파벳순으로 정렬된다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'z-skill': '---\nname: Zebra\ndescription: Z\n---\n',
            'a-skill': '---\nname: Apple\ndescription: A\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills(null)
      expect(result[0].name).toBe('Apple')
      expect(result[1].name).toBe('Zebra')
    })

    it('global과 local이 모두 있으면 이름순으로 정렬된다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'z-global': '---\nname: Zebra\ndescription: Z\n---\n',
          },
          local: {
            'a-local': '---\nname: Apple\ndescription: A\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)
      const result = store.listSkills('/workspace')
      expect(result[0].name).toBe('Apple')
      expect(result[0].scope).toBe('local')
      expect(result[1].name).toBe('Zebra')
      expect(result[1].scope).toBe('global')
    })
  })

  // ── setSkillEnabled: 추가/제거 영속 ──────────────────────────────────────────

  describe('setSkillEnabled() — 오버레이 라운드트립', () => {
    it('enabled=false로 설정하면 오버레이에 name을 추가한다', () => {
      const deps = makeMockDeps()
      const store = createSkillsStore(deps)
      const ok = store.setSkillEnabled('My Skill', false)
      expect(ok).toBe(true)
      // writeFile이 호출됐는지 확인
      expect(deps.lastWritten).not.toBeNull()
      const written = JSON.parse(deps.lastWritten!)
      expect(written.disabled).toContain('My Skill')
    })

    it('enabled=true로 설정하면 오버레이에서 name을 제거한다', () => {
      const deps = makeMockDeps({
        initialDisabled: ['My Skill'],
      })
      const store = createSkillsStore(deps)
      const ok = store.setSkillEnabled('My Skill', true)
      expect(ok).toBe(true)
      const written = JSON.parse(deps.lastWritten!)
      expect(written.disabled).not.toContain('My Skill')
    })

    it('이미 disabled인 스킬에 false를 다시 설정해도 중복 없이 저장된다', () => {
      const deps = makeMockDeps({
        initialDisabled: ['My Skill'],
      })
      const store = createSkillsStore(deps)
      store.setSkillEnabled('My Skill', false)
      const written = JSON.parse(deps.lastWritten!)
      const count = written.disabled.filter((n: string) => n === 'My Skill').length
      expect(count).toBe(1)
    })

    it('enabled=false 후 listSkills를 호출하면 해당 스킬이 enabled=false로 나온다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-skill': '---\nname: My Skill\ndescription: 설명\n---\n',
          },
        },
      })
      const store = createSkillsStore(deps)

      // 비활성화
      store.setSkillEnabled('My Skill', false)

      // listSkills 재조회 — 오버레이 반영
      const result = store.listSkills(null)
      expect(result[0].enabled).toBe(false)
    })

    it('enabled=true 후 listSkills를 호출하면 해당 스킬이 enabled=true로 나온다', () => {
      const deps = makeMockDeps({
        skillDirs: {
          global: {
            'my-skill': '---\nname: My Skill\ndescription: 설명\n---\n',
          },
        },
        initialDisabled: ['My Skill'],
      })
      const store = createSkillsStore(deps)

      // 활성화
      store.setSkillEnabled('My Skill', true)

      // listSkills 재조회
      const result = store.listSkills(null)
      expect(result[0].enabled).toBe(true)
    })

    it('쓰기 실패 시 graceful false를 반환한다(크래시 없음)', () => {
      const deps = makeMockDeps({ writeFileFail: true })
      const store = createSkillsStore(deps)
      const ok = store.setSkillEnabled('My Skill', false)
      expect(ok).toBe(false)
    })

    it('여러 스킬을 순차적으로 disable/enable해도 올바르게 라운드트립된다', () => {
      const deps = makeMockDeps()
      const store = createSkillsStore(deps)

      store.setSkillEnabled('Skill A', false)
      store.setSkillEnabled('Skill B', false)
      store.setSkillEnabled('Skill A', true)

      const written = JSON.parse(deps.lastWritten!)
      expect(written.disabled).not.toContain('Skill A')
      expect(written.disabled).toContain('Skill B')
    })
  })

  // ── disabledSkillOverrides ──────────────────────────────────────────────────

  describe('disabledSkillOverrides() — SDK skillOverrides 맵', () => {
    it('오버레이 파일이 없으면(ENOENT) null을 반환한다', () => {
      const deps = makeMockDeps()  // initialDisabled 없음
      const store = createSkillsStore(deps)
      const result = store.disabledSkillOverrides()
      expect(result).toBeNull()
    })

    it('disabled 목록이 비어있으면 null을 반환한다', () => {
      const deps = makeMockDeps({ initialDisabled: [] })
      const store = createSkillsStore(deps)
      const result = store.disabledSkillOverrides()
      expect(result).toBeNull()
    })

    it('disabled 항목이 있으면 {name: "off"} 맵을 반환한다', () => {
      const deps = makeMockDeps({ initialDisabled: ['Skill A', 'Skill B'] })
      const store = createSkillsStore(deps)
      const result = store.disabledSkillOverrides()
      expect(result).not.toBeNull()
      expect(result!['Skill A']).toBe('off')
      expect(result!['Skill B']).toBe('off')
    })

    it('단일 disabled 항목도 올바르게 {name: "off"}로 반환한다', () => {
      const deps = makeMockDeps({ initialDisabled: ['My Skill'] })
      const store = createSkillsStore(deps)
      const result = store.disabledSkillOverrides()
      expect(result).toEqual({ 'My Skill': 'off' })
    })

    it('setSkillEnabled(false) 후 disabledSkillOverrides에 반영된다', () => {
      const deps = makeMockDeps()
      const store = createSkillsStore(deps)

      store.setSkillEnabled('New Skill', false)
      const result = store.disabledSkillOverrides()
      expect(result).not.toBeNull()
      expect(result!['New Skill']).toBe('off')
    })

    it('setSkillEnabled(true) 후 disabled가 비면 null을 반환한다', () => {
      const deps = makeMockDeps({ initialDisabled: ['My Skill'] })
      const store = createSkillsStore(deps)

      store.setSkillEnabled('My Skill', true)
      const result = store.disabledSkillOverrides()
      expect(result).toBeNull()
    })
  })

  // ── 신뢰경계: name 입력 검증 ─────────────────────────────────────────────────

  describe('신뢰경계: setSkillEnabled() 입력 검증', () => {
    it('name이 빈 문자열이면 false를 반환한다', () => {
      const deps = makeMockDeps()
      const store = createSkillsStore(deps)
      const ok = store.setSkillEnabled('', false)
      expect(ok).toBe(false)
    })

    it('name이 빈 문자열이면 writeFile을 호출하지 않는다', () => {
      const deps = makeMockDeps()
      const store = createSkillsStore(deps)
      store.setSkillEnabled('', false)
      expect(deps.writeFile).not.toHaveBeenCalled()
    })
  })
})
