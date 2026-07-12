# HR1-harness-renewal — 하네스 전면 리뉴얼 (마일스톤 계획)

> **작성**: 2026-07-12 (영호 결정·메인 세션 설계, secretary 배치) · **개정 v2**: 2026-07-12 Codex adversarial review(No-ship) 반영 — 7→6 Phase 재편
> **등급**: 대규모 (하네스 전 영역 + 비가역 1건 + 헌법·ADR 연동)
> **브랜치**: `feature/hr1-harness-renewal`

---

## 🎯 목표

하네스를 **3층 구조**로 재설계한다:

```
[공통 코어 — 엔진 중립 정본]  00.Documents/harness/ (신설)
  안전 규칙의 의미: 신뢰경계 · 비가역 사람 게이트 · TDD · 시크릿 · 파괴명령 · 보고/등급 의미
  + clause ID·버전 + machine-readable manifest (어댑터 정합을 기계로 강제)
        │
        ├─ [Claude 어댑터]  CLAUDE.md + .claude/** — 현행 유지(실전 검증) + 관측성 리뉴얼
        │                   멀티에이전트 조직론(Supervisor·워커 함대)은 Claude 전용 층으로 명시
        │
        └─ [Codex 경량 어댑터]  AGENTS.md + .codex/** — 전담 보조(리뷰·진단·rescue) 계약으로 축소
                                Supervisor 전임 폐기(Sol 직접 작업) · 최소권한 프로필 신설 · 원자 전환
```

## 🤔 배경 (영호 결정 2026-07-12)

- **Codex 역할 = 특정 용도 전담 보조** — "Codex 5.6 Sol을 직접 써보고 싶다"가 원 의도였는데, 이식 과정에서 Claude의 *운영 조직론*(Supervisor 전임·워커 9종·비용 계층)까지 통째로 복제되어 의도와 어긋남.
- **양쪽 공통 코어 재설계** — 같은 안전 의미가 CLAUDE.md와 AGENTS.md 두 곳에 적혀 있어 드리프트가 구조적으로 재발(H3 결함 ①의 원인). 코어를 엔진 중립 위치로 추출해 원인을 제거.
- **관측성 통증** — 훅이 echo>&2로만 말해서 사용자 눈에 안 보임(공식 확정: PreToolUse/PostToolUse의 stderr는 debug 로그 전용, 사용자 표시는 JSON `systemMessage`가 공식 수단).
- **ADR 비대** — ADR.md 460줄·33건 단일 파일 → 하위 파일 세분화(영호 신규 요구).

## H3 안건 흡수 매핑

| H3 안건 | HR1 처리 |
|---|---|
| ① Supervisor/Secretary 문서 드리프트 (bcfdcb5 실증) | P02 코어 추출(+conformance manifest) + P03/P05 어댑터화로 원인 제거 |
| ② 브리지 5종 stash@{0} 편입 | **편입 아닌 폐기 권고** — P05에서 OID 고정 처분 (아래 "stash 처분" 참조) |
| ③ agent-runs.ts 주석 라인참조 부식 | P06 잡정리 (main-process Worker) |
| ④ guard-blocks.log 여부 | **채택** — P04 관측성 층으로 승격 (보안·동시성 요건 포함) |
| (+) CLAUDE.md REPL_TRANSITION stale 줄 | P03에서 정정 |

## stash 처분 권고 (P05 게이트 — OID 고정)

`source-command-*` 5종(449줄)은 실측 결과 **얇은 래퍼가 아니라 Claude 커맨드 본문의 복제 포크**(존재하지 않는 `.Codex/policies/` 경로 참조 등 기계 이식 흔적 포함) — AGENTS.md §2 "브리지는 래퍼만, 본문은 정본 참조" 계약을 스스로 위반하는 드리프트 제조기. 2026-07-11 "8→13 확장 편입" 결정은 *Codex = 풀 드라이버* 전제였고 그 전제가 철회됨 → **폐기 권고, P05에서 영호 최종 재확인 후 drop(비가역)**.

