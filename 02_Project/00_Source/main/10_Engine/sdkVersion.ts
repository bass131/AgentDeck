import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import appPackage from '../../../../package.json'

// 설치본을 못 읽을 때의 폴백 — Dependabot이 올리는 package.json 의존 명세를 그대로 따른다
export const SDK_VERSION_FALLBACK: string = appPackage.dependencies['@anthropic-ai/claude-agent-sdk'].replace(/^[\^~]/, '')

export function readInstalledSdkVersion(): string | null {
  try {
    const require = createRequire(import.meta.url)
    let dir = dirname(require.resolve('@anthropic-ai/claude-agent-sdk'))
    for (let i = 0; i < 8; i++) {
      try {
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        if (pkg?.name === '@anthropic-ai/claude-agent-sdk') {
          const ver: unknown = pkg.version
          return typeof ver === 'string' && ver.length > 0 ? ver : null
        }
      } catch {
      }
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return null
  } catch {
    return null
  }
}
