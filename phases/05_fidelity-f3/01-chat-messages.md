# Phase 01: chat-messages

## 목표
대화 영역이 원본 구조로: 빈 채팅(중앙 로고+인사+**추천 칩 2×2**) + 메시지 버블(user 우측·assistant 좌측, 아바타+name+timestamp+**Markdown 본문**) + 스트리밍 표시.

## 담당 도메인 / 에이전트
renderer (src/renderer). 등급: 복잡.

## 의존 Phase
F2(완료).

## 위험 깃발
없음 (renderer. 기존 store messages/streamingText 사용, 새 IPC 0).

## 변경 대상 (이 경계 밖 금지)
- `src/renderer/src/components/Conversation.tsx` — 빈 상태 welcome + MessageBubble 개편(아바타/meta/Markdown). 추천 칩 → 입력창 채움(setInputText).
- `src/renderer/src/components/Conversation.css` — `.chat-scroll`/`.thread`(max-width 760 clamp)/`.msg`/`.ava`/`.meta`/`.content`/`.welcome`/`.wc-grid`/`.wc-card`.
- MarkdownView(기존 M2) 재사용 — assistant 본문 Markdown 렌더.

## 작업 단계
1. 빈 채팅(`messages.length===0 && !streaming`): `.welcome`(로고 마크 + "무엇을 도와드릴까요?" + 부제 + `.wc-grid` 2×2 추천 칩). 칩 4개(구조설명/버그수정/성능개선/테스트작성, 벡터 아이콘) → 클릭 시 입력창 채움.
2. user 메시지: `.msg.user`(row-reverse) — 아바타(이니셜) + meta(name+time) + `.content`(bubble surface-2, radius 16). max-width 80%.
3. assistant 메시지: `.msg.ai-msg` — 아바타(accent + 마크) + meta("Claude"+time) + `.content`(**MarkdownView**).
4. 스트리밍: 최신 assistant 본문에 streamingText + 커서(기존 동작 보존).
5. timestamp: **현 store `ConversationEntry`에 시간 필드 없음 → meta는 name만, timestamp 생략**(store 변경=후속). DOM 단언 대상 아님(육안만). 인라인 색상 0, 벡터 아이콘.

## 완료조건 (AC — 측정 가능)
- [ ] `npm run typecheck` green.
- [ ] 컴포넌트 테스트(DOM): 빈 상태 `.welcome`+`.wc-card`×4, 추천칩 클릭→입력창 채움, user `.msg.user`+아바타, assistant `.msg.ai-msg`+Markdown(`.markdown-view`). PASS.
- [ ] `npm run test:e2e` 회귀 0(대화 스트리밍 e2e — 메시지 렌더 보존).
- [ ] 시각검증: 빈채팅 추천칩 + user/assistant 버블(아바타·Markdown) 렌더(스크린샷 육안).

## 참조
docs/UI_FIDELITY.md §3·§6 · 원본 Chat.tsx(WelcomeState/MessageView) · phases/05_fidelity-f3/_INDEX.md.
