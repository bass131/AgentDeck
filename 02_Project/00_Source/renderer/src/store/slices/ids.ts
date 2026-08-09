let _msgIdCounter = 0

export function nextMsgId(): string {
  _msgIdCounter += 1
  return `msg-${_msgIdCounter}`
}
