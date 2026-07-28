---
name: codegraph-update
description: CodeGraph 인덱스 명시적 증분 갱신(sync). 세션 시작 시·마일스톤 경계·대량 코드 변경 후, 또는 사용자가 "코드그래프 갱신/인덱스 업데이트"라고 할 때 사용. 구조 질의(codegraph-search) 전에 인덱스가 낡았다고 의심되면 먼저 이걸 실행. 최초 구축·복구는 codegraph-init이 짝.
---

> **갱신 정책 (영호 결정 2026-07-28)**: 자동 워처·데몬은 쓰지 않는다 — **명시 시점 갱신만**(세션 시작·마일스톤 경계). 업스트림 기본값은 상시 워처지만, 수동 `sync`는 "샌드박스·스크립팅 환경용" 공식 지원 경로다(README 확인). 상주 프로세스 0 원칙.

### 1. 전제 확인

```bash
ls .codegraph/codegraph.db
```

없으면 STOP — "인덱스가 없어요. codegraph-init으로 최초 구축부터 할까요?"라고 안내 (인덱싱 여부는 사용자 결정).

### 2. 증분 동기화

```bash
CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 npx -y @colbymchenry/codegraph@latest sync
```

### 3. 확인

```bash
CODEGRAPH_TELEMETRY=0 DO_NOT_TRACK=1 npx -y @colbymchenry/codegraph@latest status
```

`✓ Index is up to date` 확인 후 변경 규모(파일 수)를 한 줄로 보고하세요.

### 4. 실패 시 사다리 (순서대로, 각 1회)

1. 잠금 에러 → `unlock` 후 `sync` 재시도.
2. 그래도 실패 → codegraph-init(전체 재구축, 실측 ~3초라 부담 없음) 제안.
3. 재구축도 실패 → 도구 문제로 보고하고 **Grep/Read로 폴백** — 구조 질의를 막지 말 것.
