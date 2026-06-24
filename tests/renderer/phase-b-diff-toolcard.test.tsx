// @vitest-environment jsdom
/**
 * phase-b-diff-toolcard.test.tsx — Phase B: ToolCallCard diff 표시 단위 테스트.
 * TDD: 이 파일이 먼저 FAIL → 구현 후 PASS.
 *
 * 검증:
 * 1. Edit 카드 + fileDiffs 있음 → 헤더에 "+N -M" 요약
 * 2. Edit 카드 + fileDiffs 있음 → 펼침 시 DiffViewer 렌더
 * 3. diff 없으면 기존 동작 (bo-log 표시)
 * 4. Bash 카드 → diff 미표시 (회귀 없음)
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ToolCallCard } from '../../src/renderer/src/components/ToolCallCard'
import type { ToolCard } from '../../src/renderer/src/store/reducer'
import type { DiffLine } from '../../src/shared/diff-types'

afterEach(() => cleanup())

const sampleDiff: DiffLine[] = [
  { kind: 'add', content: 'const y = 99', lineNew: 2 },
  { kind: 'remove', content: 'const y = 2', lineOld: 2 },
]

const editCard = (over: Partial<ToolCard> = {}): ToolCard => ({
  id: 't1',
  name: 'Edit',
  input: { file_path: 'src/a.ts' },
  status: 'done',
  result: 'ok',
  ...over,
})

const bashCard = (): ToolCard => ({
  id: 't2',
  name: 'Bash',
  input: { command: 'ls' },
  status: 'done',
  result: 'file.ts\n',
})

// 키 = card.id(tool_use id) — file_changed.toolId와 매칭(path 아님).
const fileDiffs: Record<string, { add: number; del: number; lines: DiffLine[] }> = {
  't1': { add: 3, del: 1, lines: sampleDiff },
}

describe('Phase B — ToolCallCard diff 표시', () => {
  it('Edit 카드 + fileDiffs 있음 → 헤더(t-res)에 "+3 −1" 표시', () => {
    const { container } = render(
      <ToolCallCard card={editCard()} fileDiffs={fileDiffs} />
    )
    const res = container.querySelector('.t-res')
    expect(res?.textContent).toMatch(/\+3/)
    expect(res?.textContent).toMatch(/−1|[-]1/)
  })

  it('Edit 카드 + fileDiffs 있음 → 펼침 시 DiffViewer 렌더(.diff-viewer)', () => {
    const { container } = render(
      <ToolCallCard card={editCard()} fileDiffs={fileDiffs} />
    )
    // 클릭하여 펼침
    fireEvent.click(container.querySelector('.t-row')!)
    // DiffViewer의 루트 클래스 확인
    expect(container.querySelector('.diff-viewer')).toBeTruthy()
  })

  it('Edit 카드 + fileDiffs 있음 → DiffViewer에 diff 라인 내용 표시', () => {
    const { container } = render(
      <ToolCallCard card={editCard()} fileDiffs={fileDiffs} />
    )
    fireEvent.click(container.querySelector('.t-row')!)
    // diff 라인 content 확인
    expect(screen.getByText('const y = 99')).toBeTruthy()
  })

  it('Edit 카드 + fileDiffs 없음 → 기존 bo-log 표시', () => {
    const { container } = render(
      <ToolCallCard card={editCard()} fileDiffs={{}} />
    )
    fireEvent.click(container.querySelector('.t-row')!)
    expect(container.querySelector('.bo-block')).toBeTruthy()
    // DiffViewer는 없어야 함
    expect(container.querySelector('.diff-viewer')).toBeFalsy()
  })

  it('Bash 카드 → diff 미표시, BashOutput 카드 동작 (W7 변경 후)', () => {
    // W7: bash 결과 있으면 BashOutput(고스트→펼침) 카드로 표시
    // fileDiffs에 bash 대상 없음
    const { container } = render(
      <ToolCallCard card={bashCard()} fileDiffs={fileDiffs} />
    )
    // DiffViewer 없어야 함
    expect(container.querySelector('.diff-viewer')).toBeFalsy()
    // W7: bash 결과 있으면 .bo-ghost(고스트 상태)가 먼저 표시됨
    expect(container.querySelector('.bo-ghost')).toBeTruthy()
    // 고스트 클릭 → .bo-block 펼침
    fireEvent.click(container.querySelector('.bo-ghost')!)
    expect(container.querySelector('.bo-block')).toBeTruthy()
  })
})
