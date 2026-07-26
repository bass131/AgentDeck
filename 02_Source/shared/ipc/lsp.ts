/**
 * ipc/lsp.ts — LSP(Language Server Protocol) 도메인 채널·타입 계약 (M2-LSP — 27a 계약)
 *
 * 채널: LSP_STATUS · LSP_HOVER · LSP_DEFINITION · LSP_SEMANTIC_TOKENS · LSP_CACHED_TOKENS
 * 구현 위치: main-process 담당 (이 파일은 *정의*만 — 핸들러 로직 없음).
 */

// ── 채널명 상수 ──────────────────────────────────────────────────────────────

export const LSP_CHANNELS = {
  /**
   * LSP 서버 상태 조회 (invoke).
   * 요청: LspDocReq (rootId + relPath). 응답: LspStatus.
   *
   * CRITICAL(신뢰경계): rootId 는 등록 루트 ID(WORKSPACE_ROOT_ID 또는 reference.add 발급).
   * main이 roots.ts 게이트로 rootId→실경로 조회, workspace.ts resolveSafe로 relPath 해석.
   * 미등록 rootId·경로 탈출('..'/절대경로) → 'unsupported' 응답.
   */
  LSP_STATUS: 'lsp.status',
  /**
   * LSP 호버 정보 조회 (invoke).
   * 요청: LspPosReq (rootId + relPath + pos). 응답: LspHoverResult | null.
   *
   * CRITICAL(신뢰경계): relPath 는 rootId 게이트 + resolveSafe 검증(절대경로/탈출 차단).
   * renderer가 cwd/절대경로를 주입할 수 없다 — rootId + 상대경로만 허용.
   */
  LSP_HOVER: 'lsp.hover',
  /**
   * LSP 정의 이동 조회 (invoke).
   * 요청: LspPosReq. 응답: LspLocation[] (워크스페이스 상대경로만 — 밖 결과 제외).
   *
   * CRITICAL(신뢰경계): LspLocation.relPath 는 절대경로 아님 — 워크스페이스 내부만.
   * main이 LSP 서버 반환 절대경로를 역변환하여 워크스페이스 밖이면 결과에서 제외한다.
   */
  LSP_DEFINITION: 'lsp.definition',
  /**
   * LSP 시맨틱 토큰 요청 (invoke, 라이브 분석).
   * 요청: LspDocReq. 응답: LspSemanticTokens | null.
   */
  LSP_SEMANTIC_TOKENS: 'lsp.semanticTokens',
  /**
   * LSP 시맨틱 토큰 캐시 조회 (invoke, 인메모리 캐시 즉시 반환).
   * 요청: LspDocReq. 응답: LspSemanticTokens | null (캐시 없으면 null).
   * renderer가 파일 오픈 직후 캐시를 즉시 색칠하고, ready 후 라이브 갱신하는 패턴.
   */
  LSP_CACHED_TOKENS: 'lsp.cachedTokens',
} as const

// ── LSP 타입 ──────────────────────────────────────────────────────────────────

/**
 * LSP 서버 상태.
 *
 * - 'unsupported': 파일 확장자에 대응하는 LSP 서버가 없거나 rootId 미등록/탈출 검증 실패.
 * - 'starting':    서버 spawn 후 초기화(initialize/initialized) 진행 중.
 * - 'ready':       서버가 준비 완료 — hover/definition/semanticTokens 응답 가능.
 * - 'error':       spawn 실패 또는 서버 crash. main이 좀비 방지 후 killTree 처리.
 *
 * CRITICAL(신뢰경계): main이 rootId+relPath를 roots.ts/workspace.ts resolveSafe로 검증.
 * 미등록 rootId 또는 relPath 탈출('..'/절대경로) → 'unsupported' 응답(오류 은닉).
 */
export type LspStatus = 'unsupported' | 'starting' | 'ready' | 'error'

/**
 * LSP 문서 내 위치 (0-based line/character — LSP 프로토콜 표준).
 *
 * line:      0-based 라인 번호.
 * character: 0-based 열(UTF-16 code unit 오프셋 — LSP 표준).
 */
