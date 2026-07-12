### ADR-012: 코드 인텔리전스 스택 — CodeMirror 6 + react-markdown (M2)
**결정**: 코드뷰어=**CodeMirror 6**(읽기전용, Darcula 테마), 마크다운=**react-markdown + remark-gfm + rehype-highlight + highlight.js**, 이미지=data URL `<img>`. `fs.read` 단일 채널(text+binary)로 뷰어 라우팅. 원본 AgentCodeGUI와 동일 스택.
**이유**: 원본 충실도 + 성숙한 React 생태계. 마크다운 신뢰경계(rehype-raw 미사용·data URL만·CSP img-src/connect-src/object-src).
**트레이드오프**: highlight.js 문법 번들(~750KB) → 데스크톱 앱 허용. **시맨틱 토큰(LSP 호버/정의이동)은 M2-LSP 마일스톤으로 분리**(typescript-language-server/pyright) → **ADR-017로 구현 완료**(Phase 27, 커밋 4f7a606: LSP hover/definition/semanticTokens, 실 TS LSP 라이브 PASS).

