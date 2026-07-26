---
owner: 영호 (AI 초안 — 확정·ADR.md 반영은 영호 단독)
milestone: BF1-interrupt-loop
phase: 05
title: ADR-024 재고 초안 — 세션 기본값 held-open REPL → resume 전환
status: 반영 완료 (2026-07-01 — §8-A→ADR.md ADR-024 재고블록·제목표식, §8-B→REPL_TRANSITION.md 상태줄·§11. docs 커밋은 영호 승인 대기)
grade: 복잡 (설계분기 · human-gate)
date: 2026-07-01
summary: ADR-024가 replMode=true(held-open 지속세션)를 기본으로 채택했으나, PC 종료/절전에 held-open 프로세스가 증발해 영호가 "긴 주기·맥락끊김" 불편을 겪음. 기본값을 resume(파일 영속, ADR-023)으로 뒤집고 held-open은 빌트인 자율루프 옵트인으로 격하. ADR-024 자체 반영 형식(in-place 갱신 vs 새 ADR)은 영호 선택.
---

# P05 — ADR-024 재고 초안

> **성격**: AI 초안. 헌법상 ADR·docs는 영호 단독 → 이 문서는 *제안*이고, `00.Documents/ADR.md` 반영과 최종 문구는 영호가 확정한다.
> **근거 사슬**: P04 결정문(`_loop-session-decision.md`, 확정) + idle probe(7분 견딤) + ADR-024/023 원문 정독.

---

## §1. 무엇을 재고하나 (한 문장)

ADR-024가 정한 **"held-open 지속 세션(REPL)을 기본 활성(`replMode=true`)"** 을 뒤집어, **resume 기반 단발 세션(ADR-023)을 기본**으로 하고 held-open은 **빌트인 자율 루프가 필요할 때만 옵트인**으로 격하한다.

---

## §2. 왜 (재고 논거 — 추측 아닌 실측·원문 근거)

### 논거 1 — 영호 불편의 원인은 idle이 아니라 PC 종료/절전 (실측)
- ADR-024의 1차 메커니즘 self-re-arm은 "idle 타임아웃을 이기고 세션을 스스로 살림"이 목적. 그런데 **idle probe 결과 순수 SDK held-open은 7분 idle을 이미 견딤**(threw 0, turn2 정상) → idle은 애초에 큰 문제가 아니었음.
- 영호가 실제로 겪은 불편(30분~24시간 자리비움 후 "새 대화처럼 굼")의 원인 = **PC 종료/절전**. 이때 held-open은 **OS 프로세스가 통째로 사라지므로** self-re-arm 타이머도 함께 죽는다 → held-open은 이 시나리오에 **원리적으로 무력**.

### 논거 2 — ADR-024는 이미 resume 쪽으로 기울어 있음 (원문 근거)
- ADR-024 (4b)에서 watchdog auto-revive를 **드롭**하며 명시: *"맥락 복원은 자동 부활이 아니라 **다음 프롬프트의 resume**(ADR-023 session_id 영속)이 담당."* → 세션이 죽은 뒤의 복원 책임은 **이미 resume에 넘어가 있다**.
- 즉 held-open의 가치는 "죽지 않게 유지"인데, PC 종료 앞에서 그 전제가 깨지면 남는 건 resume뿐. 재고는 ADR-024의 *논리적 귀결*이지 방향 전환이 아니다.

### 논거 3 — resume는 파일 영속이라 PC 종료에 생존 (아키텍처)
- Claude Code 본가 방식 = 파일 기반 resume(JSONL을 디스크에 저장 → `--resume`/`--continue`). AgentDeck도 ADR-023에서 session_id 영속 + resume 매핑을 **이미 보유**.
- resume는 세션 상태를 디스크에 두므로 프로세스가 죽어도(=PC 종료) 다음 프롬프트에서 되살림. 영호 불편의 **직접 처방**.

### 논거 4 — 원본 충실도(ADR-013)와도 정합
- held-open REPL 채택의 명분 하나가 "원본 AgentCodeGUI는 CLI 인터랙티브(REPL)"였는데, **본가 Claude Code 자체가 파일 기반 resume**이다. resume 기본이 오히려 현행 Claude Code 동작과 일치.

---

## §3. held-open을 완전 제거하지 않는 이유 (옵트인 잔존)

