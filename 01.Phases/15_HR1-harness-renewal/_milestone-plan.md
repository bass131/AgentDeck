# HR1-harness-renewal — 하네스 전면 리뉴얼 (마일스톤 계획)

> **작성**: 2026-07-12 (영호 결정·메인 세션 설계, secretary 배치)
> **등급**: 대규모 (하네스 전 영역 + 비가역 1건 + 헌법·ADR 연동)
> **브랜치**: `feature/hr1-harness-renewal`

---

## 🎯 목표

하네스를 **3층 구조**로 재설계한다:

```
[공통 코어 — 엔진 중립 정본]  00.Documents/harness/ (신설)
  안전 규칙의 의미: 신뢰경계 · 비가역 사람 게이트 · TDD · 시크릿 · 파괴명령 · 보고/등급 의미
        │
        ├─ [Claude 어댑터]  CLAUDE.md + .claude/** — 현행 유지(실전 검증) + 관측성 리뉴얼
        │                   멀티에이전트 조직론(Supervisor·워커 함대)은 Claude 전용 층으로 명시
        │
        └─ [Codex 경량 어댑터]  AGENTS.md + .codex/** — 전담 보조(리뷰·진단·rescue) 계약으로 축소
                                Supervisor 전임 폐기(Sol 직접 작업) · 기계장치 대폭 경량화
```

## 🤔 배경 (영호 결정 2026-07-12)

- **Codex 역할 = 특정 용도 전담 보조** — "Codex 5.6 Sol을 직접 써보고 싶다"가 원 의도였는데, 이식 과정에서 Claude의 *운영 조직론*(Supervisor 전임·워커 9종·비용 계층)까지 통째로 복제되어 의도와 어긋남.
- **양쪽 공통 코어 재설계** — 같은 안전 의미가 CLAUDE.md와 AGENTS.md 두 곳에 적혀 있어 드리프트가 구조적으로 재발(H3 결함 ①의 원인). 코어를 엔진 중립 위치로 추출해 원인을 제거.
- **관측성 통증** — 훅이 echo>&2로만 말해서 사용자 눈에 안 보임(공식 확정: PreToolUse/PostToolUse의 stderr는 debug 로그 전용, 사용자 표시는 JSON `systemMessage`가 공식 수단).
- **ADR 비대** — ADR.md 460줄·33건 단일 파일 → 하위 파일 세분화(영호 신규 요구).

## H3 안건 흡수 매핑

| H3 안건 | HR1 처리 |
|---|---|
| ① Supervisor/Secretary 문서 드리프트 (bcfdcb5 실증) | P02 코어 추출 + P03/P05 어댑터화로 원인 제거 |
| ② 브리지 5종 stash@{0} 편입 | **편입 아닌 폐기 권고** — P05에서 처분 (아래 "stash 처분" 참조) |
| ③ agent-runs.ts 주석 라인참조 부식 | P07 잡정리 (main-process Worker) |
| ④ guard-blocks.log 여부 | **채택** — P04 관측성 층으로 승격 |
| (+) CLAUDE.md REPL_TRANSITION stale 줄 | P03에서 정정 |

## stash@{0} 처분 권고 (P05 게이트)

`source-command-*` 5종(449줄)은 실측 결과 **얇은 래퍼가 아니라 Claude 커맨드 본문의 복제 포크**(존재하지 않는 `.Codex/policies/` 경로 참조 등 기계 이식 흔적 포함) — AGENTS.md §2 "브리지는 래퍼만, 본문은 정본 참조" 계약을 스스로 위반하는 드리프트 제조기. 2026-07-11 "8→13 확장 편입" 결정은 *Codex = 풀 드라이버* 전제였고 그 전제가 철회됨 → **폐기 권고, P05에서 영호 최종 재확인 후 drop(비가역)**.

## Phase 구성 (7개)

| # | 제목 | 등급 | loop_track | 의존 |
|---|---|---|---|---|
| 01 | ADR 세분화 — `00.Documents/adr/` 구조 전환 | 보통 | human-gate | — |
| 02 | 3층 구조 설계 박제 + 공통 코어 추출 | 복잡 | human-gate | 01 |
| 03 | Claude 어댑터 정합 (CLAUDE.md·policies 참조화) | 복잡 | human-gate | 02 |
| 04 | 훅 관측성 리뉴얼 (systemMessage + guard-blocks.log) | 복잡 | human-gate | — (02와 병렬 가능) |
| 05 | Codex 전담 보조 계약 재정의 (AGENTS.md + 브리지·stash 처분) | 복잡+irreversible | human-gate | 02 |
| 06 | Codex 기계장치 경량화 (TOML·doctor·계약테스트) | 복잡 | human-gate | 05 |
| 07 | 통합 검증 · 잡정리 · 마감 | 보통 | auto-gate (PR만 human) | 03·04·06 |

**병렬 가능**: P03 ↔ P04 ↔ P05 (상호 의존성 없음 — 단, 전부 attended 유지보수 창을 공유하므로 실무는 순차 가능성 높음).
**P05→P06 순서 주의**: P05에서 브리지를 줄이면 기존 "8종 정확 일치" 계약 테스트가 RED — P06 테스트 재작성까지 같은 브랜치 안에서 연속 처리(중간 게이트 없음).

## 실행 방식 (하네스 특례)

- 하네스·헌법·ADR = **영호 단독 통제** → 실행 Phase(P01~P06)는 **유지보수 창 개방 하에 메인 직접 + 영호 감독** (선례: 2026-07-11 shell-policy 건 — settings deny 임시 개방 → 수정 → 재봉인 → 라이브 프로브).
- Phase 문서·pin·CHANGELOG·커밋 = secretary. 제품 코드(P07 agent-runs.ts 주석) = main-process Worker.
- 결정 박제: 신규 ADR(하네스 3층 구조 — P02) + ADR-033(Codex 하네스) 개정(P05~P06 반영).
- 모든 Phase가 `harness` 위험 깃발 대상 → CHANGELOG [H] 의무.

## ✅ 마일스톤 완료 조건

- [ ] 공통 코어 정본 존재, CLAUDE.md/AGENTS.md가 코어를 참조(동일 의미 이중 서술 0)
- [ ] 훅 발화·차단이 사용자에게 보임(라이브 프로브) + guard-blocks.log 기록
- [ ] Codex 계약 = 전담 보조(Supervisor 전임 조항 부재), 기계장치 축소 후 자체 테스트·doctor green
- [ ] ADR 개별 파일 구조 + 인덱스, 참조 파손 0
- [ ] 제품 게이트 무영향: typecheck 0 · vitest green · lint 0
- [ ] HR1-DONE.md + HTML 종합 보고(대규모) + CHANGELOG [H] + PR(영호 게이트)

## plan-auditor 검증 기록 (2026-07-12)

조건부 GO(🔴 1 · 🟡 6) → 🔴#1(ADR-033 개정 태스크 미착지)은 P05 작업·완료 조건에 즉시 봉합. 🟡 반영: P06 수치 정정(#1) · P07 reviewer 1패스(#2) · P04 log-only 분기(#3) · P04 테스트 대상 명시(#4) · P05 아카이브 선택지(#6) · P03 Codex 언급 스캔(부수 권고). 🟡#5(P04 입자 2~4h)는 응집도 사유로 분할 없이 유지. 배경 주장 3건(ADR 460줄·33건 / stash 5종 449줄 / agent-runs.ts 라인참조 부식) 전부 auditor 디스크 실측 일치 확인.
