/**
 * mcp.test.ts — createMcpStore() 단위 테스트 (P5b — Settings MCP 탭 실동작)
 *
 * TDD 순서: 이 파일을 먼저 작성(실패) → src/main/settings/mcp.ts 구현 → 통과.
 *
 * 테스트 전략:
 *   1. mock fs(homedir/userData/readFile/writeFile 주입) — electron import 0.
 *   2. 🔴 마스킹 음성(필수): 시크릿이 McpServerInfo 직렬화 결과에 절대 포함 안 됨.
 *   3. 3출처 origin/scope 매핑 + rank 정렬(user→project→local) + 동명 서버 구분.
 *   4. transport 판정(stdio/http/sse/unknown), URL 파싱 실패→detail=''.
 *   5. disabled 오버레이 반영(enabled=false) + setMcpEnabled 라운드트립 + 사용자 파일 미수정.
 *   6. deniedMcpServers 빈→null·항목→[{serverName}].
 *   7. 파일 없음/파싱 실패 graceful.
 *
 * CRITICAL(신뢰경계):
 *   - env/args/url 전체/headers 등 시크릿 운반 필드는 McpServerInfo에 절대 미포함.
 *   - ~/.claude.json 읽기만, 절대 수정 금지.
 *   - 오버레이(mcp-disabled.json)는 userData에만 기록.
 */

import { describe, it, expect, vi } from 'vitest'

// ── 구현 파일 import (아직 없음 → 이 시점에서 테스트 실패 예상) ──────────────
import { createMcpStore } from '../../src/main/settings/mcp'

// ═══════════════════════════════════════════════════════════════════════════════
// 헬퍼: mock deps 팩토리
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * 가상 파일시스템 상태.
 *
 * claudeJson: ~/.claude.json 파싱 결과 (null=없음, string=파싱 실패 raw)
 * mcpJson: <workspaceRoot>/.mcp.json 파싱 결과 (null=없음, string=파싱 실패 raw)
 * disabledJson: <userData>/mcp-disabled.json 파싱 결과
 */
interface MockFsState {
  claudeJson?: Record<string, unknown> | null | string
  mcpJson?: Record<string, unknown> | null | string
  initialDisabled?: string[]
  writeFileFail?: boolean
}

/**
 * mock deps 생성.
 *
 * skills.ts의 makeMockDeps 패턴을 그대로 따른다.
 * homedir/userData/readFile/writeFile/mkdirSync를 주입.
 */
