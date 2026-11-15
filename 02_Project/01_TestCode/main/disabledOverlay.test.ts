import { describe, it, expect, vi } from 'vitest'
import { createSkillsStore } from '@main/11_Settings/skills'
import { createMcpStore } from '@main/11_Settings/mcp'
import { createDisabledOverlay } from '@main/11_Settings/disabledOverlay'

// M05 G11: skills와 mcp가 각자 갖던 비활성 목록 처리(readDisabled·set*Enabled)를 한 곳으로 모은다.
// 두 스토어를 같은 가짜 fs로 실제로 돌려 지금 동작을 고정한다 — 오버레이 파일 이름, 쓰기 모양,
// userData 해석 횟수와 위치(경로 해석은 try 밖이라 throw가 그대로 나간다), 입력 검증 순서.
const norm = (p: string): string => p.replace(/\\/g, '/')

interface Rig {
  files: Map<string, string>
  writes: Array<{ path: string; content: string }>
  mkdirs: string[]
  getUserData: ReturnType<typeof vi.fn>
  deps: {
    homedir: () => string
    getUserData: () => string
    readdir: (dir: string) => Array<{ name: string; isDirectory: () => boolean }>
    readFile: (p: string) => string
    writeFile: (p: string, c: string) => void
    mkdirSync: (d: string) => void
  }
}

function rig(opts: { overlay?: string; userDataThrows?: boolean; writeThrows?: boolean; mkdirThrows?: boolean } = {}): Rig {
  const files = new Map<string, string>()
  const writes: Rig['writes'] = []
  const mkdirs: string[] = []
  const getUserData = vi.fn(() => {
    if (opts.userDataThrows) throw new Error('no userData')
    return '/u'
  })
  const r: Rig = {
    files, writes, mkdirs, getUserData,
    deps: {
      homedir: () => '/h',
      getUserData,
      readdir: () => { throw new Error('ENOENT') },
      readFile: (p) => {
        const v = files.get(norm(p))
        if (v === undefined) throw new Error('ENOENT')
        return v
      },
      writeFile: (p, c) => {
        if (opts.writeThrows) throw new Error('EACCES')
        writes.push({ path: norm(p), content: c })
        files.set(norm(p), c)
      },
      mkdirSync: (d) => {
        if (opts.mkdirThrows) throw new Error('EACCES')
        mkdirs.push(norm(d))
      },
    },
  }
  if (opts.overlay !== undefined) {
    files.set('/u/skills-disabled.json', opts.overlay)
    files.set('/u/mcp-disabled.json', opts.overlay)
  }
  return r
}

const kinds = [
  {
    label: 'skills',
    file: '/u/skills-disabled.json',
    make: (r: Rig) => {
      const s = createSkillsStore(r.deps)
      return { set: s.setSkillEnabled, read: s.disabledSkillOverrides, list: () => s.listSkills(null) }
    },
  },
  {
    label: 'mcp',
    file: '/u/mcp-disabled.json',
    make: (r: Rig) => {
      const s = createMcpStore(r.deps)
      return { set: s.setMcpEnabled, read: s.deniedMcpServers, list: () => s.listMcpServers(null) }
    },
  },
] as const

