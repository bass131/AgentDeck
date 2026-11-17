// M07 G8 PR 카드의 순수 도우미 — 대화의 `gh pr create` 결과에서 PR URL 감지, 카드 문구 만들기를 고정한다.
import { describe, it, expect } from 'vitest'
import {
  prUrlFromToolCall,
  shortSha,
  checkLabel,
  confirmText,
  mergeOutcomeText,
} from '@renderer/08_Git/prCardModel'

const URL = 'https://github.com/bass131/AgentDeck/pull/74'

describe('대화의 PR URL 감지', () => {
  it('gh pr create의 Bash 결과에 보인 PR URL을 돌려준다', () => {
    expect(prUrlFromToolCall({ command: 'gh pr create --fill' }, `Creating pull request\n${URL}\n`)).toBe(URL)
    expect(prUrlFromToolCall({ command: 'git push -u origin x && gh pr create --base master --title "t" --body "b"' }, URL)).toBe(URL)
    expect(prUrlFromToolCall({ command: 'gh.exe pr create --fill' }, URL)).toBe(URL)
    expect(prUrlFromToolCall({ command: 'gh -R bass131/AgentDeck pr create --fill' }, URL)).toBe(URL)
  })

  it('gh pr create가 아닌 명령, URL이 없는 결과, 문자열이 아닌 값은 null이다', () => {
    expect(prUrlFromToolCall({ command: 'gh pr view 74' }, URL)).toBeNull()
    expect(prUrlFromToolCall({ command: 'echo "gh pr create"' }, URL)).toBe(URL)
    expect(prUrlFromToolCall({ command: 'gh pr create --fill' }, 'error: no commits')).toBeNull()
    expect(prUrlFromToolCall({ command: 'gh pr create --fill' }, 'https://github.com/o/r/issues/3')).toBeNull()
    expect(prUrlFromToolCall(undefined, URL)).toBeNull()
    expect(prUrlFromToolCall({ command: 'gh pr create' }, [{ type: 'text', text: URL }])).toBe(URL)
    expect(prUrlFromToolCall({ command: 'gh pr create' }, { x: 1 })).toBeNull()
  })

  it('여러 URL이 보이면 마지막 것을 쓴다', () => {
    expect(prUrlFromToolCall({ command: 'gh pr create' }, `https://github.com/o/r/pull/1\n${URL}`)).toBe(URL)
  })
})

describe('카드 문구', () => {
  const SHA = 'f4e0ff3812cde4caf1585a73ac77d3f9836bc2dd'
  it('짧은 SHA는 앞 7글자다', () => {
    expect(shortSha(SHA)).toBe('f4e0ff3')
  })
  it('검사 결과 이름', () => {
    expect([checkLabel('success'), checkLabel('pending'), checkLabel('failure'), checkLabel('missing')]).toEqual(['성공', '대기 중', '실패', '결과 없음'])
  })
  it('확인 문구는 전체 SHA와 main이 읽은 base 이름을 다시 보인다', () => {
    expect(confirmText({ headSha: SHA, baseRef: 'master' })).toBe(`이 커밋 ${SHA}를 master에 병합`)
    expect(confirmText({ headSha: SHA, baseRef: 'main' })).toContain('main에 병합')
  })
  it('병합 결과 문구', () => {
    expect(mergeOutcomeText({ status: 'merged', message: 'ok', mergeSha: SHA })).toBe(`병합했어요 — 병합 커밋 ${SHA}`)
    expect(mergeOutcomeText({ status: 'enqueued', message: 'x' })).toBe('병합 큐에 들어감')
    expect(mergeOutcomeText({ status: 'refused', message: '권한이 없어요' })).toBe('병합하지 않았어요 — 권한이 없어요')
    expect(mergeOutcomeText({ status: 'failed', message: 'Merge conflict' })).toBe('병합 실패 — Merge conflict')
    expect(mergeOutcomeText({ status: 'timeout', message: '결과 대기 시간 초과 — 다시 읽기로 확인하세요' })).toBe('결과 대기 시간 초과 — 다시 읽기로 확인하세요')
    expect(mergeOutcomeText({ status: 'unknown', message: '결과 모름 — 다시 읽기로 확인하세요' })).toBe('결과 모름 — 다시 읽기로 확인하세요')
  })
})