function makeMockDeps(opts: {
  homedir?: string
  userData?: string
  state?: MockFsState
  workspaceRoot?: string
} = {}) {
  const homedir = opts.homedir ?? '/home/user'
  const userData = opts.userData ?? '/userdata'
  const state = opts.state ?? {}
  const writeFileFail = state.writeFileFail ?? false

  // 오버레이 인메모리 저장소
  let disabledContent: string | null =
    state.initialDisabled && state.initialDisabled.length > 0
      ? JSON.stringify({ disabled: state.initialDisabled })
      : null

  const lastWritten = { value: null as string | null }
  // 수정된 경로 추적 (사용자 파일 미수정 검증용)
  const writtenPaths: string[] = []

  const normPath = (p: string): string => p.replace(/\\/g, '/')

  const homedirFn = vi.fn(() => homedir)
  const getUserDataFn = vi.fn(() => userData)

  const readFileFn = vi.fn((filePath: string): string => {
    const normed = normPath(filePath)

    // 오버레이 파일
    const overlayPath = normPath(`${userData}/mcp-disabled.json`)
    if (normed === overlayPath) {
      if (disabledContent === null) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      return disabledContent
    }

    // ~/.claude.json
    const claudePath = normPath(`${homedir}/.claude.json`)
    if (normed === claudePath) {
      if (state.claudeJson === null || state.claudeJson === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      if (typeof state.claudeJson === 'string') {
        return state.claudeJson // 파싱 실패 시뮬레이션용 raw 문자열
      }
      return JSON.stringify(state.claudeJson)
    }

    // <workspaceRoot>/.mcp.json
    if (normed.endsWith('/.mcp.json')) {
      if (state.mcpJson === null || state.mcpJson === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      if (typeof state.mcpJson === 'string') {
        return state.mcpJson
      }
      return JSON.stringify(state.mcpJson)
    }

    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  })

  const writeFileFn = vi.fn((filePath: string, content: string): void => {
    if (writeFileFail) {
      throw new Error('EPERM: write failed')
    }
    const normed = normPath(filePath)
    writtenPaths.push(normed)
    const overlayPath = normPath(`${userData}/mcp-disabled.json`)
    if (normed === overlayPath) {
      lastWritten.value = content
      disabledContent = content
    }
  })

  const mkdirSyncFn = vi.fn((): void => { /* no-op */ })

  return {
    homedir: homedirFn,
    getUserData: getUserDataFn,
    readFile: readFileFn,
    writeFile: writeFileFn,
    mkdirSync: mkdirSyncFn,
    get lastWritten() { return lastWritten.value },
    get writtenPaths() { return writtenPaths },
    get disabledContent() { return disabledContent },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🔴 마스킹 음성 테스트 (신뢰경계 — 가장 중요)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createMcpStore() — 🔴 마스킹 음성 테스트 (신뢰경계 최우선)', () => {

  it('stdio 서버: args·env의 SECRET_TOKEN_ABC가 McpServerInfo에 절대 미포함', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'secret-stdio': {
              command: 'node',
              args: ['--token', 'SECRET_TOKEN_ABC'],
              env: { API_KEY: 'SECRET_TOKEN_ABC' }
            }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    const json = JSON.stringify(result)

    // 시크릿이 절대 출력에 없어야 함
    expect(json.includes('SECRET_TOKEN_ABC')).toBe(false)
    expect(json.includes('API_KEY')).toBe(false)
    expect(json.includes('--token')).toBe(false)
    expect(json.includes('"args"')).toBe(false)
    expect(json.includes('"env"')).toBe(false)

    // 허용된 값만
    expect(result[0].detail).toBe('node')
    expect(result[0].transport).toBe('stdio')
  })

  it('http 서버: URL 전체(userinfo·path·query·token)가 McpServerInfo에 절대 미포함', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'secret-http': {
              url: 'https://user:tok@h.com/p?key=SECRET'
            }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    const json = JSON.stringify(result)

    // 시크릿이 절대 출력에 없어야 함
    expect(json.includes('tok')).toBe(false)
    expect(json.includes('SECRET')).toBe(false)
    expect(json.includes('user:')).toBe(false)
    expect(json.includes('/p?')).toBe(false)

    // 허용된 값만 (host = hostname[:port])
    expect(result[0].detail).toBe('h.com')
    expect(result[0].transport).toBe('http')
  })

  it('stdio full command path: basename만(경로 생략)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'full-path': {
              command: '/usr/local/bin/node',
              args: ['server.js']
            }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)

    // basename만
    expect(result[0].detail).toBe('node')
    // 전체 경로 미포함
    expect(result[0].detail.includes('/')).toBe(false)
    // args 미포함
    expect(result[0].detail.includes('server.js')).toBe(false)
  })

  it('McpServerInfo에 env/args/headers/url(전체)/command(전체) 필드가 없어야 한다', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'srv': {
              command: 'python',
              args: ['-m', 'server'],
              env: { TOKEN: 'tok123' }
            }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)

    // McpServerInfo 타입 준수: 6개 필드만
    const keys = Object.keys(result[0])
    expect(keys).not.toContain('env')
    expect(keys).not.toContain('args')
    expect(keys).not.toContain('headers')
    expect(keys).not.toContain('command')
    // 허용 필드
    expect(keys).toContain('name')
    expect(keys).toContain('scope')
    expect(keys).toContain('origin')
    expect(keys).toContain('transport')
    expect(keys).toContain('detail')
    expect(keys).toContain('enabled')
    // 정확히 6개
    expect(keys.length).toBe(6)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// 3출처 origin/scope 매핑 + rank 정렬
// ═══════════════════════════════════════════════════════════════════════════════

