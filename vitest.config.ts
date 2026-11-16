import { resolve } from 'path'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@main': resolve(__dirname, '02_Project/00_Source/main'),
      '@preload': resolve(__dirname, '02_Project/00_Source/preload'),
      '@renderer': resolve(__dirname, '02_Project/00_Source/renderer/src'),
      '@shared': resolve(__dirname, '02_Project/00_Source/shared')
    }
  },
  test: {
    environment: 'node',
    include: ['02_Project/01_TestCode/**/*.test.ts', '02_Project/01_TestCode/**/*.test.tsx'],
    globals: false,
    // 이 기계의 콜드 import(렌더러 마크다운 스택)가 기본 5초를 넘어 시간 초과한다 — M05 Backlog 57, M06 G3 [USER]
    testTimeout: 30000,
    globalSetup: ['02_Project/01_TestCode/globalSetup.ts'],
    css: false,
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
