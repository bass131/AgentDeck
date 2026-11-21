import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../../..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as {
  name: string
  productName?: string
  build?: unknown
  scripts: Record<string, string>
}
const builder = fs.readFileSync(path.join(ROOT, 'electron-builder.yml'), 'utf8')

describe('설치본의 앱 데이터 폴더는 agentdeck이다 (M13 G1, M07 Backlog 2)', () => {
  it('package.json에 productName이 없어 Electron 앱 이름(productName ?? name)이 agentdeck이다', () => {
    expect(pkg.productName).toBeUndefined()
    expect(pkg.name).toBe('agentdeck')
  })

  it('설치본 표시 이름 AgentDeck은 electron-builder 설정에만 있고 앱 메타데이터로 넣지 않는다', () => {
    expect(builder).toMatch(/^productName: AgentDeck$/m)
    expect(builder).not.toMatch(/extraMetadata/)
    expect(pkg.build).toBeUndefined()
    expect(pkg.scripts['dist:win']).not.toMatch(/extraMetadata/)
  })
})
