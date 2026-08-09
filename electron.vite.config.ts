import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, '02_Source/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: { entry: resolve(__dirname, '02_Source/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, '02_Source/renderer'),
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '02_Source/shared'),
        '@renderer': resolve(__dirname, '02_Source/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, '02_Source/renderer/index.html')
      }
    },
    plugins: [react()]
  }
})