- **빌트인 자율 루프(/loop·/goal 자기제어)** — Claude가 세션 안에서 `CronCreate/Update/Delete`·`ScheduleWakeup`·`Monitor`로 루프를 **스스로 갱신·종료**하는 기능은 held-open 세션이 있어야 상태가 보존됨(ADR-024 논거 ③: 외부 타이머 재생성은 매번 크론 상태 증발).
- 따라서 held-open은 **삭제가 아니라 옵트인**. 자율 루프를 명시적으로 켠 대화만 held-open, 평상시 대화는 resume 단발.
- 이는 P04 결정문 §B 결정1의 "held-open(REPL)은 빌트인 자율이 필요한 경우 옵트인으로 유지"와 일치.

---

## §4. 반영 형식 — 영호 선택 (설계 분기)

ADR 문서에 어떻게 새길지 두 안. 트레이드오프만 정리, 택1은 영호.

| | (A) ADR-024 in-place 갱신 | (B) 새 ADR-026 발행 (ADR-024 부분 supersede) |
|---|---|---|
| 방식 | ADR-024 하단에 "갱신(2026-07-01) — 기본값 재고" 블록 추가 (기존 (4a)/(4b) 갱신과 같은 스타일) | ADR-026 신규 "세션 기본값 = resume, held-open 옵트인" + ADR-024 상단에 "일부 supersede by ADR-026" 표기 |
| 장점 | 프로젝트 기존 관례와 일치(ADR-024는 이미 in-place 갱신 2회). 한 곳에서 REPL 역사 추적 | ADR 불변성(immutable+superseding) 정석. "기본값 뒤집기"라는 큰 결정을 독립 번호로 눈에 띄게 |
| 단점 | 기본값을 뒤집는 큰 결정이 갱신 블록에 묻힐 수 있음 | ADR-024를 매번 ADR-026과 교차 참조해야 함 |
| 추천 상황 | "ADR-024의 연장선"으로 볼 때 | "세션 아키텍처 방향 전환"으로 무겁게 볼 때 |

> AI 관점 추천: **(A) in-place 갱신** — ADR-024가 이미 (4b)에서 resume로 복원 책임을 넘겼으니, 기본값 전환은 그 귀결이라 같은 ADR 안에서 추적하는 게 역사적으로 읽기 좋음. 단 "큰 결정"으로 강조하고 싶으면 (B). **최종 판단 영호.**
>
> **✅ 영호 선택: (A) in-place 갱신 (2026-07-01).** ADR-024 하단에 "재고(2026-07-01)" 블록으로 추가. ADR.md에 붙일 완성 문구 = 아래 §8-A, REPL_TRANSITION 정합 = §8-B.

---

## §5. 영향 (구현 마일스톤 입력 — 이 Phase에선 문서만)

- **문서(P05 범위)**: `ADR.md` ADR-024 재고 반영(형식 §4) · `docs/REPL_TRANSITION.md` §9(옛 결론 폐기 명시)·§10.2(현 결론을 resume 기본으로 갱신) 정합.
- **코드(별도 구현 마일스톤 — 이 Phase 밖)**: `replMode` 기본값 `true`→`false`(runtime.ts) · held-open 옵트인 토글 UI 유지 · resume 경로 기본화(claudeAgentRun.ts·sdkOptions.ts) · session_id 영속 실작동 검증.

---

## §6. 미해결 (구현 마일스톤 1순위로 이월)

- **정확한 resume 버그**: session_id는 `panelSession.ts:256·217`에서 snapshot 영속 "설계"가 있으나 영호 경험상 PC 종료 후 실작동 X. 후보 ①snapshot 저장 타이밍(종료 시 flush 누락?) ②held-open 경로가 resumeSessionId 미사용. → 구현 착수 시 코드 실측으로 확정하고 고침. (P04에서 "지금 더 파기" 대신 "구현 때 검증"으로 영호가 ① 선택.)

---

## §7. 영호 확정 체크리스트

- [x] §1 재고 방향(resume 기본 / held-open 옵트인) 동의? — **영호 GO(P04 ①, 2026-07-01)**
- [x] §4 반영 형식: (A) in-place 갱신 / (B) 새 ADR-026 — **(A) 선택(2026-07-01)**
- [ ] §8 완성 문구 검토 → "이대로 반영" GO → AI가 `ADR.md`·`REPL_TRANSITION.md`에 §8 문구 반영 → 영호 최종 커밋.

---

## §8. 반영 완성 문구 (영호 "이대로 반영" GO 시 그대로 옮김)

> 아래 두 블록은 **바로 붙여넣을 수 있는 완성 문구**다. 영호가 문구를 수정하면 그 수정본이 최종. GO 전까지 `ADR.md`/`REPL_TRANSITION.md`는 미변경.

### §8-A. `00.Documents/ADR.md` — ADR-024 하단에 추가할 "재고(2026-07-01)" 블록

