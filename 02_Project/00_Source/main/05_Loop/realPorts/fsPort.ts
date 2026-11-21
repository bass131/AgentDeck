// 작업 저장소 뿌리 기준 상대 경로(구분자 /)만 받는다(ports.ts 계약).
// 거부: 빈 경로, 절대 경로·드라이브·UNC, `..` 조각, 그리고 실제 경로(링크·junction을 따라간 끝)가 뿌리 밖인 경우.
// 쓰기는 같은 폴더의 임시 파일에 쓴 뒤 이름을 바꾼다 — 읽는 쪽(직렬화 줄 밖의 load)이 반쯤 쓴 파일을 보지 않는다.
import { promises as fsp } from 'node:fs'
import path from 'node:path'
import type { FsPort } from '../ports'
import { renameRetrying, writeFileAtomic } from './atomicWrite'

function outside(rel: string): Error {
  return new Error(`작업 저장소 뿌리 밖의 경로는 쓰지 않는다 — ${JSON.stringify(rel)}`)
}

function lexical(root: string, rel: string): string {
  if (typeof rel !== 'string' || rel.trim() === '') throw outside(rel)
  if (/^[\\/]/.test(rel) || /^[A-Za-z]:/.test(rel) || path.isAbsolute(rel)) throw outside(rel)
  if (rel.split(/[\\/]+/).some((seg) => seg === '..')) throw outside(rel)
  const full = path.resolve(root, rel)
  const back = path.relative(root, full)
  if (back === '' || back.startsWith('..') || path.isAbsolute(back)) throw outside(rel)
  return full
}

const within = (realRoot: string, real: string): boolean => {
  const back = path.relative(realRoot, real)
  return back === '' || (!back.startsWith('..') && !path.isAbsolute(back))
}

// 있는 조상 가운데 가장 가까운 것의 실제 경로가 뿌리 안인가.
async function checkReal(realRoot: string, full: string, rel: string): Promise<void> {
  let probe = full
  for (;;) {
    try {
      const real = await fsp.realpath(probe)
      if (!within(realRoot, real)) throw outside(rel)
      return
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e
      const parent = path.dirname(probe)
      if (parent === probe) throw outside(rel)
      probe = parent
    }
  }
}

export function createFsPort(root: string): FsPort {
  const absRoot = path.resolve(root)
  let realRoot: Promise<string> | null = null
  const getRealRoot = (): Promise<string> => (realRoot ??= fsp.realpath(absRoot))
  const resolveChecked = async (rel: string): Promise<string> => {
    const full = lexical(absRoot, rel)
    await checkReal(await getRealRoot(), full, rel)
    return full
  }
  const exists = async (rel: string): Promise<boolean> => {
    const full = await resolveChecked(rel)
    return fsp.lstat(full).then(() => true, (e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') return false
      throw e
    })
  }
  return {
    async read(rel) {
      const full = await resolveChecked(rel)
      try { return await fsp.readFile(full, 'utf8') } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null
        throw e
      }
    },
    async write(rel, text) {
      const full = await resolveChecked(rel)
      await fsp.mkdir(path.dirname(full), { recursive: true })
      // mkdir 뒤 다시 본다 — 만든 폴더 길에 뿌리 밖 링크가 끼었는지
      await checkReal(await getRealRoot(), path.dirname(full), rel)
      await writeFileAtomic(full, text)
    },
    exists,
    async move(fromRel, toRel) {
      const from = await resolveChecked(fromRel)
      const to = await resolveChecked(toRel)
      if (await exists(toRel)) throw new Error(`옮길 자리 ${JSON.stringify(toRel)}가 이미 있어 덮어쓰지 않는다`)
      await fsp.mkdir(path.dirname(to), { recursive: true })
      await checkReal(await getRealRoot(), path.dirname(to), toRel)
      await renameRetrying(from, to)
    },
    async list(relDir) {
      const full = await resolveChecked(relDir)
      try {
        return (await fsp.readdir(full, { withFileTypes: true })).filter((d) => d.isFile()).map((d) => d.name)
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return []
        throw e
      }
    },
  }
}
