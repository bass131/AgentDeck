/**
 * commands.test.ts — createCommandsStore() 단위 테스트 (P10 — 슬래시 커맨드 자동완성)
 *
 * TDD 순서: 이 파일을 먼저 작성(실패) → src/main/05_settings/commands.ts 구현 → 통과.
 *
 * 테스트 전략:
 *   1. mock fs(homedir/readdir/readFile 주입, 중첩 디렉토리 지원 가상 트리) — electron import 0.
 *   2. listSlashCommands: 빌트인 항상 반환(9개·scope='builtin').
 *   3. listSlashCommands: user .md 스캔 → name(파일명)·description/argHint(frontmatter)·scope='user'.
 *   4. listSlashCommands: project .md 스캔 → scope='project' (workspaceRoot 있을 때만).
 *   5. listSlashCommands: frontmatter 없는 .md → description 빈 문자열 graceful.
 *   6. 신뢰경계: .md 본문에 시크릿 포함 → 출력에 본문/시크릿 미포함.
 *   7. 디렉토리 없음/빈 디렉토리 graceful(빌트인만).
 *   8. 정렬: builtin → project → user 순, 각 그룹 내 name 알파벳순.
 *   9. FB2 P04: 중첩 서브디렉토리 재귀 스캔 → ':' 네임스페이스 name(예: 'session/end.md' → 'session:end').
 *      (진단: commands.ts가 하위 디렉토리를 skip하던 flat-scan 버그 — AgentDeck 자체
 *      .claude/commands/session/*.md가 실사례.)
 *
 * CRITICAL(신뢰경계):
 *   - fs 읽기는 main 단독(주입 deps로 mock 대체).
 *   - .md에서 name(파일명 기반, 네임스페이스 포함)/description/argHint(frontmatter)만 추출 —
 *     본문·시크릿 0. 네임스페이스는 실제 하위 디렉토리 엔트리명에서만 파생(경로 구분자
 *     '/'\\'는 name에 절대 미포함 — ':' 구분자만 사용).
 *   - ~/.claude/commands·<ws>/.claude/commands는 읽기만, 절대 수정 금지.
 */

import { describe, it, expect, vi } from 'vitest'

// ── 구현 파일 import (아직 없음 → 이 시점에서 테스트 실패 예상) ──────────────
import { createCommandsStore } from '../../../02.Source/main/05_settings/commands'

// ══════════════════════════════════════════════════════════════════════════════
// 헬퍼: mock deps 팩토리
// ══════════════════════════════════════════════════════════════════════════════

/**
 * commands 디렉토리 구조를 가상 파일시스템으로 표현한다.
 *
 * commandFiles[scope][relPath] = .md 파일 내용 문자열.
 * relPath에 '/'가 포함되면 중첩 서브디렉토리로 취급한다(예: 'session/end.md').
 * null이면 해당 scope 디렉토리 자체가 없음(ENOENT). {}이면 디렉토리는 있으나 빈 폴더.
 */
interface MockCommandDirs {
  user?: Record<string, string> | null   // null = 디렉토리 없음
  project?: Record<string, string> | null // null = 디렉토리 없음
}

/** 가상 파일시스템 트리 노드 — 파일(leaf) 또는 디렉토리(children map). */
type MockFsNode =
  | { type: 'file'; content: string }
  | { type: 'dir'; children: Map<string, MockFsNode> }

/** relPath(예: 'session/end.md') 맵으로부터 중첩 트리를 구성한다. */
function buildMockTree(paths: Record<string, string>): MockFsNode {
  const root: MockFsNode = { type: 'dir', children: new Map() }
  for (const [relPath, content] of Object.entries(paths)) {
    const parts = relPath.split('/').filter(Boolean)
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]
      let child = node.children.get(part)
      if (!child || child.type !== 'dir') {
        child = { type: 'dir', children: new Map() }
        node.children.set(part, child)
      }
      node = child
    }
    node.children.set(parts[parts.length - 1], { type: 'file', content })
  }
  return root
}

