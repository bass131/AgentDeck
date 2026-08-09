const INPUT_CAP = 8192

const VALUE_MAX_LEN = 200

function extractQuotedValue(text: string, key: string): string | undefined {
  const pattern = new RegExp(
    key + '\\s*:\\s*([\'"])([^\'"\\n]{0,' + VALUE_MAX_LEN + '})\\1'
  )
  const m = pattern.exec(text)
  return m ? m[2] : undefined
}

function extractPhasesBlock(text: string): string | null {
  const headerMatch = /phases\s*:\s*\[/.exec(text)
  if (!headerMatch) return null

  const openIdx = headerMatch.index + headerMatch[0].length - 1
  let depth = 0
  let i = openIdx

  while (i < text.length) {
    const ch = text[i]
    if (ch === '[') depth++
    else if (ch === ']') {
      depth--
      if (depth === 0) {
        return text.slice(openIdx, i + 1)
      }
    }
    i++
  }
  return text.slice(openIdx)
}

function extractPhaseTitles(block: string): string[] {
  const titles: string[] = []
  const pattern = /title\s*:\s*(['"])([^'"\n]{0,200})\1/g
  let m: RegExpExecArray | null
  while ((m = pattern.exec(block)) !== null) {
    titles.push(m[2])
  }
  return titles
}

export function parseOrchestrationMeta(
  script: unknown
): { name: string; description?: string; phases?: string[] } {
  if (typeof script !== 'string') {
    return { name: '' }
  }

  const capped = script.slice(0, INPUT_CAP)

  if (!/\bmeta\s*=/.test(capped)) {
    return { name: '' }
  }

  const name = extractQuotedValue(capped, 'name')

  const resolvedName = name ?? ''

  const description = extractQuotedValue(capped, 'description')

  const phasesBlock = extractPhasesBlock(capped)
  const phases = phasesBlock !== null ? extractPhaseTitles(phasesBlock) : undefined

  const result: { name: string; description?: string; phases?: string[] } = {
    name: resolvedName,
  }
  if (description !== undefined) result.description = description
  if (phases !== undefined) result.phases = phases

  return result
}
