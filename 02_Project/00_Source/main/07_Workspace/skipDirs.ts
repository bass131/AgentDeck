export const SKIP_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', 'dist', 'out', 'build', 'coverage',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.parcel-cache', '.vite',
  '.idea', '.vs', '.gradle', 'bin', 'obj', 'target', 'vendor', '__pycache__',
  '.venv', 'venv', '.mypy_cache', '.pytest_cache', '.expo', 'Pods', '.dart_tool'
])

export const KEEP_DOT_DIRS = new Set(['.github', '.claude', '.vscode'])

export const MAX_FILES = 6000
