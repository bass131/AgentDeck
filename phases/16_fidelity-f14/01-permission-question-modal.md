# Phase 01: permission-question-modal

## 목표
**PermissionModal**(도구 승인) + **QuestionModal**(AskUserQuestion) 스레드 중앙 모달 시각 1:1. 정적 샘플, M4 연결.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 보통~복잡.

## 의존 Phase
F13(완료).

## 위험 깃발
없음 (renderer. 새 IPC 0. 권한/질문 응답 실연결=M4. open prop + Shell state default off).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/PermissionModal.tsx`+CSS(신규) — q-overlay > perm-modal(perm-head[perm-ic IconShieldChk + title "도구 사용 승인 요청"/sub + perm-tool] + perm-sum + q-opts[q-opt: q-num 1/2/3 + q-opt-label/desc] + perm-foot "숫자 키로 선택 · Esc 거부"). PERM_CHOICES(허용 이번 한 번/항상 허용/거부). 숫자키 1·2·3 + Esc → onRespond(시각). props{open,toolName,summary,onRespond}.
- `src/renderer/src/components/QuestionModal.tsx`+CSS(신규) — q-overlay > q-modal(q-modal-head + q-steps[다중] + q-block[q-head q-chip + q-q + q-opts q-num/label/desc + 직접 입력 q-custom] + q-modal-foot + q-submit) + 잠깐 내려두기 → **q-mini 알약(우하단 — AskModal `.ask-mini`와 별 클래스 `.q-mini-*`, 동시 표출 시 위치 비충돌)**. 단일선택 자동진행/다중 토글. props{open,questions,onAnswer,onDismiss}. open=false→null.
- `src/renderer/src/lib/promptSampleData.ts`(또는 기존 sample) — SAMPLE_PERMISSION{toolName,summary} + SAMPLE_QUESTIONS[{header,question,options[],multiSelect?}]. window.api 0.
- `src/renderer/src/layout/Shell.tsx`(또는 Conversation) — permissionOpen/questionOpen state(default false) + 모달 렌더. (M4 실트리거 — 라이브 없음. 데모용 노출은 03 e2e/단위.)

## 작업 단계
1. PermissionModal + QuestionModal + 샘플.
2. Shell open state(default off).
3. CSS(q-overlay/perm-/q- — 인라인 색 0; **q-num 배경색만 옵션 색상 인라인 동적 허용 — F8/F12 avatarColor 예외와 동일 근거(고정 팔레트 상수, window.api 0), 주석 교차참조**). 
4. 단위 테스트.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 테스트: PermissionModal open(perm-head·q-opts 3·숫자키 1→onRespond·Esc 거부) · QuestionModal open(q-block·q-opts·직접 입력·다중 스텝·잠깐 내려두기 q-mini 토글·Esc) · open=false 미렌더. PASS.
- [ ] 자동표시 안 함(Shell default off → 기존 e2e 회귀 0). scope grep: window.api 권한/질문 0.
- [ ] `npm run test`·`test:e2e` 회귀 0.

## 참조
원본 Chat.tsx PermissionModal L1026~1056 · QuestionDialog L1059~1393 · REPLICA_GAP F14.
