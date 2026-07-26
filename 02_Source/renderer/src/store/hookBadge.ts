/**
 * hookBadge.ts — 훅 차단 턴 → assistant 배지 파생 (GAP1 P16 계열①).
 *
 * 영호 육안 피드백(2026-07-15 ②): 훅이 도구를 차단하거나 진행을 막은 턴의 assistant
 * 메시지에 빨간 배지가 붙어야 컴포저 위 HookTimeline(전역 요약)을 열지 않아도 대화
 * 스트림 안에서 "이 턴에 훅 개입이 있었다"가 보인다. 판정은 thread 인라인 아이템
 * (permission-denied/informational — reducer/cockpit.ts가 이미 채워둔 데이터)만으로
 * 성립한다 — 새 IPC/파이프라인 0, 렌더 레이어 순수 파생 계산.
 *
 * CRITICAL: 순수 함수(fs/네트워크/타이머/랜덤 0) — 결정론. 렌더 컴포넌트는 이 함수의
 * 결과 Set을 그대로 소비(badges.has(msg.id))한다.
 *
 * 계약 고정(gap1-p16-s1-hook-badge-derive.test.ts):
 *   [훅 차단 아이템 술어]
 *     kind==='permission-denied' && decisionReasonType==='hook'
 *     또는
 *     kind==='informational' && (level==='warning' || preventContinuation===true)
 *   [귀속 규칙]
 *     각 훅 차단 아이템 index i에 대해:
 *       1) 턴 경계: start = i 이하 가장 가까운 role==='user' msg index(없으면 0),
 *          end = i 초과 가장 가까운 role==='user' msg index(없으면 length, 배타).
 *       2) [i+1, end) 앞으로 훑어 최근접 후속 assistant msg 있으면 귀속.
 *       3) 없으면 [start, i) 뒤로 훑어 최근접 선행 assistant msg에 귀속.
 *       4) 턴 안에 assistant가 하나도 없으면 무귀속(배지 없음).
 *     이전 턴으로 새지 않는다(턴 경계 존중).
 */
import type { ThreadItem } from './threadTypes'

/** 훅 차단 술어 — permission-denied(hook) 또는 informational(warning|preventContinuation). */
function isHookBlockItem(item: ThreadItem): boolean {
  if (item.kind === 'permission-denied') {
    return item.decisionReasonType === 'hook'
  }
  if (item.kind === 'informational') {
    return item.level === 'warning' || item.preventContinuation === true
  }
  return false
}

function isUserMsg(item: ThreadItem): boolean {
  return item.kind === 'msg' && item.role === 'user'
}

function isAssistantMsg(item: ThreadItem): boolean {
  return item.kind === 'msg' && item.role === 'assistant'
}

/**
 * deriveHookTurnBadges — 배지를 붙일 assistant msg id 집합을 파생한다.
 */
export function deriveHookTurnBadges(thread: ThreadItem[]): Set<string> {
  const badges = new Set<string>()

  for (let i = 0; i < thread.length; i++) {
    const item = thread[i]
    if (!isHookBlockItem(item)) continue

    // 1) 턴 경계 확정
    let start = 0
    for (let k = i; k >= 0; k--) {
      if (isUserMsg(thread[k])) {
        start = k
        break
      }
    }
    let end = thread.length
    for (let k = i + 1; k < thread.length; k++) {
      if (isUserMsg(thread[k])) {
        end = k
        break
      }
    }

    // 2) 최근접 후속 assistant [i+1, end)
    let attributedId: string | null = null
    for (let k = i + 1; k < end; k++) {
      if (isAssistantMsg(thread[k])) {
        attributedId = thread[k].id
        break
      }
    }

    // 3) 후속 부재 시 최근접 선행 assistant [start, i)
    if (attributedId === null) {
      for (let k = i - 1; k >= start; k--) {
        if (isAssistantMsg(thread[k])) {
          attributedId = thread[k].id
          break
        }
      }
    }

    // 4) 턴 내 assistant 전무 — 무귀속(배지 없음)
    if (attributedId !== null) {
      badges.add(attributedId)
    }
  }

  return badges
}
