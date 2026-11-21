import type { InjectedInput } from '@renderer/05_Conversation'

// 단일 inject 채널 — 주입 출처(FileModal 선택질문·GitModal)와 무관하게 nonce를 하나씩 올려 Conversation에 재주입을 알린다.
// Shell.tsx 밖에 두어 컴포넌트 파일이 컴포넌트만 내보내게 한다(Fast Refresh 경계).
export function nextInject(prev: InjectedInput, text: string): InjectedInput {
  return { text, nonce: prev.nonce + 1 }
}
