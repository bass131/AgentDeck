// 스레드의 작업 폴더 (M07 G8) — 대화 안의 PR 카드가 그 대화(단일 창·멀티 패널)의 작업 폴더로 PR을 읽게 한다.
// ThreadView가 공급하고 ToolCallCard가 읽는다. 스레드 → 도구 묶음 → 도구 카드로 prop을 내려보내지 않으려고 컨텍스트로 둔다.
import { createContext } from 'react'

export const ThreadCwdContext = createContext<string | null>(null)
