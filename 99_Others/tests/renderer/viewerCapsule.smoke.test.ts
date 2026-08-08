// @vitest-environment node
// 캡슐 경계 스모크 테스트 — viewer 기능 캡슐(02_Source/renderer/src/features/viewer)의
// 공개 표면이 새 경로에서 정상 import되는지만 얕게 확인한다.
// 재편(Step 3) 전에는 이 경로가 존재하지 않으므로 import 자체가 실패해 Red여야 한다.
import { describe, it, expect } from 'vitest'
import {
  CodeViewer,
  DiffViewer,
  ImagePreview,
  ImageViewer,
  SelectionAskBar,
  semClass,
  decodeSemanticTokens,
  buildAskPayload,
} from '../../../02_Source/renderer/src/features/viewer'

// CodeViewer는 memo() 래핑이라 typeof가 'object'다 — 'function' 단정 대신 진리값만 본다.
describe('viewer 캡슐 — 공개 표면 스모크', () => {
  it('CodeViewer가 캡슐 경로에서 export된다', () => {
    expect(CodeViewer).toBeTruthy()
  })

  it('DiffViewer가 캡슐 경로에서 export된다', () => {
    expect(typeof DiffViewer).toBe('function')
  })

  it('ImagePreview가 캡슐 경로에서 export된다', () => {
    expect(typeof ImagePreview).toBe('function')
  })

  it('ImageViewer가 캡슐 경로에서 export된다', () => {
    expect(typeof ImageViewer).toBe('function')
  })

  it('SelectionAskBar가 캡슐 경로에서 export된다', () => {
    expect(typeof SelectionAskBar).toBe('function')
  })

  it('semClass·decodeSemanticTokens·buildAskPayload 유틸이 캡슐 경로에서 export된다', () => {
    expect(typeof semClass).toBe('function')
    expect(typeof decodeSemanticTokens).toBe('function')
    expect(typeof buildAskPayload).toBe('function')
  })
})
