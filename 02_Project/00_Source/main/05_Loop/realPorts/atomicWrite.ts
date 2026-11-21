// 같은 폴더의 임시 파일에 쓴 뒤 이름을 바꾼다. 읽는 쪽이 반쯤 쓴 파일을 보지 않는다.
// Windows에서는 백신·색인기가 대상 파일을 잠깐 붙들어 rename이 EPERM·EACCES·EBUSY로 실패할 수 있어 몇 번 다시 해 본다.
import { randomBytes } from 'node:crypto'
import fs, { promises as fsp } from 'node:fs'

const RETRY = new Set(['EPERM', 'EACCES', 'EBUSY'])

export async function renameRetrying(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fsp.rename(from, to)
      return
    } catch (e) {
      if (i >= 5 || !RETRY.has((e as NodeJS.ErrnoException).code ?? '')) throw e
      await new Promise((r) => setTimeout(r, 20 * (i + 1)))
    }
  }
}

// 동기 쓰기만 하는 저장소(대화 색인)가 쓰는 같은 꼴
export function writeFileAtomicSync(file: string, text: string): void {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    fs.writeFileSync(tmp, text)
    for (let i = 0; ; i++) {
      try {
        fs.renameSync(tmp, file)
        return
      } catch (e) {
        if (i >= 5 || !RETRY.has((e as NodeJS.ErrnoException).code ?? '')) throw e
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (i + 1))
      }
    }
  } catch (e) {
    fs.rmSync(tmp, { force: true })
    throw e
  }
}

export async function writeFileAtomic(file: string, text: string): Promise<void> {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
  try {
    await fsp.writeFile(tmp, text)
    await renameRetrying(tmp, file)
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => undefined)
    throw e
  }
}
