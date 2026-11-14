const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/

const BLOCK_MARKER_RE = /^ {0,3}(?:[-*+][ \t]|\d+\.[ \t]|#{1,6}(?:[ \t]|$)|>|\|)/

function tagFencedLines(lines: string[]): boolean[] {
  const fenced = new Array<boolean>(lines.length).fill(false)
  let inFence = false
  for (let i = 0; i < lines.length; i += 1) {
    if (FENCE_RE.test(lines[i])) {
      fenced[i] = true
      inFence = !inFence
    } else {
      fenced[i] = inFence
    }
  }
  return fenced
}

export function foldSoftLinebreaks(text: string): string {
  if (text.length === 0) return text

  const lines = text.split('\n')
  const fenced = tagFencedLines(lines)

  const out: string[] = [lines[0]]
  let i = 1
  while (i < lines.length) {
    if (fenced[i - 1] || fenced[i]) {
      out.push('\n', lines[i])
      i += 1
      continue
    }

    if (lines[i] === '') {
      let j = i
      while (j < lines.length && lines[j] === '') j += 1
      out.push('\n\n')
      if (j < lines.length) out.push(lines[j])
      i = j + 1
      continue
    }

    out.push(BLOCK_MARKER_RE.test(lines[i]) ? '\n' : ' ', lines[i])
    i += 1
  }

  return out.join('')
}
