// M09 G2 실물 fs 포트 — 작업 저장소 뿌리 기준 상대 경로만 받는다. 뿌리 밖(절대 경로, `..`, 뿌리 밖을 가리키는 링크)은 거부한다.
// 쓰기는 임시 파일 뒤 이름 바꾸기라, 읽는 쪽이 반쯤 쓴 파일을 보지 않는다.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createFsPort } from '@main/05_Loop/realPorts/fsPort'

let base: string
let root: string
let outside: string
beforeEach(() => {
  base = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'agentdeck-g2-fs-')))
  root = path.join(base, 'work')
  outside = path.join(base, 'outside')
  fs.mkdirSync(root)
  fs.mkdirSync(outside)
})
afterEach(() => { fs.rmSync(base, { recursive: true, force: true }) })

describe('실물 fs 포트', () => {
  it('없는 파일은 null, 쓰면 폴더를 만들고 읽힌다, 목록은 바로 아래 파일 이름만', async () => {
    const port = createFsPort(root)
    expect(await port.read('.agentdeck/run-state.json')).toBeNull()
    expect(await port.list('.agentdeck/goals')).toEqual([])
    await port.write('.agentdeck/goals/G1.md', '# 첫 goal\n')
    await port.write('.agentdeck/goals/G2.md', '# 둘째 goal\n')
    fs.mkdirSync(path.join(root, '.agentdeck/goals/sub'))
    expect(await port.read('.agentdeck/goals/G1.md')).toBe('# 첫 goal\n')
    expect((await port.list('.agentdeck/goals')).sort()).toEqual(['G1.md', 'G2.md'])
    await port.write('.agentdeck/goals/G1.md', '# 바뀐 제목\n')
    expect(fs.readFileSync(path.join(root, '.agentdeck/goals/G1.md'), 'utf8')).toBe('# 바뀐 제목\n')
    // 임시 파일 뒤 이름 바꾸기 — 덮어써도 .tmp 찌꺼기가 남지 않는다
    expect(fs.readdirSync(path.join(root, '.agentdeck/goals')).sort()).toEqual(['G1.md', 'G2.md', 'sub'])
  })

  it('같은 파일을 겹쳐 써도 읽는 쪽은 어느 한 판을 온전히 본다', async () => {
    const port = createFsPort(root)
    const bodies = Array.from({ length: 8 }, (_, i) => `${String(i).repeat(20_000)}\n`)
    await Promise.all(bodies.map((b) => port.write('.agentdeck/run-state.json', b)))
    expect(bodies).toContain(await port.read('.agentdeck/run-state.json'))
    expect(fs.readdirSync(path.join(root, '.agentdeck'))).toEqual(['run-state.json'])
  })

  it('뿌리 밖 경로를 거부한다 — 절대 경로, 드라이브, .., 역슬래시 ..', async () => {
    const port = createFsPort(root)
    const bad = ['', '/etc/passwd', 'C:/x.txt', 'C:x.txt', '../outside/x.txt', 'a/../../outside/x', '..\\outside\\x.txt', '\\\\server\\share\\x']
    for (const rel of bad) {
      await expect(port.write(rel, 'x'), rel).rejects.toThrow(/뿌리/)
      await expect(port.read(rel), rel).rejects.toThrow(/뿌리/)
      await expect(port.list(rel), rel).rejects.toThrow(/뿌리/)
    }
    expect(fs.readdirSync(outside)).toEqual([])
  })

  it('뿌리 밖을 가리키는 링크(junction)를 타고 나가지 않는다', async () => {
    fs.symlinkSync(outside, path.join(root, '.agentdeck'), 'junction')
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'outside')
    const port = createFsPort(root)
    await expect(port.write('.agentdeck/run-state.json', '{}')).rejects.toThrow(/뿌리/)
    await expect(port.read('.agentdeck/secret.txt')).rejects.toThrow(/뿌리/)
    await expect(port.list('.agentdeck')).rejects.toThrow(/뿌리/)
    expect(fs.readdirSync(outside)).toEqual(['secret.txt'])
  })
})
