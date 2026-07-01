---
owner: 영호
milestone: LR2
title: loop 빌트인 GUI + replMode 기본값 전환 (LR1에서 분리)
status: deferred
grade: 대규모
summary: BF1 ADR-024 재고의 "resume 기본 전환 + loop 빌트인 GUI"를 구현하는 트랙. LR1(대화 기억 신뢰성)에서 분리됨 — 영호 기억 버그와 독립 확정(2026-07-01).
---

# LR2 — loop GUI + replMode 전환 (분리 트랙, 착수 보류)

> **분리 이력(2026-07-01)**: 원래 LR1에 묶여 있었으나, 영호 실버그(단일채팅 sessionId 저장 누락 + transcript 폴백 부재)가 **replMode/held-open과 무관**함이 3소스 검증으로 확정되며 LR2로 분리. 착수는 LR1(기억 신뢰성) 완료 후 영호 판단.

## Phase 목록 (LR1에서 이관, 재번호)
| # | 제목 | 등급 | 도메인 | risk | 근거 |
|---|---|---|---|---|---|
| 01 | replMode 기본값 전환 (held-open→resume) + 옵트인 토글 | 복잡 | renderer | — | ADR-024 재고(독립 명분: PC종료 생존·Claude Code 충실) |
| 02 | held-open 경로 resumeSessionId 배선 | 복잡 | agent-backend | backend-contract | 옵트인 held-open 재시작 생존 |
| 03 | loop GUI — 인디케이터 통합 + /goal 진행 카드 + 팔레트 | 복잡 | renderer | ui-visual | P04 §B 결정2(영호 확정) |
| 04 | held-open sessionKey 전환 안정화 (고아 세션 누수) | 복잡 | agent-backend | backend-contract | LR1 Phase03에서 이관(plan-auditor) — held-open 라이프사이클 |

## ⚠️ 착수 전 재검토 필요
- LR1이 transcript 폴백으로 "재시작 후 기억"을 이미 해결하면, **replMode 전환(01)의 긴급성**은 더 낮아짐. 착수 시 ADR-024 재고의 명분(효율·충실도)이 여전히 유효한지 영호와 재확인.
- Phase 02(held-open 배선)는 이미 배선 정상(적대 검증)이라 "검증+문서화"로 축소 가능.
- 상세 내용은 각 Phase 파일 참조(LR1 원본에서 이관).
