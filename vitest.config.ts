import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Phase 01: node 환경 단위 테스트. renderer 컴포넌트 테스트(Phase 05)는
// 파일 상단 `// @vitest-environment jsdom` 주석으로 개별 전환(jsdom 의존성 설치됨).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['99.Others/tests/**/*.test.ts', '99.Others/tests/**/*.test.tsx'],
    globals: false,
    // CSS 파일을 빈 모듈로 처리 (jsdom 환경에서 CSS import 오류 방지)
    css: false,
    // react-markdown@9 / remark-gfm@4 / rehype-highlight@7 는 ESM-only.
    // vitest(jsdom)에서 변환 오류를 방지하기 위해 inline 변환 목록에 추가.
    // 정규식으로 관련 ESM 패키지 전체를 커버 (M2-02 조정 — 최소 변경).
    server: {
      deps: {
        inline: [
          /react-markdown/,
          /remark-.*/,
          /rehype-.*/,
          /unified/,
          /hast-.*/,
          /mdast-.*/,
          /micromark.*/,
          /unist-.*/,
          /vfile.*/,
          /lowlight/,
          /highlight\.js/,
          /bail/,
          /ccount/,
          /comma-separated-tokens/,
          /decode-named-character-reference/,
          /trim-lines/,
          /trough/,
          /zwitch/,
        ],
      },
    },
  },
})