describe('createMcpStore() — 3출처 origin/scope 매핑', () => {

  it('~/.claude.json mcpServers → origin=user, scope=global', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'global-srv': { command: 'npx', args: ['@mcp/global'] }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('global-srv')
    expect(result[0].origin).toBe('user')
    expect(result[0].scope).toBe('global')
  })

  it('~/.claude.json projects[ws].mcpServers → origin=local, scope=local', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          projects: {
            '/workspace': {
              mcpServers: {
                'local-srv': { command: 'node', args: ['local.js'] }
              }
            }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('local-srv')
    expect(result[0].origin).toBe('local')
    expect(result[0].scope).toBe('local')
  })

  it('<workspaceRoot>/.mcp.json mcpServers → origin=project, scope=local', () => {
    const deps = makeMockDeps({
      state: {
        mcpJson: {
          mcpServers: {
            'project-srv': { command: 'python', args: ['srv.py'] }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('project-srv')
    expect(result[0].origin).toBe('project')
    expect(result[0].scope).toBe('local')
  })

  it('workspaceRoot=null 이면 user 출처만 반환(local·project 건너뜀)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'global-srv': { command: 'npx' }
          },
          projects: {
            '/workspace': {
              mcpServers: { 'local-srv': { command: 'node' } }
            }
          }
        },
        mcpJson: {
          mcpServers: { 'proj-srv': { command: 'python' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    // user만
    expect(result).toHaveLength(1)
    expect(result[0].origin).toBe('user')
  })

  it('3출처 모두 있을 때 합산 반환', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'user-srv': { command: 'npx' }
          },
          projects: {
            '/workspace': {
              mcpServers: { 'local-srv': { command: 'node' } }
            }
          }
        },
        mcpJson: {
          mcpServers: { 'proj-srv': { command: 'python' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    expect(result).toHaveLength(3)
    const origins = result.map(r => r.origin).sort()
    expect(origins).toEqual(['local', 'project', 'user'])
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// rank 정렬 (user→project→local, 동명 서버 구분)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createMcpStore() — rank 정렬 (user→project→local)', () => {

  it('동명 서버가 다른 출처에 있을 때 rank 정렬로 구분된다', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'same-name': { command: 'npx' }
          },
          projects: {
            '/workspace': {
              mcpServers: {
                'same-name': { command: 'node' }
              }
            }
          }
        },
        mcpJson: {
          mcpServers: {
            'same-name': { command: 'python' }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    // 3개 모두 나와야 함 (동명 서버 구분)
    expect(result).toHaveLength(3)
    // rank 정렬: user(0)→project(1)→local(2)
    expect(result[0].origin).toBe('user')
    expect(result[1].origin).toBe('project')
    expect(result[2].origin).toBe('local')
  })

  it('다른 이름 서버들은 name 알파벳 순 정렬', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: {
            'zebra-srv': { command: 'npx' },
            'alpha-srv': { command: 'node' }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].name).toBe('alpha-srv')
    expect(result[1].name).toBe('zebra-srv')
  })

  it('rank 정렬: 동명일 때 user가 먼저', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { command: 'npx' } },
          projects: {
            '/workspace': {
              mcpServers: { 'srv': { command: 'node' } }
            }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    expect(result[0].origin).toBe('user')
    expect(result[1].origin).toBe('local')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// transport 판정
// ═══════════════════════════════════════════════════════════════════════════════

describe('createMcpStore() — transport 판정', () => {

  it('command 있으면 transport=stdio', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { command: 'node', args: [] } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].transport).toBe('stdio')
  })

  it('url 있고 type 없으면 transport=http', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { url: 'https://api.example.com/mcp' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].transport).toBe('http')
  })

  it('url 있고 type=sse이면 transport=sse', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { url: 'https://api.example.com/sse', type: 'sse' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].transport).toBe('sse')
  })

  it('command도 url도 없으면 transport=unknown, detail=""', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { type: 'websocket' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].transport).toBe('unknown')
    expect(result[0].detail).toBe('')
  })

  it('URL 파싱 실패 → detail="" (raw fallback 절대 금지)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { url: 'not-a-valid-url:::' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].transport).toBe('http')
    expect(result[0].detail).toBe('')
  })

  it('http URL: host만 반환(port 포함, path·query·hash 제외)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { url: 'https://api.example.com:8080/v1/mcp?token=secret#frag' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    // host = hostname:port
    expect(result[0].detail).toBe('api.example.com:8080')
    // 시크릿·path·query 미포함
    expect(result[0].detail.includes('secret')).toBe(false)
    expect(result[0].detail.includes('/v1')).toBe(false)
    expect(result[0].detail.includes('frag')).toBe(false)
  })

  it('stdio: Windows 경로 포함 command에서도 basename만 추출', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { command: 'C:\\Program Files\\node\\node.exe' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].detail).toBe('node.exe')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// disabled 오버레이 + setMcpEnabled 라운드트립
