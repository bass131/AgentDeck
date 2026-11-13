import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve(__dirname, '02_Project/00_Source/main'),
        '@shared': resolve(__dirname, '02_Project/00_Source/shared')
      }
    },
    build: {
      lib: { entry: resolve(__dirname, '02_Project/00_Source/main/index.ts') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@preload': resolve(__dirname, '02_Project/00_Source/preload'),
        '@shared': resolve(__dirname, '02_Project/00_Source/shared')
      }
    },
    build: {
      lib: { entry: resolve(__dirname, '02_Project/00_Source/preload/index.ts') }
    }
  },
  renderer: {
    root: resolve(__dirname, '02_Project/00_Source/renderer'),
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '02_Project/00_Source/shared'),
        '@renderer': resolve(__dirname, '02_Project/00_Source/renderer/src')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, '02_Project/00_Source/renderer/index.html')
      }
    },
    plugins: [react()]
  }
})
