import { describe, it, expect, vi } from 'vitest'

import { createMcpStore } from '../../../02_Source/main/05_settings/mcp'

interface MockFsState {
  claudeJson?: Record<string, unknown> | null | string
  mcpJson?: Record<string, unknown> | null | string
  initialDisabled?: string[]
  writeFileFail?: boolean
}

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

  let disabledContent: string | null =
    state.initialDisabled && state.initialDisabled.length > 0
      ? JSON.stringify({ disabled: state.initialDisabled })
      : null

  const lastWritten = { value: null as string | null }
  const writtenPaths: string[] = []

  const normPath = (p: string): string => p.replace(/\\/g, '/')

  const homedirFn = vi.fn(() => homedir)
  const getUserDataFn = vi.fn(() => userData)

  const readFileFn = vi.fn((filePath: string): string => {
    const normed = normPath(filePath)

    const overlayPath = normPath(`${userData}/mcp-disabled.json`)
    if (normed === overlayPath) {
      if (disabledContent === null) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      return disabledContent
    }

    const claudePath = normPath(`${homedir}/.claude.json`)
    if (normed === claudePath) {
      if (state.claudeJson === null || state.claudeJson === undefined) {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      }
      if (typeof state.claudeJson === 'string') {
        return state.claudeJson
      }
      return JSON.stringify(state.claudeJson)
    }

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

  const mkdirSyncFn = vi.fn((): void => { })

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

    expect(json.includes('SECRET_TOKEN_ABC')).toBe(false)
    expect(json.includes('API_KEY')).toBe(false)
    expect(json.includes('--token')).toBe(false)
    expect(json.includes('"args"')).toBe(false)
    expect(json.includes('"env"')).toBe(false)

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

    expect(json.includes('tok')).toBe(false)
    expect(json.includes('SECRET')).toBe(false)
    expect(json.includes('user:')).toBe(false)
    expect(json.includes('/p?')).toBe(false)

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

    expect(result[0].detail).toBe('node')
    expect(result[0].detail.includes('/')).toBe(false)
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

    const keys = Object.keys(result[0])
    expect(keys).not.toContain('env')
    expect(keys).not.toContain('args')
    expect(keys).not.toContain('headers')
    expect(keys).not.toContain('command')
    expect(keys).toContain('name')
    expect(keys).toContain('scope')
    expect(keys).toContain('origin')
    expect(keys).toContain('transport')
    expect(keys).toContain('detail')
    expect(keys).toContain('enabled')
    expect(keys.length).toBe(6)
  })
})

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
    expect(result).toHaveLength(3)
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
    expect(result[0].detail).toBe('api.example.com:8080')
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

    const modifiedUserFile = deps.writtenPaths.some(p =>
      p.replace(/\\/g, '/').endsWith('.claude.json')
    )
    expect(modifiedUserFile).toBe(false)
  })
})

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
          projects: {}
        }
      }
    })
    const store = createMcpStore(deps)
    const result = store.listMcpServers('/workspace')
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

describe('createMcpStore() — .mcp.json 루트맵 패턴', () => {

  it('.mcp.json 루트가 서버맵이면 mcpServers로 처리', () => {
    const deps = makeMockDeps({
      state: {
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
