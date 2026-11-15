import { describe, it, expect } from 'vitest'
import { createSkillsStore } from '@main/11_Settings/skills'
import { createCommandsStore } from '@main/11_Settings/commands'
import { parseFrontmatter } from '@main/11_Settings/frontmatter'

// M05 G11: skills와 commands가 각자 갖던 frontmatter 파서(본문 동일, 반환 투영만 다름)를 한 곳으로 모은다.
// 같은 원문을 두 스토어에 실제로 흘려 지금 동작을 고정한다. 투영(skills: name·description, commands: description·argument-hint)은 각자 둔다.
const norm = (p: string): string => p.replace(/\\/g, '/')

function viaSkills(text: string): { name: string; description: string } {
  const store = createSkillsStore({
    homedir: () => '/h',
    getUserData: () => '/u',
    readdir: (dir) => {
      if (norm(dir) === '/h/.claude/skills') return [{ name: 'dir-name', isDirectory: () => true }]
      throw new Error('ENOENT')
    },
    readFile: (p) => {
      if (norm(p) === '/h/.claude/skills/dir-name/SKILL.md') return text
      throw new Error('ENOENT')
    },
  })
  const [s] = store.listSkills(null)
  return { name: s.name, description: s.description }
}

function viaCommands(text: string): { description: string; argHint?: string } {
  const store = createCommandsStore({
    homedir: () => '/h',
    readdir: (dir) => {
      if (norm(dir) === '/h/.claude/commands') return [{ name: 'cmd.md', isDirectory: () => false }]
      throw new Error('ENOENT')
    },
    readFile: (p) => {
      if (norm(p) === '/h/.claude/commands/cmd.md') return text
      throw new Error('ENOENT')
    },
  })
  const c = store.listSlashCommands(null).find((x) => x.scope === 'user')!
  return 'argHint' in c ? { description: c.description, argHint: c.argHint } : { description: c.description }
}

describe('frontmatter 파싱 — skills·commands 공통 동작 고정 (M05 G11)', () => {
  it('LF·CRLF 모두 읽는다', () => {
    const lf = '---\nname: a\ndescription: d\nargument-hint: <x>\n---\nbody'
    const crlf = lf.replace(/\n/g, '\r\n')
    for (const t of [lf, crlf]) {
      expect(viaSkills(t)).toEqual({ name: 'a', description: 'd' })
      expect(viaCommands(t)).toEqual({ description: 'd', argHint: '<x>' })
    }
  })

  it('BOM을 벗긴다', () => {
    const t = '﻿---\nname: a\ndescription: d\n---\n'
    expect(t.charCodeAt(0)).toBe(0xfeff)
    expect(viaSkills(t)).toEqual({ name: 'a', description: 'd' })
    expect(viaCommands(t)).toEqual({ description: 'd' })
    // BOM 한 글자만 벗긴다 — 둘째 BOM이 있으면 frontmatter로 읽지 않는다
    const twice = String.fromCharCode(0xfeff, 0xfeff) + '---\nname: a\n---\n'
    expect(viaSkills(twice)).toEqual({ name: 'dir-name', description: '' })
    expect(parseFrontmatter(String.fromCharCode(0xfeff) + '---\nname: a\n---\n')).toEqual({ name: 'a' })
  })

  it('같은 키가 두 번이면 첫 값이 이긴다', () => {
    const t = '---\nname: first\nname: second\ndescription: d1\ndescription: d2\n---\n'
    expect(viaSkills(t)).toEqual({ name: 'first', description: 'd1' })
    expect(viaCommands(t)).toEqual({ description: 'd1' })
  })

  it('짝이 맞는 큰·작은따옴표만 벗기고 짝이 안 맞으면 둔다', () => {
    expect(viaSkills('---\nname: "q a"\ndescription: \'s d\'\n---\n')).toEqual({ name: 'q a', description: 's d' })
    expect(viaCommands('---\ndescription: "half\nargument-hint: \'x\'\n---\n')).toEqual({ description: '"half', argHint: 'x' })
  })

  it('키 패턴에 안 맞는 줄은 건너뛰고, 콜론 뒤 공백이 없어도 읽는다', () => {
    const t = '---\nmy key: no\nname:tight\n  description: indented\ndescription:   spaced   \n---\n'
    expect(viaSkills(t)).toEqual({ name: 'tight', description: 'spaced' })
    expect(viaCommands(t)).toEqual({ description: 'spaced' })
  })

  it('닫는 구분선이 없거나 첫 줄이 구분선이 아니면 frontmatter 없음', () => {
    for (const t of ['---\nname: a\ndescription: d\n', '\n---\nname: a\ndescription: d\n---\n']) {
      expect(viaSkills(t)).toEqual({ name: 'dir-name', description: '' })
      expect(viaCommands(t)).toEqual({ description: '' })
    }
  })

  it('빈 값 — skills는 이름을 폴더명으로 되돌리고, commands의 빈 argument-hint는 빈 문자열로 남는다', () => {
    const t = '---\nname:\ndescription:\nargument-hint:\n---\n'
    expect(viaSkills(t)).toEqual({ name: 'dir-name', description: '' })
    expect(viaCommands(t)).toEqual({ description: '', argHint: '' })
  })

  it('프로토타입에 있는 키 이름(constructor 등)은 저장되지 않아도 투영 키에는 영향이 없다', () => {
    const t = '---\nconstructor: x\ntoString: y\nname: a\ndescription: d\n---\n'
    expect(viaSkills(t)).toEqual({ name: 'a', description: 'd' })
    expect(viaCommands(t)).toEqual({ description: 'd' })
  })
})

describe('parseFrontmatter() — 한 곳으로 모은 파서 (M05 G11)', () => {
  it('키→값 맵 전체를 돌려주고 투영하지 않는다', () => {
    expect(parseFrontmatter('---\nname: a\nargument-hint: <x>\nother: o\n---\n')).toEqual({
      name: 'a',
      'argument-hint': '<x>',
      other: 'o',
    })
  })

  it('frontmatter가 없으면 빈 객체', () => {
    expect(parseFrontmatter('no fm')).toEqual({})
  })

  it('constructor 같은 키는 맵에 자기 키로 들어가지 않는다(일반 객체 + in 검사)', () => {
    const fm = parseFrontmatter('---\nconstructor: x\n---\n')
    expect(Object.keys(fm)).toEqual([])
  })
})