// ═══════════════════════════════════════════════════════════════════════════════

describe('createMcpStore() — disabled 오버레이 + setMcpEnabled', () => {

  it('disabled 오버레이에 name이 있으면 enabled=false 반환', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'my-srv': { command: 'node' } }
        },
        initialDisabled: ['my-srv']
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].enabled).toBe(false)
  })

  it('disabled 오버레이에 name이 없으면 enabled=true 반환', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'my-srv': { command: 'node' } }
        },
        initialDisabled: ['other-srv']
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].enabled).toBe(true)
  })

  it('오버레이 파일 없으면 모든 서버 enabled=true(graceful)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { command: 'node' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result[0].enabled).toBe(true)
  })

  it('setMcpEnabled(false) → 오버레이에 name 추가 + enabled=false 반영', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'my-srv': { command: 'node' } }
        }
      }
    })
    const store = createMcpStore(deps)
    const ok = store.setMcpEnabled('my-srv', false)
    expect(ok).toBe(true)
    expect(deps.lastWritten).not.toBeNull()
    const written = JSON.parse(deps.lastWritten!)
    expect(written.disabled).toContain('my-srv')

    // listMcpServers 재조회 시 반영
    const result = store.listMcpServers(null)
    expect(result[0].enabled).toBe(false)
  })

  it('setMcpEnabled(true) → 오버레이에서 name 제거 + enabled=true 반영', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'my-srv': { command: 'node' } }
        },
        initialDisabled: ['my-srv']
      }
    })
    const store = createMcpStore(deps)
    const ok = store.setMcpEnabled('my-srv', true)
    expect(ok).toBe(true)
    const written = JSON.parse(deps.lastWritten!)
    expect(written.disabled).not.toContain('my-srv')

    const result = store.listMcpServers(null)
    expect(result[0].enabled).toBe(true)
  })

  it('setMcpEnabled: 쓰기 실패 → graceful false(크래시 없음)', () => {
    const deps = makeMockDeps({
      state: { writeFileFail: true }
    })
    const store = createMcpStore(deps)
    const ok = store.setMcpEnabled('any-srv', false)
    expect(ok).toBe(false)
  })

  it('setMcpEnabled: name 빈 문자열 → false(untrusted 검증)', () => {
    const deps = makeMockDeps()
    const store = createMcpStore(deps)
    const ok = store.setMcpEnabled('', false)
    expect(ok).toBe(false)
  })

  it('setMcpEnabled: 중복 disable 시 중복 없이 저장', () => {
    const deps = makeMockDeps({
      state: { initialDisabled: ['my-srv'] }
    })
    const store = createMcpStore(deps)
    store.setMcpEnabled('my-srv', false)
    const written = JSON.parse(deps.lastWritten!)
    const count = written.disabled.filter((n: string) => n === 'my-srv').length
    expect(count).toBe(1)
  })

  it('사용자 파일(~/.claude.json)은 setMcpEnabled 이후 수정되지 않는다', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'srv': { command: 'node' } }
        }
      }
    })
    const store = createMcpStore(deps)
    store.setMcpEnabled('srv', false)

    // 오버레이 경로(userData)에만 써야 함 — ~/.claude.json은 절대 수정 금지
    const modifiedUserFile = deps.writtenPaths.some(p =>
      p.replace(/\\/g, '/').endsWith('.claude.json')
    )
    expect(modifiedUserFile).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// deniedMcpServers
// ═══════════════════════════════════════════════════════════════════════════════

