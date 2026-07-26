import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const DONE_LABELS = [
  '무엇을 만들었나',
  '왜 필요한가',
  '어떻게 만들었나',
  '테스트 결과',
  '다음 스텝',
]

// `report_html` 프론트매터가 가리켜도 되는 경로의 형식.
//
// ⚠️ **이 정규식은 원래 아래 두 소비처에 문자 그대로 복제돼 있었다** — 형식 판정과
// HTML 실재 검사. 한쪽만 고치면 "형식은 통과하는데 HTML을 못 찾는"(또는 그 반대) 반쪽
// 상태가 되고, 어느 쪽도 에러를 내지 않아 조용히 어긋난다. NC(ADR-039, 2026-07-26)에서
// 상수로 끌어올려 **복제 자체를 없앴다** — 갈라질 수 있는 것은 언젠가 갈라진다.
//
// ⚠️ `(?:\d{2}_)?`는 `reports` → `02_Reports` 개명(NC P05)의 병행 수용이다.
// ⭐ **이건 봉인 방향이 아니라 「수용 방향」이라 영구 존치하면 구멍이다** — 통과 집합을
// 넓히는 쪽이라, 존재하지 않는 경로를 가리키는 문서도 계속 green 이 된다. 실제로 옛
// 표기를 가리키는 유령 포인터가 **15건** 쌓여 있고 전부 이 관대함을 통과해 왔다.
// → **P06에서 backfill 직후 신형 단독으로 일몰**한다(`(?:\d{2}_)?`와 `[._]` 둘 다 제거).
const REPORT_HTML_RE = /^00[._]Documents\/(?:\d{2}_)?reports\/(?!.*\.\.)[^\r\n]+\.html$/i

function slash(value) {
  return value.replaceAll('\\', '/')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function parseFrontmatter(content = '') {
  const lines = content.replaceAll('\r', '').split('\n')
  if (lines[0]?.trim() !== '---') return { fields: {}, found: false }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (end < 0) return { fields: {}, found: false }
  const fields = {}
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (match) fields[match[1].toLowerCase()] = match[2].trim().replace(/^['"]|['"]$/g, '')
  }
  return { fields, found: true }
}

function sectionBody(content, title) {
  const lines = content.replaceAll('\r', '').split('\n')
  const start = lines.findIndex((line) => line.trim() === `## ${title}`)
  if (start < 0) return null
  const body = []
  for (const line of lines.slice(start + 1)) {
    if (/^##\s+/.test(line)) break
    body.push(line)
  }
  return body.join('\n').trim()
}

function hasAcEvidence(ac) {
  const lines = ac.replaceAll('\r', '').split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('```'))
  const commandIndex = lines.findIndex((line) => /^\$\s+\S+/.test(line)
    || /^(?:npm|npx|node|git|gh|codex|pnpm|yarn|bun|cargo|pytest|python|py|go|dotnet|mvn|gradle|bash|powershell|pwsh)\b/i.test(line))
  if (commandIndex < 0) return false
  const resultPattern = /(?:pass(?:ed)?|fail(?:ed)?|errors?|warnings?|tests?|files?|problems?|exit|success|\bok\b|completed|성공|통과|실패)/i
  return lines.some((line, index) => index !== commandIndex
    && (resultPattern.test(line) || /^\d+(?:\s|$)/.test(line)))
}

export function doneReportIssues(content = '', { htmlContent = null } = {}) {
  const issues = []
  const { fields, found } = parseFrontmatter(content)
  if (!found) issues.push('YAML frontmatter가 없거나 닫히지 않았습니다.')
  // `report_html`은 **선택 필드**다(영호 2026-07-26) — HTML 보고서는 상시 의무가 아니라
  // 요청 시에만 만든다. 적었으면 아래에서 실재·라벨을 그대로 검사한다.
  for (const field of ['summary', 'phase', 'status', 'grade', 'owner', 'gate_version']) {
    if (!fields[field]) issues.push(`frontmatter 필드 '${field}'가 없습니다.`)
    else if (/<[^>]+>|\{[^}]+\}/.test(fields[field])) issues.push(`frontmatter 필드 '${field}'에 placeholder가 남아 있습니다.`)
  }
  if (fields.status && fields.status.toLowerCase() !== 'done') issues.push("frontmatter 필드 'status'는 'done'이어야 합니다.")
  if (fields.gate_version && fields.gate_version !== '1') issues.push("gate_version은 '1'이어야 합니다.")
  if (fields.grade && !/^(?:복잡|대규모|complex|large)(?:\s|\(|$)/i.test(fields.grade)) {
    issues.push('새 -DONE.md의 grade는 복잡 또는 대규모여야 합니다.')
  }

  const reportPath = slash(fields.report_html || '')
  if (reportPath && !REPORT_HTML_RE.test(reportPath)) {
    issues.push("report_html은 '00_Documents/02_Reports/**/*.html' 상대 경로여야 합니다.")
  }
  for (const heading of ['TL;DR', '5단계 보고', 'AC 검증 결과', '학습 일지 후보 키워드']) {
    if (sectionBody(content, heading) === null) issues.push(`필수 H2 '## ${heading}'가 없습니다.`)
  }
  for (const label of DONE_LABELS) {
    if (!content.includes(label)) issues.push(`5단계 라벨 '${label}'가 없습니다.`)
  }

  const ac = sectionBody(content, 'AC 검증 결과')
  if (ac !== null && !hasAcEvidence(ac)) issues.push('AC 검증 결과에는 실제 실행 명령과 별도 결과 줄이 필요합니다.')

  // HTML 계약은 `report_html`을 **명시했을 때만** 발동한다. 명시하지 않은 완료 보고는
  // MD 계약(5단계 라벨·필수 H2·AC 증적)만으로 통과한다 — 선택제의 정의다.
  if (!reportPath) { /* HTML 보고서 없음 = 정상 경로 */ }
  else if (htmlContent === null) issues.push('report_html이 가리키는 HTML 보고서가 없습니다.')
  else {
    // 계약(유지보수 창 2026-07-24, 안건 3 종결): HTML 보고서의 5단계 라벨은 렌더 본문일 필요가
    // 없다 — 보고서 스킬의 "제목은 서술형" 계약과 충돌하므로, 비렌더링 <!-- --> 주석 1줄에 담는
    // 것이 *정식* 이행 방식이다(LP1 선례 승격). 따라서 검사도 substring 포함으로 충분하며,
    // 렌더 DOM 파싱으로 강화하지 말 것. 짝 계약 = ~/.claude/skills/Report-YYH-Style/SKILL.md.
    const missingHtmlLabels = DONE_LABELS.filter((label) => !htmlContent.includes(label))
    if (missingHtmlLabels.length) issues.push(`HTML 보고서의 5단계 라벨 누락: ${missingHtmlLabels.join(', ')}`)
  }
  return unique(issues)
}

export function doneReportGateResult(content = '', { tracked = false, htmlContent = null } = {}) {
  const { fields } = parseFrontmatter(content)
  if (tracked && fields.gate_version !== '1') {
    return { blocking: false, legacy: true, issues: [] }
  }
  const issues = doneReportIssues(content, { htmlContent })
  return { blocking: issues.length > 0, legacy: false, issues }
}

function isTrackedRepoPath(root, repoPath) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', repoPath], {
      cwd: root,
      stdio: ['ignore', 'ignore', 'ignore'],
    })
    return true
  } catch {
    return false
  }
}

