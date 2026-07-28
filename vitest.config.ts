import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Phase 01: node 환경 단위 테스트. renderer 컴포넌트 테스트(Phase 05)는
// 파일 상단 `// @vitest-environment jsdom` 주석으로 개별 전환(jsdom 의존성 설치됨).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['99_Others/tests/**/*.test.ts', '99_Others/tests/**/*.test.tsx'],
    globals: false,
    // 테스트 격리 전역 게이트 (BZ P02 · 백로그 21①): 실행 전후로 `~/.agentdeck-dev` 를
    // 스냅샷·대조해 저장소 밖 쓰기가 남으면 red. 대상은 AGENTDECK_HOMEGUARD_DIR 로 주입 가능.
    // 한계(순 변화만 검출)는 99_Others/tests/_lib/homeGuard.ts 주석이 정본.
    globalSetup: ['99_Others/tests/globalSetup.ts'],
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
