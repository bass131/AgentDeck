import { describe, it, expect, vi } from 'vitest'

import { createCommandsStore } from '../../../02_Source/main/05_settings/commands'

interface MockCommandDirs {
  user?: Record<string, string> | null
  project?: Record<string, string> | null
}

type MockFsNode =
  | { type: 'file'; content: string }
  | { type: 'dir'; children: Map<string, MockFsNode> }

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

function makeMockDeps(opts: {
  homedir?: string
  commandDirs?: MockCommandDirs
} = {}) {
  const homedir = opts.homedir ?? '/home/user'
  const commandDirs = opts.commandDirs ?? {}

  const homedirFn = vi.fn(() => homedir)

  const normPath = (p: string): string => p.replace(/\\/g, '/').replace(/\/+$/, '')

  const userBase = normPath(`${homedir}/.claude/commands`)
  const userTree = commandDirs.user !== null && commandDirs.user !== undefined
    ? buildMockTree(commandDirs.user)
    : null
  const projectTree = commandDirs.project !== null && commandDirs.project !== undefined
    ? buildMockTree(commandDirs.project)
    : null

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

describe('createCommandsStore()', () => {

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

      expect(Object.keys(cmd!)).toEqual(
        expect.arrayContaining(['name', 'description', 'scope'])
      )

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

      expect(cmd?.name).not.toContain('/')
      expect(cmd?.name).not.toContain('\\')
      expect(cmd?.name).not.toContain('.md')

      const stringified = JSON.stringify(cmd)
      expect(stringified).not.toContain('/home/user')
      expect(stringified).not.toContain('.claude/commands')
    })
  })

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
      expect(user).toHaveLength(1)
      expect(user[0].name).toBe('deploy')
    })
  })

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
      expect(reviews.length).toBeGreaterThanOrEqual(2)
      expect(reviews.some(c => c.scope === 'builtin')).toBe(true)
      expect(reviews.some(c => c.scope === 'user')).toBe(true)
    })
  })

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