function checkFile(root, repoPath) {
  const target = path.isAbsolute(repoPath) ? path.resolve(repoPath) : path.resolve(root, repoPath)
  const relative = slash(path.relative(root, target))
  if (relative === '..' || relative.startsWith('../')) {
    return { blocking: true, message: `📋 phase-gate 차단: 저장소 밖 완료 보고 경로(${repoPath})` }
  }
  if (!fs.existsSync(target)) return { blocking: false, message: '' }
  const content = fs.readFileSync(target, 'utf8')
  const { fields } = parseFrontmatter(content)
  const tracked = isTrackedRepoPath(root, relative)
  const initialGate = doneReportGateResult(content, { tracked })
  if (initialGate.legacy) {
    return {
      blocking: false,
      message: `📋 phase-gate: ${relative}는 gate_version 없는 기존 문서라 strict 완료 게이트를 유예합니다.`,
    }
  }

  const reportPath = slash(fields.report_html || '')
  const htmlTarget = REPORT_HTML_RE.test(reportPath)
    ? path.join(root, reportPath)
    : null
  const htmlContent = htmlTarget && fs.existsSync(htmlTarget)
    ? fs.readFileSync(htmlTarget, 'utf8')
    : null
  const gate = doneReportGateResult(content, { tracked, htmlContent })
  return {
    blocking: gate.blocking,
    message: gate.blocking ? `📋 phase-gate 차단: ${relative}: ${gate.issues.join(' / ')}` : '',
  }
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain && process.argv[2] === 'check') {
  const root = path.resolve(process.argv[3] || '.')
  const repoPath = process.argv[4] || ''
  const result = checkFile(root, repoPath)
  if (result.message) process.stderr.write(`${result.message}\n`)
  if (result.blocking) process.exit(2)
}
