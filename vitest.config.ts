import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['99_Others/tests/**/*.test.ts', '99_Others/tests/**/*.test.tsx'],
    globals: false,
    globalSetup: ['99_Others/tests/globalSetup.ts'],
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
