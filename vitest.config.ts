import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['02_Project/01_TestCode/**/*.test.ts', '02_Project/01_TestCode/**/*.test.tsx'],
    globals: false,
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
