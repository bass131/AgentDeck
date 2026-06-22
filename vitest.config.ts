import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Phase 01: node 환경 단위 테스트. renderer 컴포넌트 테스트(Phase 05)는
// 파일 상단 `// @vitest-environment jsdom` 주석으로 개별 전환(jsdom 의존성 설치됨).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    globals: false,
    // CSS 파일을 빈 모듈로 처리 (jsdom 환경에서 CSS import 오류 방지)
    css: false,
  },
})
