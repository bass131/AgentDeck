# Phase 04: integration + e2e

## 목표
코드뷰어·마크다운·이미지·레퍼런스 폴더를 통합하고, Playwright e2e로 실제 Electron 런타임에서 검증. FEATURE_MAP M2 갱신.

## 담당 도메인 / 에이전트
통합(coordinator) + qa. 등급: 대규모 → plan-auditor 사전 + reviewer 통합.

## 의존 Phase
01, 02, 03.

## 위험 깃발
**trust-boundary** (전 읽기 경로 통합) → reviewer 무조건.

## 변경 대상
- 배선/정합만(각 도메인 경계 안). 구현 변경 필요 시 해당 Worker 위임.
- `tests/e2e/code-intel.e2e.ts` — echo 워크스페이스에 .ts/.md/.png/레퍼런스 픽스처 → 클릭별 올바른 뷰어 + 하이라이팅/렌더/프리뷰.
- `docs/FEATURE_MAP.md` — C2(구문)·C3·C6·C7·C8 상태 갱신.

## 작업 단계
1. 경계 정합: 새 채널(**`fs.read` 단일 채널**[text+binary] + `reference.*`)이 shared/preload/main/renderer 4면 정합. (`fs.readBinary` 없음)
2. `src/main/ipc/index.ts` 핸들러 카운트 주석 갱신("8채널" → 실제 수).
3. 뷰어 라우팅 통합(확장자→컴포넌트) 일관성.
4. e2e: 임시 워크스페이스 + 레퍼런스 폴더(env `AGENTDECK_E2E_REFERENCE`) → 파일 종류별 뷰어 검증.
5. FEATURE_MAP 갱신(C2는 **구문=M2✅ / 시맨틱=LSP 마일스톤** 분할 표기, C5 비고 "M2에서 분리") + reviewer 통합 점검.

## 완료조건 (AC)
- [ ] typecheck green · test 전체 PASS · build OK.
- [ ] e2e: 코드/마크다운/이미지/레퍼런스 각 뷰어 정상(`npm run test:e2e`).
- [ ] 경계 4면 정합(`fs.read` 단일 채널 + `reference.*`, reviewer 확인) · 신뢰경계 회귀 0 · CSP `img-src`/`connect-src` 회귀 0.
- [ ] FEATURE_MAP M2 갱신 — C2(구문)·C3·C6·C7·C8 ✅, C2 시맨틱/C5 LSP는 "분리(다음 마일스톤)" 표기.

## 참조
docs/PRD.md · docs/FEATURE_MAP.md · `.claude/agents/coordinator.md`(통합 검증) · M1 e2e `tests/e2e/core-loop.e2e.ts`(패턴).