describe.each(kinds)('비활성 오버레이 — $label (M05 G11 동작 고정)', ({ file, make }) => {
  it('쓰기: userData를 만들고 정렬된 목록을 들여쓰기 2로 쓴다', () => {
    const r = rig({ overlay: JSON.stringify({ disabled: ['b'] }) })
    expect(make(r).set('a', false)).toBe(true)
    expect(r.mkdirs).toEqual(['/u'])
    expect(r.writes).toEqual([{ path: file, content: JSON.stringify({ disabled: ['a', 'b'] }, null, 2) }])
  })

  it('setEnabled는 userData를 두 번 해석한다(경로 한 번, 쓰기 직전 한 번)', () => {
    const r = rig()
    make(r).set('a', false)
    expect(r.getUserData).toHaveBeenCalledTimes(2)
  })

  it('읽기(disabled 목록)·목록 조회는 userData를 한 번 해석한다', () => {
    const r = rig()
    const s = make(r)
    s.read()
    expect(r.getUserData).toHaveBeenCalledTimes(1)
    s.list()
    expect(r.getUserData).toHaveBeenCalledTimes(2)
  })

  it('userData 해석이 throw하면 set·read·list 모두 throw가 그대로 나간다', () => {
    const s = make(rig({ userDataThrows: true }))
    expect(() => s.set('a', false)).toThrow('no userData')
    expect(() => s.read()).toThrow('no userData')
    expect(() => s.list()).toThrow('no userData')
  })

  it('이름 검증이 userData 해석보다 먼저다 — 빈·공백 이름은 false이고 해석하지 않는다', () => {
    const r = rig({ userDataThrows: true })
    const s = make(r)
    expect(s.set('', false)).toBe(false)
    expect(s.set('   ', false)).toBe(false)
    expect(s.set(42 as unknown as string, false)).toBe(false)
    expect(r.getUserData).not.toHaveBeenCalled()
  })

  it('mkdir·쓰기 실패는 false', () => {
    expect(make(rig({ mkdirThrows: true })).set('a', false)).toBe(false)
    expect(make(rig({ writeThrows: true })).set('a', false)).toBe(false)
  })

  it('목록 안의 문자열이 아닌 항목은 버린다', () => {
    const r = rig({ overlay: JSON.stringify({ disabled: ['x', 1, null, 'y'] }) })
    make(r).set('z', false)
    expect(JSON.parse(r.writes[0].content)).toEqual({ disabled: ['x', 'y', 'z'] })
  })

  it.each([
    ['disabled가 배열이 아님', JSON.stringify({ disabled: 'x' })],
    ['JSON이 깨짐', '{oops'],
    ['JSON이 null', 'null'],
    ['파일 없음', undefined],
  ])('%s → 빈 목록으로 읽는다', (_label, overlay) => {
    const r = rig({ overlay })
    const s = make(r)
    expect(s.read()).toBeNull()
    s.set('a', false)
    expect(JSON.parse(r.writes[0].content)).toEqual({ disabled: ['a'] })
  })

  it('enabled=true는 목록에서 뺀다', () => {
    const r = rig({ overlay: JSON.stringify({ disabled: ['a', 'b'] }) })
    make(r).set('a', true)
    expect(JSON.parse(r.writes[0].content)).toEqual({ disabled: ['b'] })
  })
})

describe('createDisabledOverlay() — 한 곳으로 모은 모듈 (M05 G11)', () => {
  it('파일 이름은 소비처가 정하고 userData 아래에 붙는다', () => {
    const r = rig()
    const o = createDisabledOverlay('x-disabled.json', r.deps)
    expect(o.setEnabled('n', false)).toBe(true)
    expect(r.writes[0].path).toBe('/u/x-disabled.json')
    expect([...o.readDisabled()]).toEqual(['n'])
  })

  it('경로 해석이 throw하면 readDisabled·setEnabled 모두 throw가 나간다(이름 검증은 그보다 먼저)', () => {
    const o = createDisabledOverlay('x-disabled.json', rig({ userDataThrows: true }).deps)
    expect(() => o.readDisabled()).toThrow('no userData')
    expect(() => o.setEnabled('n', false)).toThrow('no userData')
    expect(o.setEnabled('', false)).toBe(false)
  })

  it('readDisabled는 호출마다 파일을 다시 읽는다(상태를 쥐지 않는다)', () => {
    const r = rig()
    const o = createDisabledOverlay('x-disabled.json', r.deps)
    expect(o.readDisabled().size).toBe(0)
    r.files.set('/u/x-disabled.json', JSON.stringify({ disabled: ['k'] }))
    expect([...o.readDisabled()]).toEqual(['k'])
  })
})

describe('비활성 오버레이 — 출력 투영은 스토어마다 다르다', () => {
  it('skills는 {name: off} 맵, mcp는 [{serverName}] 배열(쓰인 순서)', () => {
    const r = rig({ overlay: JSON.stringify({ disabled: ['b', 'a'] }) })
    expect(createSkillsStore(r.deps).disabledSkillOverrides()).toEqual({ b: 'off', a: 'off' })
    expect(createMcpStore(r.deps).deniedMcpServers()).toEqual([{ serverName: 'b' }, { serverName: 'a' }])
  })
})
