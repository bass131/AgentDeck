export interface DiffLine {
  kind: 'add' | 'remove' | 'context'
  content: string
  lineOld?: number
  lineNew?: number
}
