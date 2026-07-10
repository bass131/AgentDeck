# Policies — 헌법 외부화 가이드 카탈로그

> 헌법(`../../CLAUDE.md`)은 **AI가 매 응답마다 떠올려야 할 절대 규칙**만 둡니다.
> *해당 작업 시점에만 참조하면 되는 정책·양식·운영 가이드*는 본 폴더로 분리합니다.
>
> **분리 원칙**: 헌법 = "*무엇을 절대 어기지 않는가*" / policies/ = "*그것을 어떻게 운영하는가*".
> 헌법과 본 폴더가 충돌하면 **헌법이 이깁니다** (단일 진실 공급원 룰).

---

## 정책 목록 (10개)

| 파일 | 한 줄 요약 | 헌법 참조 위치 |
|---|---|---|
| [`reporting-format.md`](reporting-format.md) | 5단계 보고 양식 (복잡 이상, 비동기 문서 박제) + MD/HTML 시각화 | "응대 원칙 / 작업 보고" |
| [`pin-and-done.md`](pin-and-done.md) | work-pin 압축본(5+1 필드) + -DONE.md 박제(복잡/대규모) + 세션 마감 권유 | "작업 좌표 + Phase 완료 박제" |
| [`doc-thresholds.md`](doc-thresholds.md) | 220줄·350줄 문서 세분화 + 단위 작업 비대 시 등급 재산정 | "문서 운영 / 문서 세분화" |
| [`grade-and-risk.md`](grade-and-risk.md) | 정량 4등급(단순/보통/복잡/대규모) + 위험 깃발(trust-boundary·backend-contract·irreversible·ui-visual·harness) 자동 상향 | "작업 등급" |
| [`subagent-routing.md`](subagent-routing.md) | SubAgent 9역할 라우팅 + 자동 호출 + 엔진별 모델 티어 에스컬레이션 | "SubAgent 풀" |
| [`review-tiering.md`](review-tiering.md) | 3-Tier 리뷰 + Tier 2 = reviewer + plan-auditor 두 SubAgent | "SubAgent 풀 / 자동 호출 트리거" |
| [`pr-and-merge-gate.md`](pr-and-merge-gate.md) | PR 생성/머지 = irreversible 깃발 + 사용자 명시 GO + admin bypass 예외 경로(솔로 휴면) | "확신이 없을 때 / PR 게이트" |
| [`loop-driver.md`](loop-driver.md) | 루프 엔진(내장 /loop+Workflow) + v1 attended + done 판사=CI + 세션 2종 | "운영 모드" |
| [`work-judge.md`](work-judge.md) | 3버킷 판정자(a 기계 / b 취향·육안 / c 판단·비가역) + 깃발→버킷 매핑 | "작업 등급 / 운영 모드" |
| [`review-throughput.md`](review-throughput.md) | 리뷰 처리량(예외기반·신뢰졸업·시선=max(위험,학습가치)) | "SubAgent 풀 / 운영 모드" |

> **스킵**: `knowledge-system.md` (AI 캐시 + GC) — 솔로 + self-reinforcement 위험 회피. 세션 경계 캐시는 memory(auto-memory `MEMORY.md`)가 담당.

---

## 추가 정책 발생 시

- 본 폴더에 `{topic}.md` 추가 → 본 `INDEX.md` 표에 한 줄 추가 → 헌법 참조 위치 명시.

## 폐기 시

- 파일 자체는 `git history`로 보존, INDEX에서 제거 → 헌법에서 해당 링크 제거.

---

## 갱신 이력

- 2026-06-26 — AgentDeck 이식 (ClaudeDev → manifest 기반). 정책 11개 중 `knowledge-system` 스킵(D1) → 10개 카탈로그. 경로·도메인·게임 흔적 정합. 헌법 참조 위치는 P2(CLAUDE.md 재작성) 시점 확정.