```markdown
**재고(2026-07-01) — 세션 기본값 전환: held-open REPL → resume (BF1 P05)**: 영호 실사용 불편(30분~24시간 자리비움 후 "새 대화처럼 맥락 끊김")의 원인을 **PC 종료/절전 → held-open 프로세스 증발**로 확정(idle 아님 — `bf1_idle_probe.mjs`: 순수 SDK held-open이 7분 idle 견딤, threw 0·turn2 정상). 1차 self-re-arm(198행)은 idle 만료를 이기려는 장치라 **프로세스째 사라지는 PC 종료엔 원리적으로 무력**. → **기본 세션 방식을 resume(ADR-023 디스크 세션 영속)으로 전환**하고, **held-open은 빌트인 자율 루프(/loop·/goal 자기제어)가 필요한 대화만 옵트인**으로 격하한다.
- **(4b)의 논리적 완결**: (4b)에서 이미 "맥락 복원 = 다음 프롬프트의 resume"로 복원 책임을 resume에 넘겼다. PC 종료 앞에서 held-open의 "세션 유지" 전제가 깨지면 남는 처방은 resume뿐 — 방향 전환이 아니라 (4b)의 귀결.
- **바뀌는 것 = 기본값뿐**: interrupt(3)·app-close(4a)·self-re-arm 메커니즘·GUI 토글·held-open 코드는 유효·잔존. `replMode` 활성 default만 held-open→resume으로 뒤집는다(코드 삭제 아님). loop은 빌트인 `/goal`·`/loop` + GUI 시각화(P04 결정문 §B 결정2).
- **코드 영향(별도 구현 마일스톤)**: `replMode` 기본값 true→false(renderer/ipc 활성화 층) · resume 경로 기본화 · held-open 옵트인 토글 유지 · **정확한 resume 버그 검증 1순위**(session_id snapshot 영속이 `panelSession.ts:256·217`에 설계돼 있으나 PC 종료 후 실작동 X — 후보 ①snapshot flush 타이밍 ②held-open 경로 resumeSessionId 미사용).
- **근거**: `01.Phases/BF1-interrupt-loop/_loop-session-decision.md`(P04 확정) + `_adr-024-rethink-draft.md`(P05).
```

> 추가로 ADR-024 제목 상태 표식(193행) 병기 제안: `✅채택·구현` → `✅채택·구현 (기본값 재고 2026-07-01 — resume 기본·held-open 옵트인)`.

### §8-B. `00.Documents/REPL_TRANSITION.md` — 정합 2곳

**(1) 문서 상단 상태 줄(5행) 교체:**

```markdown
> 단계: 설계(이 문서) → plan-auditor 감사 → go/no-go(✅ 사용자 GO 2026-06-26) → 구현. **상태: 구현 완료 · 기본값 재고(2026-07-01) — 기본은 resume(단발+ADR-023), held-open은 자율루프 옵트인(ADR-024 "재고 2026-07-01"·BF1 P05).** 백엔드·렌더러·app-close 빌드, watchdog auto-revive(4b) 드롭. 본 문서는 설계 근거 기록.
```

**(2) 문서 끝에 새 절 추가:**

```markdown
## 11. 기본값 재고 (2026-07-01 — BF1 P05, ADR-024 갱신 반영)
"UI 활성화 결정"의 **"REPL이 기본 모드(default persistent=true)"를 뒤집는다.** 근거: 영호 불편의 원인이 idle(§5 리스크)이 아니라 **PC 종료/절전에 held-open 프로세스 증발**로 확정(idle probe: 7분 견딤). 이 문서 "긴 주기 제약" 절에서 이미 "타이머+resume이 정답, 라이브 REPL은 긴 주기에 strictly worse"라 결론냈던 방향을 **세션 기본값 수준으로 승격**: 기본 = resume 단발(ADR-023), held-open = 빌트인 자율루프 옵트인. 문서 내부 어긋남("UI 활성화=REPL 기본" vs "긴 주기=타이머+resume 정답")도 이로써 resume 쪽으로 해소. 완성 결정 = ADR-024 "재고(2026-07-01)" 블록.
```

---

## §9. P05 다음 (영호 GO 후)

1. 영호 "이대로 반영" → AI가 §8-A를 `ADR.md`에, §8-B를 `REPL_TRANSITION.md`에 반영(docs 커밋은 영호 최종 승인 하에).
2. BF1 마일스톤 = 결정·문서까지 → P05 마감 후 **마일스톤 전체 1 PR**(push/PR=영호 게이트).
3. Loop 기능+resume 전환 **구현**은 별도 마일스톤(이 BF1 밖). 정확한 resume 버그 검증이 그 1순위.
