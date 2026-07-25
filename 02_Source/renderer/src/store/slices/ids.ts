/**
 * slices/ids.ts — store 내부 메시지 id 카운터 (P12 분해).
 *
 * sendMessage(runtime)·loadConversation(conversation)·selectConversation(sessionList)이 공유.
 * 모듈 레벨 단조 카운터 — 기존 appStore.ts의 _msgIdCounter/nextMsgId 그대로 이전.
 */
let _msgIdCounter = 0

/** 다음 메시지 id를 발급한다 (`msg-N`). 모듈 단조 증가. */
export function nextMsgId(): string {
  _msgIdCounter += 1
  return `msg-${_msgIdCounter}`
}
