export const LSP_CHANNELS = {
  LSP_STATUS: 'lsp.status',
  LSP_HOVER: 'lsp.hover',
  LSP_DEFINITION: 'lsp.definition',
  LSP_SEMANTIC_TOKENS: 'lsp.semanticTokens',
  LSP_CACHED_TOKENS: 'lsp.cachedTokens',
} as const

export type LspStatus = 'unsupported' | 'starting' | 'ready' | 'error'

export interface LspPos {
  line: number
  character: number
}

export interface LspHoverResult {
  contents: string
}

export interface LspLocation {
  relPath: string
  line: number
  character: number
}

export interface LspSemanticTokens {
  data: number[]
  types: string[]
  mods: string[]
}

export interface LspDocReq {
  rootId: string
  relPath: string
}

export type LspPosReq = LspDocReq & {
  pos: LspPos
}
