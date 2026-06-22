import { defineConfig } from 'vitest/config'

// Phase 01: node 환경 단위 테스트. renderer 컴포넌트 테스트(Phase 05)는
// 파일 상단 `// @vitest-environment jsdom` 주석으로 개별 전환(jsdom 의존성 설치됨).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false
  }
})
