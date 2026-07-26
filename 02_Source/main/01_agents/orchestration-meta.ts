/**
 * orchestration-meta.ts — Workflow 스크립트 meta 블록 순수 파서 (Phase 37 #4b)
 *
 * 격리 원칙: electron import 0, 순수 함수, 사이드이펙트 없음.
 *
 * 비백트래킹 전략:
 *   - name/description: 부정 문자클래스 `[^'"\n]{0,200}` + 200자 상한 → 역추적 폭발 불가.
 *   - phases 배열 추출: 정규식 그리디 대신 수동 대괄호 카운트 루프(선형 스캔).
 *   - 모든 파싱은 8192자 truncate 이후 수행 → 거대 입력도 선형 시간 보장.
 *
 * D-1 보장: fallback name은 절대 'Workflow' 리터럴 반환 안 함 (빈 문자열 반환).
 * P-3 보장: script 내용 미로그 — 이 파일은 console/logger 미사용.
 */

// ── 상수 ─────────────────────────────────────────────────────────────────────

/** C-1: 입력 truncate 상한(8KB) */
const INPUT_CAP = 8192

/** meta.name / description 값 최대 길이 */
const VALUE_MAX_LEN = 200

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

/**
 * 따옴표 쌍으로 감싼 값 추출 — 부정 문자클래스 기반(비백트래킹).
 *
 * 패턴: `key\s*:\s*(['"])([^'"\n]{0,200})\1`
 * `[^'"\n]`는 따옴표와 줄바꿈을 포함하지 않으므로 역추적 없음.
 * 상한 `{0,200}`으로 최악 매칭 길이 고정.
 */
function extractQuotedValue(text: string, key: string): string | undefined {
  // 비백트래킹: 부정 문자클래스 + 상한
  const pattern = new RegExp(
    key + '\\s*:\\s*([\'"])([^\'"\\n]{0,' + VALUE_MAX_LEN + '})\\1'
  )
  const m = pattern.exec(text)
  return m ? m[2] : undefined
}

/**
 * `phases\s*:\s*[` 이후를 선형 스캔하여 매칭 `]`까지 substring 반환.
 *
 * 수동 대괄호 카운트 루프 — 정규식 그리디/백트래킹 회피.
 * 닫히지 않으면 스캔한 끝까지만 반환(깨진 meta graceful).
 */
function extractPhasesBlock(text: string): string | null {
  // phases\s*:\s*[ 인덱스 찾기 — 단순 전방 탐색(비백트래킹)
  const headerMatch = /phases\s*:\s*\[/.exec(text)
  if (!headerMatch) return null

  const openIdx = headerMatch.index + headerMatch[0].length - 1 // '[' 위치
  let depth = 0
  let i = openIdx

  // 선형 스캔: 대괄호 depth tracking
  while (i < text.length) {
    const ch = text[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        // openIdx~i 포함하여 반환
        return text.slice(openIdx, i + 1)
      }
    }
    i++
  }
  // 닫는 괄호 없음 → openIdx부터 끝까지(부분 파싱)
  return text.slice(openIdx)
}

/**
 * phases 블록 문자열에서 title 값만 추출(부정 문자클래스, 전역 매치).
 *
 * `title\s*:\s*(['"])([^'"\n]{0,200})\1` global — 동일 비백트래킹 전략.
 * title 없는 원소는 매칭 없음으로 자연 skip.
 */
function extractPhaseTitles(block: string): string[] {
  const titles: string[] = []
  const pattern = /title\s*:\s*(['"])([^'"\n]{0,200})\1/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(block)) !== null) {
    titles.push(m[2])
  }
  return titles
}

// ── 공개 API ──────────────────────────────────────────────────────────────────

/**
 * Workflow 스크립트에서 meta 객체의 name/description/phases를 추출한다.
 *
 * @param script - 모델이 생성한 Workflow 스크립트 (unknown — 비문자열 → { name: '' })
 * @returns { name, description?, phases? }
 *   - 비문자열 입력 → { name: '' }
 *   - meta 없음 → { name: '' }
 *   - 파싱 실패 → { name: '' }
 *   - 절대 name='Workflow' 반환 안 함 (D-1)
 */
export function parseOrchestrationMeta(
  script: unknown
): { name: string; description?: string; phases?: string[] } {
  // M4: 비문자열 입력 → 즉시 fallback (크래시 0)
  if (typeof script !== 'string') {
    return { name: '' }
  }

  // C-1: 8KB truncate (선형 시간 보장, ReDoS 방어)
  const capped = script.slice(0, INPUT_CAP)

  // meta 블록 존재 여부 간단 확인 — 없으면 즉시 fallback
  if (!/\bmeta\s*=/.test(capped)) {
    return { name: '' }
  }

  // name 추출 (비백트래킹)
  const name = extractQuotedValue(capped, 'name')

  // D-1 보장: 추출 실패(undefined) 또는 빈 문자열 → ''
  // 추출값이 'Workflow'여도 그대로 허용(사용자가 명명한 경우)
  // fallback에서만 'Workflow' 금지 → name이 undefined면 '' 반환
  const resolvedName = name ?? ''

  // description 추출 (비백트래킹)
  const description = extractQuotedValue(capped, 'description')

  // phases 추출 (수동 스캔)
  const phasesBlock = extractPhasesBlock(capped)
  const phases = phasesBlock !== null ? extractPhaseTitles(phasesBlock) : undefined

  const result: { name: string; description?: string; phases?: string[] } = {
    name: resolvedName,
  }
  if (description !== undefined) result.description = description
  if (phases !== undefined) result.phases = phases

  return result
}
