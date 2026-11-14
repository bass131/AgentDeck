const EXT_LANG: Record<string, string> = {
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  json: 'json',
  jsonc: 'json',
  md: 'markdown',
  markdown: 'markdown',
  html: 'html',
  htm: 'html',
  css: 'css',
}

export function languageFromPath(path: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(path)
  if (!match) return 'text'
  return EXT_LANG[match[1].toLowerCase()] ?? 'text'
}