/** root 트리에서 rel(슬래시 구분 상대경로)이 가리키는 노드를 찾는다. 없으면 null. */
function navigateMockDir(root: MockFsNode, rel: string): MockFsNode | null {
  if (rel === '') return root
  let node: MockFsNode = root
  for (const part of rel.split('/').filter(Boolean)) {
    if (node.type !== 'dir') return null
    const child = node.children.get(part)
    if (!child) return null
    node = child
  }
  return node
}

/**
 * mock deps 생성.
 *
 * @param opts.homedir       homedir() 반환값 (기본 '/home/user')
 * @param opts.commandDirs   commands 디렉토리 구조 (중첩 서브디렉토리 지원)
 */
function makeMockDeps(opts: {
  homedir?: string
  commandDirs?: MockCommandDirs
} = {}) {
  const homedir = opts.homedir ?? '/home/user'
  const commandDirs = opts.commandDirs ?? {}

  const homedirFn = vi.fn(() => homedir)

  /** 경로를 POSIX 슬래시로 정규화 (Windows path.join이 \\ 반환하므로 비교 시 정규화 필요) */
  const normPath = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')

  const userBase = normPath(`${homedir}/.claude/commands`)
  const userTree = commandDirs.user !== null && commandDirs.user !== undefined
    ? buildMockTree(commandDirs.user)
    : null
  const projectTree = commandDirs.project !== null && commandDirs.project !== undefined
    ? buildMockTree(commandDirs.project)
    : null

  /** dir(절대경로)이 user/project base 중 어디에 속하는지 판정 후 해당 노드를 반환한다. */
  function resolveNode(dir: string): MockFsNode | null {
    const normed = normPath(dir)

    if (normed === userBase || normed.startsWith(userBase + '/')) {
      if (userTree === null) return null
      const rel = normed === userBase ? '' : normed.slice(userBase.length + 1)
      return navigateMockDir(userTree, rel)
    }

    const marker = '/.claude/commands'
    const idx = normed.indexOf(marker)
    if (idx !== -1) {
      const base = normed.slice(0, idx + marker.length)
      if (base !== userBase) {
        if (projectTree === null) return null
        const rel = normed === base ? '' : normed.slice(base.length + 1)
        return navigateMockDir(projectTree, rel)
      }
    }

    return null
  }

  // readdir: dir 하위 엔트리(파일/서브디렉토리) 목록 반환 — 중첩 지원
  const readdirFn = vi.fn((dir: string): Array<{ name: string; isDirectory: () => boolean }> => {
    const node = resolveNode(dir)
    if (node === null || node.type !== 'dir') {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
    return Array.from(node.children.entries()).map(([name, child]) => ({
      name,
      isDirectory: () => child.type === 'dir',
    }))
  })

  // readFile: .md 파일 내용 읽기 — 중첩 경로 지원
  const readFileFn = vi.fn((filePath: string): string => {
    const normed = normPath(filePath)
    const slashIdx = normed.lastIndexOf('/')
    const parentDir = normed.slice(0, slashIdx)
    const fileName = normed.slice(slashIdx + 1)
    const parentNode = resolveNode(parentDir)
    if (parentNode === null || parentNode.type !== 'dir') {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
    const child = parentNode.children.get(fileName)
    if (!child || child.type !== 'file') {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }
    return child.content
  })

  return {
    homedir: homedirFn,
    readdir: readdirFn,
    readFile: readFileFn,
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// 테스트
// ══════════════════════════════════════════════════════════════════════════════

describe('createCommandsStore()', () => {

  // ── 빌트인 커맨드 항상 반환 ────────────────────────────────────────────────

  describe('listSlashCommands() — 빌트인 커맨드', () => {
    it('빌트인 커맨드 9개(작동 보증)를 항상 반환한다(scope="builtin")', () => {
      const deps = makeMockDeps()
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const builtins = result.filter(c => c.scope === 'builtin')
      expect(builtins).toHaveLength(9)
    })

    it('커스텀 디렉토리가 없어도(ENOENT) 빌트인은 항상 반환된다', () => {
      const deps = makeMockDeps({
        commandDirs: { user: null, project: null },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const builtins = result.filter(c => c.scope === 'builtin')
      expect(builtins).toHaveLength(9)
    })

    it('빌트인 커맨드는 scope가 "builtin"이다', () => {
      const deps = makeMockDeps()
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const builtins = result.filter(c => c.scope === 'builtin')
      for (const b of builtins) {
        expect(b.scope).toBe('builtin')
      }
    })

    it('빌트인 커맨드는 "ask"를 포함한다', () => {
      const deps = makeMockDeps()
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const ask = result.find(c => c.name === 'ask')
      expect(ask).toBeDefined()
      expect(ask?.scope).toBe('builtin')
    })

    it('빌트인 커맨드 name 목록 = 작동 보증 9개(clear·ask 인터셉트 + compact·init·review·security-review 엔진 + loop·schedule·goal REPL 내장)', () => {
      const deps = makeMockDeps()
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const names = result.filter(c => c.scope === 'builtin').map(c => c.name)
      const required = ['ask', 'init', 'clear', 'compact', 'review', 'security-review', 'loop', 'schedule', 'goal']
      for (const r of required) {
        expect(names).toContain(r)
      }
    })

    // 거짓 광고 제거(Iteration 3 / Opus 평가): raw 전송돼도 엔진 supportedCommands에
    // 없고 인터셉트도 없어 실제로 안 도는 커맨드는 팔레트에서 제외한다.
    it('작동하지 않는 커맨드(cost/help/model/agents/mcp/memory)는 빌트인에 없다', () => {
      const deps = makeMockDeps()
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const names = result.filter(c => c.scope === 'builtin').map(c => c.name)
      for (const dead of ['cost', 'help', 'model', 'agents', 'mcp', 'memory']) {
        expect(names).not.toContain(dead)
      }
    })

    it('빌트인 커맨드에는 description이 있다(빈 문자열 아님)', () => {
      const deps = makeMockDeps()
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const builtins = result.filter(c => c.scope === 'builtin')
      for (const b of builtins) {
        expect(typeof b.description).toBe('string')
        expect(b.description.length).toBeGreaterThan(0)
      }
    })
  })

  // ── user .md 스캔 ──────────────────────────────────────────────────────────

  describe('listSlashCommands() — user 커스텀 커맨드 스캔', () => {
    it('~/.claude/commands/*.md를 스캔하여 scope="user" 커맨드를 반환한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'deploy.md': '---\ndescription: 배포 자동화\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.filter(c => c.scope === 'user')
      expect(user).toHaveLength(1)
      expect(user[0].name).toBe('deploy')
      expect(user[0].description).toBe('배포 자동화')
      expect(user[0].scope).toBe('user')
    })

    it('파일명에서 .md를 제거하여 name으로 사용한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'my-custom-cmd.md': '---\ndescription: 커스텀\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.find(c => c.scope === 'user')
      expect(user?.name).toBe('my-custom-cmd')
    })

    it('frontmatter에 argument-hint가 있으면 argHint로 추출한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'deploy.md': '---\ndescription: 배포\nargument-hint: [env]\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.find(c => c.scope === 'user')
      expect(user?.argHint).toBe('[env]')
    })

    it('frontmatter에 argument-hint가 없으면 argHint가 undefined이다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'deploy.md': '---\ndescription: 배포\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.find(c => c.scope === 'user')
      expect(user?.argHint).toBeUndefined()
    })

    it('frontmatter가 없는 .md도 graceful하게 처리한다(description 빈 문자열)', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'no-fm.md': '# 그냥 마크다운\n본문 내용입니다.',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.find(c => c.scope === 'user')
      expect(user).toBeDefined()
      expect(user?.name).toBe('no-fm')
      expect(user?.description).toBe('')
    })

    it('user 디렉토리가 없으면(ENOENT) graceful하게 처리한다(빌트인만 반환)', () => {
      const deps = makeMockDeps({
        commandDirs: { user: null },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.filter(c => c.scope === 'user')
      expect(user).toHaveLength(0)
      // 빌트인은 여전히 반환
      expect(result.filter(c => c.scope === 'builtin').length).toBeGreaterThan(0)
    })

    it('user 디렉토리에 여러 .md 파일이 있으면 모두 반환한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'deploy.md': '---\ndescription: 배포\n---\n',
            'test-run.md': '---\ndescription: 테스트 실행\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.filter(c => c.scope === 'user')
      expect(user).toHaveLength(2)
    })
  })

  // ── project .md 스캔 ───────────────────────────────────────────────────────

  describe('listSlashCommands() — project 커스텀 커맨드 스캔', () => {
    it('<workspaceRoot>/.claude/commands/*.md를 스캔하여 scope="project" 커맨드를 반환한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          project: {
            'release.md': '---\ndescription: 릴리스 빌드\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace/myproject')
      const project = result.filter(c => c.scope === 'project')
      expect(project).toHaveLength(1)
      expect(project[0].name).toBe('release')
      expect(project[0].description).toBe('릴리스 빌드')
      expect(project[0].scope).toBe('project')
    })

    it('workspaceRoot가 null이면 project 커맨드를 스캔하지 않는다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          project: {
            'release.md': '---\ndescription: 릴리스\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const project = result.filter(c => c.scope === 'project')
      expect(project).toHaveLength(0)
    })

    it('project 디렉토리가 없으면(ENOENT) graceful하게 처리한다', () => {
      const deps = makeMockDeps({
        commandDirs: { project: null },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      const project = result.filter(c => c.scope === 'project')
      expect(project).toHaveLength(0)
    })

    it('project 커맨드의 frontmatter argument-hint를 argHint로 추출한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          project: {
            'build.md': '---\ndescription: 빌드\nargument-hint: [target] [config]\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      const project = result.find(c => c.scope === 'project')
      expect(project?.argHint).toBe('[target] [config]')
    })
  })

  // ── 정렬 ───────────────────────────────────────────────────────────────────

  describe('listSlashCommands() — 정렬 순서', () => {
    it('builtin → project → user 순서로 정렬된다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'zuser.md': '---\ndescription: user cmd\n---\n',
          },
          project: {
            'aproject.md': '---\ndescription: project cmd\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')

      const scopes = result.map(c => c.scope)
      // builtin이 먼저 나와야 함
      const firstBuiltinIdx = scopes.indexOf('builtin')
      const firstProjectIdx = scopes.indexOf('project')
      const firstUserIdx = scopes.indexOf('user')

      expect(firstBuiltinIdx).toBeLessThan(firstProjectIdx)
      expect(firstProjectIdx).toBeLessThan(firstUserIdx)
    })

    it('같은 그룹(builtin) 내에서는 name 알파벳순으로 정렬된다', () => {
      const deps = makeMockDeps()
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const builtins = result.filter(c => c.scope === 'builtin')
      const names = builtins.map(c => c.name)
      const sorted = [...names].sort((a, b) => a.localeCompare(b))
      expect(names).toEqual(sorted)
    })

    it('user 그룹 내에서는 name 알파벳순으로 정렬된다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'zebra.md': '---\ndescription: Z\n---\n',
            'alpha.md': '---\ndescription: A\n---\n',
            'mango.md': '---\ndescription: M\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.filter(c => c.scope === 'user')
      const names = user.map(c => c.name)
      expect(names).toEqual(['alpha', 'mango', 'zebra'])
    })

    it('project 그룹 내에서는 name 알파벳순으로 정렬된다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          project: {
            'z-build.md': '---\ndescription: Z\n---\n',
            'a-lint.md': '---\ndescription: A\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      const project = result.filter(c => c.scope === 'project')
      const names = project.map(c => c.name)
      expect(names).toEqual(['a-lint', 'z-build'])
    })
  })

  // ── 신뢰경계: 본문/시크릿 미포함 ─────────────────────────────────────────────

  describe('신뢰경계: .md 본문·시크릿 미노출', () => {
    it('.md 본문에 allowed-tools가 있어도 SlashCommandInfo에 포함하지 않는다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'secret-cmd.md': [
              '---',
              'description: 비밀 커맨드',
              'argument-hint: [arg]',
              '---',
              '',
              '이것은 본문입니다.',
              'allowed-tools: Bash, Read, Write',
              '```bash',
              'echo "SECRET_TOKEN=abc123"',
              '```',
            ].join('\n'),
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const cmd = result.find(c => c.name === 'secret-cmd')
      expect(cmd).toBeDefined()

      // SlashCommandInfo에는 4개 필드만 존재
      expect(Object.keys(cmd!)).toEqual(
        expect.arrayContaining(['name', 'description', 'scope'])
      )

      // 본문 내용이 description에 포함되지 않아야 함
      expect(cmd?.description).toBe('비밀 커맨드')
      expect(cmd?.description).not.toContain('allowed-tools')
      expect(cmd?.description).not.toContain('SECRET_TOKEN')
      expect(cmd?.description).not.toContain('abc123')
      expect(cmd?.description).not.toContain('Bash')
    })

    it('.md 본문에 API 토큰이 있어도 SlashCommandInfo에 포함하지 않는다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          project: {
            'deploy.md': [
              '---',
              'description: 배포 스크립트',
              '---',
              '',
              '이 커맨드는 다음 환경변수를 사용합니다:',
              'ANTHROPIC_API_KEY=sk-ant-api03-xxxxx',
              'OPENAI_API_KEY=sk-proj-xxxxx',
            ].join('\n'),
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      const cmd = result.find(c => c.name === 'deploy')
      expect(cmd).toBeDefined()
      expect(cmd?.description).toBe('배포 스크립트')
      expect(cmd?.description).not.toContain('sk-ant-api03')
      expect(cmd?.description).not.toContain('sk-proj')
      expect(cmd?.description).not.toContain('ANTHROPIC_API_KEY')
    })

    it('.md에 없는 속성(scope 외 추가 필드)이 SlashCommandInfo에 누출되지 않는다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'test.md': '---\ndescription: 테스트\n---\n본문',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const cmd = result.find(c => c.name === 'test')
      expect(cmd).toBeDefined()

      // 허용된 필드 외 다른 필드 없음
      const allowedKeys = new Set(['name', 'description', 'argHint', 'scope'])
      for (const key of Object.keys(cmd!)) {
        expect(allowedKeys.has(key)).toBe(true)
      }
    })

    it('.md 파일 경로가 SlashCommandInfo에 포함되지 않는다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'my-cmd.md': '---\ndescription: 내 커맨드\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const cmd = result.find(c => c.name === 'my-cmd')
      expect(cmd).toBeDefined()

      // name은 경로 아님, 경로 구분자 없음
      expect(cmd?.name).not.toContain('/')
      expect(cmd?.name).not.toContain('\\')
      expect(cmd?.name).not.toContain('.md')

      // homedir 경로 미노출
      const stringified = JSON.stringify(cmd)
      expect(stringified).not.toContain('/home/user')
      expect(stringified).not.toContain('.claude/commands')
    })
  })

  // ── .md 파일 필터링 ────────────────────────────────────────────────────────

  describe('listSlashCommands() — .md 파일만 처리', () => {
    it('.md 확장자가 아닌 파일은 무시한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'deploy.md': '---\ndescription: 배포\n---\n',
            'README.txt': '이것은 텍스트 파일',
            'config.json': '{"key": "value"}',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const user = result.filter(c => c.scope === 'user')
      // .md 파일인 deploy만 포함
      expect(user).toHaveLength(1)
      expect(user[0].name).toBe('deploy')
    })
  })

  // ── 빌트인과 커스텀 동명 처리 ─────────────────────────────────────────────

  describe('listSlashCommands() — 빌트인과 커스텀 동명', () => {
    it('커스텀 커맨드가 빌트인과 같은 이름이어도 둘 다 반환된다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'review.md': '---\ndescription: 커스텀 리뷰\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const reviews = result.filter(c => c.name === 'review')
      // 빌트인 + user 둘 다 존재
      expect(reviews.length).toBeGreaterThanOrEqual(2)
      expect(reviews.some(c => c.scope === 'builtin')).toBe(true)
      expect(reviews.some(c => c.scope === 'user')).toBe(true)
    })
  })

  // ── user + project 동시 스캔 ───────────────────────────────────────────────

  describe('listSlashCommands() — user + project 동시 스캔', () => {
    it('user와 project 커맨드를 모두 반환한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'user-cmd.md': '---\ndescription: 유저 커맨드\n---\n',
          },
          project: {
            'project-cmd.md': '---\ndescription: 프로젝트 커맨드\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      const user = result.filter(c => c.scope === 'user')
      const project = result.filter(c => c.scope === 'project')
      expect(user).toHaveLength(1)
      expect(project).toHaveLength(1)
    })

    it('빌트인 + user + project 모두 있을 때 총 개수는 6 + user수 + project수이다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'u1.md': '---\ndescription: U1\n---\n',
            'u2.md': '---\ndescription: U2\n---\n',
          },
          project: {
            'p1.md': '---\ndescription: P1\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      expect(result).toHaveLength(9 + 2 + 1)
    })
  })

  // ── frontmatter 파싱 세부 ──────────────────────────────────────────────────

  describe('listSlashCommands() — frontmatter 파싱', () => {
    it('따옴표로 감싸인 frontmatter 값에서 따옴표를 제거한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'quoted.md': '---\ndescription: "따옴표 제거"\nargument-hint: \'[value]\'\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const cmd = result.find(c => c.name === 'quoted')
      expect(cmd?.description).toBe('따옴표 제거')
      expect(cmd?.argHint).toBe('[value]')
    })

    it('BOM이 있는 .md 파일도 올바르게 파싱한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            // U+FEFF = BOM
            'bom-cmd.md': '﻿---\ndescription: BOM 있음\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const cmd = result.find(c => c.name === 'bom-cmd')
      expect(cmd?.description).toBe('BOM 있음')
    })
  })

  // ── 빈 디렉토리(존재하지만 파일 0개) graceful 처리 ────────────────────────

  describe('listSlashCommands() — 빈 디렉토리(존재하지만 파일 0개)', () => {
    it('user 디렉토리가 존재하지만 비어있으면 graceful하게 빈 배열을 반환한다', () => {
      const deps = makeMockDeps({
        commandDirs: { user: {} },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      expect(result.filter(c => c.scope === 'user')).toHaveLength(0)
      expect(result.filter(c => c.scope === 'builtin').length).toBeGreaterThan(0)
    })

    it('project 디렉토리가 존재하지만 비어있으면 graceful하게 빈 배열을 반환한다', () => {
      const deps = makeMockDeps({
        commandDirs: { project: {} },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      expect(result.filter(c => c.scope === 'project')).toHaveLength(0)
    })
  })

  // ── FB2 P04: 중첩 서브디렉토리 재귀 스캔 + ':' 네임스페이스 ─────────────────
  //
  // 진단(파일:라인): 기존 discoverCommands()가 `if (e.isDirectory()) continue`로
  // 하위 디렉토리를 무조건 skip(flat 스캔) — AgentDeck 자체 .claude/commands/session/*.md
  // (session/end.md·session/review.md·session/start.md)가 실사례로 전혀 스캔 안 됨.
  // Claude Code SDK 네임스페이스 컨벤션(하위 디렉토리 = ':' 구분자)에 맞춰 재귀 스캔 후
  // name을 '<dir>:<file>' 형태로 생성한다.

  describe('listSlashCommands() — 중첩 서브디렉토리(네임스페이스) 재귀 스캔', () => {
    it('user 중첩 서브디렉토리의 .md를 스캔하여 \'디렉토리:파일명\' name을 생성한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'session/end.md': '---\ndescription: 세션 종료\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const cmd = result.find(c => c.scope === 'user' && c.name === 'session:end')
      expect(cmd).toBeDefined()
      expect(cmd?.description).toBe('세션 종료')
      expect(cmd?.scope).toBe('user')
    })

    it('project 중첩 서브디렉토리의 .md를 스캔하여 \'디렉토리:파일명\' name을 생성한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          project: {
            'session/start.md': '---\ndescription: 세션 시작\n---\n',
            'session/review.md': '---\ndescription: 세션 리뷰\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      const names = result.filter(c => c.scope === 'project').map(c => c.name)
      expect(names).toContain('session:start')
      expect(names).toContain('session:review')
    })

    it('최상위 flat 커맨드와 중첩 네임스페이스 커맨드가 함께 반환된다(AgentDeck 자체 .claude/commands 실사례 미러)', () => {
      const deps = makeMockDeps({
        commandDirs: {
          project: {
            'review.md': '---\ndescription: 변경 사항 코드 리뷰\n---\n',
            'harness.md': '---\ndescription: 하네스\n---\n',
            'session/start.md': '---\ndescription: 세션 시작\n---\n',
            'session/end.md': '---\ndescription: 세션 종료\n---\n',
            'session/review.md': '---\ndescription: 세션 리뷰\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands('/workspace')
      const names = result.filter(c => c.scope === 'project').map(c => c.name).sort()
      expect(names).toEqual(['harness', 'review', 'session:end', 'session:review', 'session:start'])
    })

    it('2단계 이상 중첩(a/b/c.md)도 재귀적으로 스캔하여 \'a:b:c\' name을 생성한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'a/b/deep.md': '---\ndescription: 깊은 커맨드\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const cmd = result.find(c => c.scope === 'user' && c.name === 'a:b:deep')
      expect(cmd).toBeDefined()
      expect(cmd?.description).toBe('깊은 커맨드')
    })

    it('중첩 네임스페이스 name에도 경로 구분자(\'/\'\\\'\\\\\')는 포함되지 않는다(신뢰경계)', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'session/end.md': '---\ndescription: 세션 종료\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const cmd = result.find(c => c.scope === 'user' && c.name === 'session:end')
      expect(cmd?.name).not.toContain('/')
      expect(cmd?.name).not.toContain('\\')
    })

    it('네임스페이스 서브디렉토리에 여러 .md가 있으면 모두 반환하고 이름순 정렬을 따른다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'session/zeta.md': '---\ndescription: Z\n---\n',
            'session/alpha.md': '---\ndescription: A\n---\n',
          },
        },
      })
      const store = createCommandsStore(deps)
      const result = store.listSlashCommands(null)
      const names = result.filter(c => c.scope === 'user').map(c => c.name)
      expect(names).toEqual(['session:alpha', 'session:zeta'])
    })

    it('빈 서브디렉토리(파일 0개)가 있어도 크래시 없이 graceful하게 처리한다', () => {
      const deps = makeMockDeps({
        commandDirs: {
          user: {
            'top.md': '---\ndescription: 최상위\n---\n',
          },
        },
      })
      // 'session' 서브디렉토리는 파일이 하나도 없는 상태를 시뮬레이션하기 위해
      // buildMockTree가 생성하지 않는 디렉토리를 readdir이 직접 추가하도록 mock 확장.
      const originalReaddir = deps.readdir
      deps.readdir = ((dir: string) => {
        const entries = originalReaddir(dir)
        if (dir.replace(/\\/g, '/').endsWith('/.claude/commands') && !dir.includes('session')) {
          return [...entries, { name: 'empty-sub', isDirectory: () => true }]
        }
        if (dir.replace(/\\/g, '/').endsWith('/empty-sub')) {
          return []
        }
        return entries
      }) as typeof deps.readdir
      const store = createCommandsStore(deps)
      expect(() => store.listSlashCommands(null)).not.toThrow()
      const result = store.listSlashCommands(null)
      expect(result.some(c => c.name === 'top')).toBe(true)
    })
  })
})
