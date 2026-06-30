import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// main / preload / renderer 3 타깃 번들 (docs/ARCHITECTURE.md).
// externalizeDepsPlugin: node 네이티브/무거운 의존을 번들에서 제외(main·preload).
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, '02.Source/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, '02.Source/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, '02.Source/renderer'),
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '02.Source/shared'),
        '@renderer': resolve(__dirname, '02.Source/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, '02.Source/renderer/index.html')
      }
    },
    plugins: [react()]
  }
})
