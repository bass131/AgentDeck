---
description: 현재 변경(diff)을 헌법 CRITICAL + ARCHITECTURE + ADR + 테스트 기준으로 규칙 점검. reviewer 에이전트 호출.
---

# /review — 규칙 기반 리뷰

현재 작업 트리의 변경을 AgentDeck 규칙에 맞춰 자동 점검한다. `reviewer` 서브에이전트(Tier 2-A)를 호출한다.

## 절차
1. `git diff` + 변경 파일 목록 수집(스테이지/언스테이지 모두).
2. `reviewer` 에이전트에 위임 — 입력: `range`(또는 변경 파일), `diff_summary`, 추정 `grade`, 위험 `flags`.
3. reviewer가 점검 축 1~8 적용 → 🔴 위반 / 🟡 개선 보고.

## 점검 축 (reviewer.md 정합)
1. **신뢰 경계**(CRITICAL) — renderer 직접 권한작업? preload 통째 노출? nodeIntegration/contextIsolation?
2. **엔진 추상화**(CRITICAL) — 구체 엔진 직접 분기? raw 출력 누수? registry 우회?
3. **IPC 계약 단일화**(CRITICAL) — 채널명 하드코딩? shared/main/preload/renderer 4면 정합?
4. **API 키/시크릿**(CRITICAL) — 평문 저장?
5. **ARCHITECTURE 구조** — 디렉토리 경계? 도메인 영역 침범?
6. **ADR 스택** — 비승인 라이브러리? 결정 스택 이탈?
7. **테스트 정합(TDD)** — 새 기능 테스트 동반? 신뢰경계 케이스? 어댑터 골든?
8. **모델 ID/SDK 최신성** — 옛 Anthropic 모델 ID? claude-api 미참조?

## 출력 (reviewer 양식)
```
🔍 Reviewer 점검
🔴 위반 (N): [축<n>] <파일:줄> — <위반> → <담당 Worker>
🟡 개선 (N): [축<n>] <파일:줄> — <제안>
판정: 통과 / 위반 N개(재작업)
```

## 규칙
- reviewer는 **코드 수정 X** — 위반 보고만. 수정은 담당 도메인 Worker.
- CRITICAL 위반은 완화 없이 🔴. 헌법/ADR 변경 권고는 사용자에게.
