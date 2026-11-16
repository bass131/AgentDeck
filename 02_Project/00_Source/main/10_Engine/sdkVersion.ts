import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

// SDK 버전 읽기의 한 곳 (M05 G11) — ClaudeCodeBackend.version()과 engineState의 기본 getVersion이 함께 쓴다.
// 설치본 package.json을 못 읽을 때만 폴백 상수가 보인다. 값은 package.json의 의존 명세와 같게 둔다
// (sdk-version-read.test.ts가 드리프트를 고정한다 — Backlog 4).
export const SDK_VERSION_FALLBACK = '0.3.325'

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
