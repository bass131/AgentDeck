# Phase 02: markdown-and-image

## 목표
`.md` 파일은 **react-markdown + remark-gfm**로 렌더(코드블록은 highlight.js), 이미지 파일은 프리뷰로 표시. AgentCodeGUI 스택 일치.

## 담당 도메인 / 에이전트
shared-ipc + main-process + renderer. 등급: 복잡.

## 의존 Phase
01 (뷰어 표시 영역 + fs.read).

## 위험 깃발
**trust-boundary** (이미지 바이너리 읽기 — untrusted 경로) → reviewer 무조건.

## 변경 대상
- (채널 신설 없음) **Phase 01의 `fs.read` 단일 채널 `asBinary:true` 분기 사용** — `fs.readBinary` 별도 채널 만들지 말 것(계약 단일화, plan-auditor 🔴).
- `src/main/ipc/index.ts` — `fs.read` 바이너리 분기 구현(resolveSafe + 이미지 확장자/크기 화이트리스트 → `{kind:'binary', dataUrl, mime}`).
- `src/renderer/src/components/MarkdownView.tsx` — react-markdown + remark-gfm. 코드블록 highlight.js. **신뢰경계**: 위험 HTML 비활성(rehype-raw 미사용 또는 sanitize), 외부 리소스 로딩 주의(CSP 정합).
- `src/renderer/src/components/ImagePreview.tsx` — data URL 이미지 표시(확대/맞춤).
- 뷰어 라우팅: 파일 확장자 → CodeViewer / MarkdownView / ImagePreview 선택.
- 의존성: `react-markdown remark-gfm highlight.js` (+ 필요 시 `rehype-highlight`).

## 작업 단계
1. shared: 바이너리 읽기 계약 + preload 노출.
2. main: 바이너리 핸들러(이미지 확장자 화이트리스트 png/jpg/gif/webp/svg, 크기 상한, resolveSafe).
3. renderer: MarkdownView(react-markdown+remark-gfm, 코드블록 하이라이트, HTML sanitize) + ImagePreview.
4. 뷰어 라우팅 — 확장자별 컴포넌트 선택(.md→Markdown, 이미지→Preview, 그 외→CodeViewer).
5. 안티슬롭 + CSP/신뢰경계(마크다운 내 임의 스크립트/외부 로드 차단).

## 완료조건 (AC)
- [ ] typecheck green · test PASS · build OK.
- [ ] 마크다운 XSS/위험 HTML 비활성 테스트(스크립트 주입 무력화).
- [ ] **마크다운 원격 리소스 차단 테스트** — 원격 `<img src="http://...">`/외부 링크 자동요청이 sanitize 또는 CSP(`index.html` `img-src`/`connect-src` 'self' 유지, 회귀 0)로 봉쇄됨(스크립트와 별개 SSRF/트래킹 벡터, plan-auditor 🔴).
- [ ] 이미지 확장자 화이트리스트 + 크기 상한 + 경로 탈출 거부 테스트.
- [ ] renderer fs 직접 0 · 채널 하드코딩 0 · 인라인 색상 0.
- [ ] e2e: .md 파일 → 렌더된 마크다운, 이미지 파일 → 프리뷰 표시.

## 참조
docs/UI_GUIDE.md · CLAUDE.md(신뢰경계·키) · src/renderer index.html CSP · M1 resolveSafe.
