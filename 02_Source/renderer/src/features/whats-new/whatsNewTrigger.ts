export const SEEN_KEY = 'whatsnew.seenVersion'

export function seriesOf(v: string): string {
  return v.split('.').slice(0, 2).join('.')
}

export function decideStartupModal(
  version: string | null | undefined,
  seen: string
): 'whatsnew' | 'updatenotes' | null {
  if (!version) return null
  if (seen === '') return 'whatsnew'
  if (seriesOf(seen) !== seriesOf(version)) return 'updatenotes'
  return null
}
