### ADR-029: 대화 기억 신뢰성 — resume 우선 + transcript 폴백 (모델 컨텍스트 ↔ 채팅 기록 분리) ⭐

**결정**: ADR-023(resume)을 보강 — `resumeSessionId`가 없을 때 최근 대화 transcript를 **모델 컨텍스트 창 예산 안에서** Claude prompt에 폴백 주입한다. resume(sessionId)을 **주수단**(서버측 세션·재전송0·ADR-013 충실)으로 유지하되, sessionId 없는 옛 대화·resume 실패 시 앱이 저장된 채팅 기록으로 맥락을 재구성한다. **모델 컨텍스트(모델에 실제 전달, 창으로 유계) ↔ 채팅 기록(전체 저장·표시, 무한 증가)을 분리**한다.

- **근본 문제(3소스 검증: 적대 코드-트레이스·계획 정독·Codex)**: `claudeAgentRun.ts:379`가 매 턴 마지막 user 메시지만 SDK에 보냄 → 모델 맥락 = **resume 단독 의존, transcript 폴백 전무**. sessionId 없는 옛 대화(fa9df22 이전)·cwd 불일치·세션 만료 시 조용한 기억상실("화면엔 보이는데 Claude가 기억 못 함"). 영호 실측 불편의 구조적 원인. (직접 원인인 단일채팅 sessionId 저장 누락은 `fa9df22`로 선수정.)
- **접근 = A(resume 주수단, 영호 확정)**: sessionId 있으면 resume(서버가 창 자동관리·압축). resume 자체는 서버가 관리하므로 클라이언트가 %로 제어 불가 — 우리가 양을 제어하는 건 폴백뿐. B안(앱이 항상 컨텍스트 소유)은 gap 소멸되나 매턴 재전송·충실도 이탈로 기각.
- **주입 범위 = 컨텍스트 창 기준(영호 정제)**: 고정 상수(8k) 아니라 모델별 창 크기 − 응답·시스템 여유분. 오래된 것부터 잘림(오버플로 불가). 기존 게이지(`lastContextWindow`) 인프라 재활용 + 사용자에게 모델 컨텍스트 % 가시화(배지).
- **위치**: main `claudeAgentRun` 어댑터 국소(history 이미 `_req.messages`에 옴 → **새 IPC 0**). 순수 함수 `buildModelContextPrompt`로 추출(단발·held-open 양 펌프 공용). 엔진별 prompt 포맷 상이 → 폴백도 어댑터 소유(Track2 Codex 각자).

**이유**: ① GUI 채팅 앱은 "화면에 보이면 기억한다"가 기본 기대 — resume-only는 말없이 깸. ② `fa9df22`(sessionId 저장)는 신규 대화만 구제, 옛 대화·resume 실패엔 안전망 없음(Codex 핵심 지적). ③ history가 이미 main에 있어 구현·비용 작음(새 IPC 0, 추가 LLM 0).

**트레이드오프 / 신뢰경계**: ① **ADR-013 순수 충실서 의도적 이탈** — 본가 CLI엔 없는 폴백. AgentDeck 확장(Zustand·JSON 영속 계열). ADR-023 resume은 주경로로 유지, 본 ADR이 폴백 보강(supersede 아님). ② ADR-003: prompt 포맷은 어댑터 자유(정규화는 AgentEvent *출력*, 입력 prompt는 어댑터 내부) — 폴백 국소 정합. ③ 신뢰경계: history는 renderer가 이미 보낸 messages(untrusted) → 폴백은 **user/assistant content만** 주입(시크릿·경로 주입 0, ADR-008). main 단독, 새 IPC 0. ④ **known-gap**: resume "성공했으나 빈 세션"(만료·cwd불일치)은 트리거(sessionId 유무)로 못 잡음 → cwd 안정화(LR1 Phase03)로 우선 방어, 완전해결 이연("sessionId 있음 ≠ 맥락 복원"). ⑤ 기각 대안: 고정8k(창 못 씀)·전체주입(오버플로)·B안(앱 소유)·요약(추가 LLM·후속 이월).

**완료조건(측정가능)**: ① 단위 — `buildModelContextPrompt` 골든(resumeSessionId 있음→마지막 메시지만·없음→프리앰블·창예산 초과 시 오래된 것 잘림·user/assistant만·degrade 경계). ② 양 펌프(`_runPump`·`_runPersistentPump`) 공용 헬퍼 경유 = 단발/held-open 대칭. ③ 라이브(LIVE_SDK) — sessionId 없는 대화 폴백 회상 + **멀티패널 resume 회귀 0**(공용 헬퍼 변경 방어). ④ typecheck·test green·lint 0 + reviewer(backend-contract) CRITICAL 0.

**위험도**: [M] — 어댑터 prompt 빌드 변경(전 Claude 경로 영향) — 단발/held-open 대칭 + 회귀 e2e로 방어.

**후속 (2026-07-02, 라이브 실측):** resumeSessionId 저장(fa9df22)·resume 배선까지 정상임을 디스크 포렌식(`60c6aef2.jsonl` — 재시작 전 메시지가 압축 없이 컨텍스트에 존재)과 격리 e2e probe(재시작 후 코드네임 직접회상, memory 파일 배제)로 확정. ⇒ **핵심 영속/resume 버그는 이미 닫혔고**, 영호 실측 "기억 못 함"의 잔여는 **모델의 거짓 disclaimer**(맥락이 있는데도 메타질문 "이전 대화 기억해?"에 "과거 대화 기억 못 한다"고 답하는 학습된 반사)였다. 두 대응:
- **(a) `MEMORY_CONTINUITY_GUIDE`** (본 ADR-029의 연장) — resumeSessionId 있을 때만 systemPrompt.append에 "보이는 이전 메시지는 이 사용자와의 실제 대화·앱이 복원한 것, 기억으로 취급하고 기억 못 한다 말하지 마(단 컨텍스트에 없는 건 지어내지 마)" 주입. claude_code preset 순수 충실(ADR-013)에서 resume 세션 한정 의도적 이탈. 라이브 메타질문 probe로 disclaimer 억제 실측 확인("응, 기억나…" + 정확 회상 + confabulation 방어).
- **(b) "맥락 복원됨" 배지** — 모델 말과 무관하게 앱이 맥락을 복원했음을 UI로 사용자에게 알림(renderer `restoredSession` 파생).
- **Phase 03(resume 견고성: session이벤트 즉시저장·폴더없는 cwd)** = 관측 버그 아닌 엣지 하드닝 → 백로그 이연.

**현황(2026-07-02)**: LR1 마일스톤 마감 단계. Phase 01(fa9df22)·02(폴백 d47664c·0dd99e5) 완료 + (a)disclaimer 억제(e056fdb)·(b)배지(981bcf9)·라이브 probe(9795821). resume 라이브 확정, Phase 03 백로그 이연. 근거·상세 = `01.Phases/LR1-loop-resume/_resume-bug-diagnosis.md` §7·§8. (push=인간 게이트.)

---