export interface LspPos {
  /** 0-based 라인 번호 */
  line: number
  /** 0-based 열(UTF-16 code unit 오프셋) */
  character: number
}

/**
 * LSP 호버 응답 — 마크다운 문자열.
 *
 * contents: 마크다운 형식의 심볼 정보 (타입·문서 주석 등).
 * renderer는 react-markdown으로 렌더링한다.
 *
 * CRITICAL(신뢰경계): LSP 서버가 반환한 raw 내용을 그대로 전달 — XSS 방지는 renderer 담당.
 */
export interface LspHoverResult {
  /** 마크다운 형식의 호버 내용 */
  contents: string
}

/**
 * LSP 정의 위치 — **워크스페이스 상대경로**만 포함.
 *
 * CRITICAL(신뢰경계): 절대경로 미포함. main이 LSP 서버 반환 절대경로를 역변환하여
 * 워크스페이스 내부(rootId 기준 resolveSafe 검증 통과) 파일만 포함한다.
 * 워크스페이스 밖(node_modules .d.ts 등)은 결과에서 제외(graceful no-op).
 *
 * relPath: rootId 기준 상대 POSIX 경로.
 * line/character: 0-based 정의 위치 (LspPos 동일 규약).
 */
export interface LspLocation {
  /** 워크스페이스(rootId) 기준 상대 경로 — 절대경로 아님 */
  relPath: string
  /** 0-based 라인 번호 */
  line: number
  /** 0-based 열 */
  character: number
}

/**
 * LSP 시맨틱 토큰 결과.
 *
 * data:  LSP 표준 시맨틱 토큰 인코딩 — 5개 숫자씩 [deltaLine,deltaStartChar,length,tokenType,tokenMods].
 * types: 토큰 타입 범례 (LSP 서버 capability SemanticTokensLegend.tokenTypes).
 * mods:  토큰 수정자 범례 (SemanticTokensLegend.tokenModifiers).
 *
 * renderer(CodeMirror)는 data를 디코딩해 types/mods로 CSS 클래스를 매핑한다.
 */
export interface LspSemanticTokens {
  /** LSP 인코딩 시맨틱 토큰 (5개 씩, deltaLine·deltaStartChar·length·tokenType·tokenMods) */
  data: number[]
  /** 토큰 타입 범례 (SemanticTokensLegend.tokenTypes 순서) */
  types: string[]
  /** 토큰 수정자 범례 (SemanticTokensLegend.tokenModifiers 순서) */
  mods: string[]
}

// ── lsp 요청 타입 ─────────────────────────────────────────────────────────────

/**
 * LSP 문서 요청 기반 타입 (status·semanticTokens·cachedTokens 공용).
 *
 * CRITICAL(신뢰경계): rootId는 WORKSPACE_ROOT_ID('workspace') 또는 reference.add 발급 ID.
 * **cwd·절대경로 필드 없음** — rootId+relPath 조합만 허용.
 * main이 roots.ts 게이트로 rootId→실경로 조회, workspace.ts resolveSafe(rootEntry.path, relPath)로
 * 절대경로 해석. 미등록 rootId 또는 relPath가 루트 밖이면 요청 차단(status:'unsupported'/null 반환).
 * fs.read IPC(ipc/index.ts:371~387)와 동일 게이트 — 우회 경로 없음.
 */
export interface LspDocReq {
  /**
   * 등록 루트 ID (WORKSPACE_ROOT_ID 또는 reference.add 발급 id).
   * renderer가 임의 경로 문자열을 이 필드에 주입해도 레지스트리 조회 실패로 차단된다.
   */
  rootId: string
  /**
   * 루트 기준 상대 경로 (untrusted).
   * main이 resolveSafe로 검증 — '..'·절대경로 탈출은 null 반환으로 차단.
   */
  relPath: string
}

/**
 * LSP 위치 포함 요청 타입 (hover·definition 공용).
 * LspDocReq를 확장하여 문서 내 커서 위치(pos)를 추가한다.
 */
export type LspPosReq = LspDocReq & {
  /** 요청할 커서 위치 (0-based line/character) */
  pos: LspPos
}