describe('createMcpStore() — deniedMcpServers()', () => {

  it('disabled 없으면 null 반환', () => {
    const deps = makeMockDeps()
    const store = createMcpStore(deps)
    const result = store.deniedMcpServers()
    expect(result).toBeNull()
  })

  it('disabled 빈 배열이면 null 반환', () => {
    const deps = makeMockDeps({ state: { initialDisabled: [] } })
    const store = createMcpStore(deps)
    const result = store.deniedMcpServers()
    expect(result).toBeNull()
  })

  it('disabled 항목 있으면 [{serverName},...] 반환', () => {
    const deps = makeMockDeps({ state: { initialDisabled: ['srv-a', 'srv-b'] } })
    const store = createMcpStore(deps)
    const result = store.deniedMcpServers()
    expect(result).not.toBeNull()
    expect(result).toHaveLength(2)
    const names = result!.map(r => r.serverName)
    expect(names).toContain('srv-a')
    expect(names).toContain('srv-b')
    // serverName만 있어야 함
    result!.forEach(r => {
      expect(Object.keys(r)).toEqual(['serverName'])
    })
  })

  it('setMcpEnabled(false) 후 deniedMcpServers에 반영', () => {
    const deps = makeMockDeps()
    const store = createMcpStore(deps)
    store.setMcpEnabled('new-srv', false)
    const result = store.deniedMcpServers()
    expect(result).not.toBeNull()
    expect(result![0].serverName).toBe('new-srv')
  })

  it('setMcpEnabled(true)로 모두 제거 후 null 반환', () => {
    const deps = makeMockDeps({ state: { initialDisabled: ['srv'] } })
    const store = createMcpStore(deps)
    store.setMcpEnabled('srv', true)
    const result = store.deniedMcpServers()
    expect(result).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// graceful: 파일 없음·파싱 실패
// ═══════════════════════════════════════════════════════════════════════════════

describe('createMcpStore() — graceful (파일 없음·파싱 실패)', () => {

  it('~/.claude.json 없으면 빈 배열(graceful, throw 0)', () => {
    const deps = makeMockDeps({
      state: { claudeJson: null }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    expect(result).toHaveLength(0)
    expect(() => result).not.toThrow()
  })

  it('~/.claude.json JSON 파싱 실패 → 빈 배열(graceful)', () => {
    const deps = makeMockDeps({
      state: { claudeJson: 'NOT VALID JSON }{' }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result).toHaveLength(0)
  })

  it('.mcp.json 없으면 해당 출처 건너뜀(graceful)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'user-srv': { command: 'node' } }
        },
        mcpJson: null
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    // user만
    expect(result).toHaveLength(1)
    expect(result[0].origin).toBe('user')
  })

  it('.mcp.json JSON 파싱 실패 → 해당 출처 건너뜀(graceful)', () => {
    const deps = makeMockDeps({
      state: {
        mcpJson: '{ broken json'
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    expect(result).toHaveLength(0)
  })

  it('~/.claude.json에 mcpServers 필드 없으면 건너뜀(graceful)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          someOtherField: 'value'
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers(null)
    expect(result).toHaveLength(0)
  })

  it('projects[ws] 필드 없으면 local 출처 건너뜀(graceful)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: {
          mcpServers: { 'user-srv': { command: 'node' } },
          projects: {}  // workspace 없음
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    // user만
    expect(result).toHaveLength(1)
    expect(result[0].origin).toBe('user')
  })

  it('모든 출처 없으면 빈 배열(graceful)', () => {
    const deps = makeMockDeps({
      state: {
        claudeJson: null,
        mcpJson: null
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    expect(result).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// .mcp.json 루트맵 패턴 (mcpServers 키 없이 루트가 서버맵)
// ═══════════════════════════════════════════════════════════════════════════════

describe('createMcpStore() — .mcp.json 루트맵 패턴', () => {

  it('.mcp.json 루트가 서버맵이면 mcpServers로 처리', () => {
    const deps = makeMockDeps({
      state: {
        // .mcp.json이 { mcpServers: {...} } 형태
        mcpJson: {
          mcpServers: {
            'root-srv': { command: 'node' }
          }
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
    expect(result).toHaveLength(1)
    expect(result[0].origin).toBe('project')
    expect(result[0].name).toBe('root-srv')
  })
})