**불변 앵커(2026-07-12 박제)**: stash 커밋 OID `99704c1bce265280b0ea36f8636aa92cfb4d4926` — drop은 위치 참조(`stash@{0}`)가 아니라 이 OID와의 일치 재검증 후에만 (Codex adversarial [high]#2 반영).

## Phase 구성 (6개 — v2 재편: 구 P05+P06 합병)

| # | 제목 | 등급 | loop_track | 의존 |
|---|---|---|---|---|
| 01 | ADR 세분화 — `00.Documents/adr/` 구조 전환 | 보통 | human-gate | — |
| 02 | 3층 구조 설계 박제 + 공통 코어 추출 (+clause ID·manifest) | 복잡 | human-gate | 01 |
| 03 | Claude 어댑터 정합 (CLAUDE.md·policies 참조화) | 복잡 | human-gate | 02 |
| 04 | 훅 관측성 리뉴얼 (systemMessage + guard-blocks.log, 보안·동시성 포함) | 복잡 | human-gate | — (02와 병렬 가능) |
| 05 | **Codex 전담 보조 원자 전환** (계약+기계장치+최소권한 프로필, 단일 green 커밋) | 대규모+irreversible | human-gate | 02 |
| 06 | 통합 검증 · 잡정리 · 마감 (+conformance 게이트) | 보통 | auto-gate (PR만 human) | 03·04·05 |

**병렬 가능**: P03 ↔ P04 ↔ P05 (상호 의존성 없음 — 단, 전부 attended 유지보수 창을 공유하므로 실무는 순차 가능성 높음).
**원자성 원칙(v2)**: 구 "P05→P06 연속 처리(중간 RED 허용)" 설계는 폐기 — Codex 전환은 P05 안에서 **단일 green 커밋**으로 완결하며, 어떤 중단 지점에서도 커밋된 하네스는 green이다.

## 실행 방식 (하네스 특례)

- 하네스·헌법·ADR = **영호 단독 통제** → 실행 Phase(P01~P05)는 **유지보수 창 개방 하에 메인 직접 + 영호 감독** (선례: 2026-07-11 shell-policy 건).
- Phase 문서·pin·CHANGELOG·커밋 = secretary. 제품 코드(P06 agent-runs.ts 주석) = main-process Worker.
- 결정 박제: 신규 ADR(하네스 3층 구조 — P02) + ADR-033(Codex 하네스) 개정(P05 착지 — plan-auditor 🔴#1).
- 모든 Phase가 `harness` 위험 깃발 대상 → CHANGELOG [H] 의무.

## ✅ 마일스톤 완료 조건

- [ ] 공통 코어 정본 존재 + **clause ID·버전·manifest로 양 어댑터 매핑** — 동일 의미 이중 서술 0, 미매핑 조항 0
- [ ] 훅 발화·차단이 사용자에게 보임(라이브 프로브) + guard-blocks.log 기록(allowlist·redaction·동시성 테스트 포함)
- [ ] Codex 계약 = 전담 보조(Supervisor 전임 조항 부재) + 최소권한 프로필 + negative canary PASS, 전환은 단일 green 커밋
- [ ] ADR 개별 파일 구조 + 인덱스, 참조 파손 0
- [ ] 제품 게이트 무영향: typecheck 0 · vitest green · lint 0
- [ ] conformance 게이트 green (P06)
- [ ] HR1-DONE.md + HTML 종합 보고(대규모) + CHANGELOG [H] + PR(영호 게이트)

## plan-auditor 검증 기록 (2026-07-12)

조건부 GO(🔴 1 · 🟡 6) → 🔴#1(ADR-033 개정 태스크 미착지)은 P05 작업·완료 조건에 즉시 봉합. 🟡 반영(구 7-Phase 번호 — v2 신 번호로는 각각 P05-D·P06): P06 수치 정정(#1) · P07 reviewer 1패스(#2) · P04 log-only 분기(#3) · P04 테스트 대상 명시(#4) · P05 아카이브 선택지(#6) · P03 Codex 언급 스캔(부수 권고). 🟡#5(P04 입자 2~4h)는 응집도 사유로 분할 없이 유지. 배경 주장 3건(ADR 460줄·33건 / stash 5종 449줄 / agent-runs.ts 라인참조 부식) 전부 auditor 디스크 실측 일치 확인.

## Codex adversarial review 반영 기록 (2026-07-12, v2 재편)

GPT 5.6 Sol 적대 리뷰 판정 **No-ship**(high 4 · medium 2) → 전건 반영:

| # | 심각도 | 지적 | 반영 |
|---|---|---|---|
| 1 | high | Codex 직접 실행이 유일한 강제 권한 경계를 제거 (deny가 위임 프로필에만 존재) | P05-B: 최소권한 기본 프로필 신설 + negative canary 유지·강화. sandbox 마찰로 불가 시 보상 통제 명시 기록 |
| 2 | high | 가변 `stash@{0}` 참조가 다른 stash를 삭제 가능 | OID `99704c1b...` 불변 앵커 박제 + drop 직전 일치 재검증 + 복구점 절차 (P05-C) |
| 3 | high | P05가 계약 테스트 RED 상태를 커밋하도록 설계됨 | **구 P05+P06 합병 → 단일 green 커밋 원자 전환** (7→6 Phase 재편) |
| 4 | high | 공통 코어가 어댑터 정합을 강제하지 않아 드리프트 재발 | P02: clause ID·버전 + machine-readable manifest / P06: conformance 게이트 기계화 |
| 5 | medium | guard-blocks.log 시크릿 노출·동시성 유실 미방지 | P04: allowlist·redaction·append 직렬화·rotation 원자성 + 보안·동시성 테스트 완료 조건화 |
| 6 | medium | 관측성 완료 조건이 사용자 비가시 상태를 성공 처리 | P04: 차단형도 PreToolUse JSON permissionDecision+systemMessage 가시화 라이브 검증, 미지원 = 성공이 아니라 영호와 범위 축소 확정 |

재검증(2026-07-12): plan-auditor v2 판정 **GO**(🔴 0 · 🟡 4) — manifest 생애주기 sync 계약(P04/P05 완료 조건 추가)·P04 함정 v1 잔재 정정·v1 기록 번호 주석·P05 rollback에 stash 예외 병기, 전건 즉시 반영. stash OID 앵커는 auditor 실측 일치 확인.
