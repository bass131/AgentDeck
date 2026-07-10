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
  for (const field of ['summary', 'phase', 'status', 'grade', 'owner', 'gate_version', 'report_html']) {
    if (!fields[field]) issues.push(`frontmatter 필드 '${field}'가 없습니다.`)
    else if (/<[^>]+>|\{[^}]+\}/.test(fields[field])) issues.push(`frontmatter 필드 '${field}'에 placeholder가 남아 있습니다.`)
  }
  if (fields.status && fields.status.toLowerCase() !== 'done') issues.push("frontmatter 필드 'status'는 'done'이어야 합니다.")
  if (fields.gate_version && fields.gate_version !== '1') issues.push("gate_version은 '1'이어야 합니다.")
  if (fields.grade && !/^(?:복잡|대규모|complex|large)(?:\s|\(|$)/i.test(fields.grade)) {
    issues.push('새 -DONE.md의 grade는 복잡 또는 대규모여야 합니다.')
  }

  const reportPath = slash(fields.report_html || '')
  if (reportPath && !/^00\.Documents\/reports\/(?!.*\.\.)[^\r\n]+\.html$/i.test(reportPath)) {
    issues.push("report_html은 '00.Documents/reports/*.html' 상대 경로여야 합니다.")
  }
  for (const heading of ['TL;DR', '5단계 보고', 'AC 검증 결과', '학습 일지 후보 키워드']) {
    if (sectionBody(content, heading) === null) issues.push(`필수 H2 '## ${heading}'가 없습니다.`)
  }
  for (const label of DONE_LABELS) {
    if (!content.includes(label)) issues.push(`5단계 라벨 '${label}'가 없습니다.`)
  }

  const ac = sectionBody(content, 'AC 검증 결과')
  if (ac !== null && !hasAcEvidence(ac)) issues.push('AC 검증 결과에는 실제 실행 명령과 별도 결과 줄이 필요합니다.')

  if (htmlContent === null) issues.push('report_html이 가리키는 HTML 보고서가 없습니다.')
  else {
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
  const htmlTarget = /^00\.Documents\/reports\/(?!.*\.\.)[^\r\n]+\.html$/i.test(reportPath)
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
