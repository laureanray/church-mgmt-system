import { describe, expect, it } from 'bun:test'
import { clean, nextTheme, palette, palettes, syncCommand, icon, remoteSummary } from './model'

function luminance(hex: string) {
  const rgb = hex.slice(1).match(/../g)!.map(v => parseInt(v, 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722
}
describe('terminal readability', () => {
  it('keeps every foreground readable on each surface in both palettes', () => {
    for (const p of Object.values(palettes)) {
      for (const fg of [p.text, p.muted, p.accent, p.good, p.warning]) {
        for (const bg of [p.bg, p.panel, p.selected]) {
          const a = luminance(fg), b = luminance(bg)
          expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5)
        }
      }
    }
  })
  it('follows terminal appearance unless explicitly overridden', () => {
    expect(palette('auto', 'light')).toBe(palettes.light)
    expect(palette('auto', null)).toBe(palettes.dark)
    expect(palette('dark', 'light')).toBe(palettes.dark)
    expect(nextTheme(nextTheme(nextTheme('auto')))).toBe('auto')
  })
  it('removes ANSI and OSC sequences from logs and branch names', () => {
    expect(clean('\x1b[31merror\x1b[0m\n\x1b]0;bad title\x07safe\x00')).toBe('error\nsafe')
  })
  it.each(['\x07', '\x1b\\', '\x9c'])('removes OSC titles and hyperlinks terminated by %j', (terminator) => {
    expect(clean(`before\x1b]0;title${terminator}after`)).toBe('beforeafter')
    expect(clean(`\x1b]8;;https://example.com${terminator}label\x1b]8;;${terminator}`)).toBe('label')
    expect(clean(`\x9d0;title${terminator}safe`)).toBe('safe')
  })
})

describe('pull shortcut', () => {
  it('pulls only from the service view when idle', () => {
    expect(syncCommand({ name: 'p' }, 'services', false)).toEqual(['pull'])
    for (const view of ['logs', 'worktrees']) expect(syncCommand({ name: 'p' }, view, false)).toBeNull()
    expect(syncCommand({ name: 'p' }, 'services', true)).toBeNull()
    expect(syncCommand({ name: 'p', ctrl: true }, 'services', false)).toBeNull()
  })
})

describe('remote status icons', () => {
  it('uses Nerd Font icons with a Unicode fallback and readable status text', () => {
    expect(icon('down', 'nerd')).toBe('\uf063')
    expect(icon('down', 'unicode')).toBe('↓')
    expect(icon('up', 'unicode')).toBe('↑')
    expect(remoteSummary({ worktree: '/repo', state: 'behind', message: '2 remote commits available', behind: 2 })).toContain('2 remote commits available')
    expect(remoteSummary({ worktree: '/repo', state: 'unavailable', message: 'Remote check failed' })).toContain('Remote check failed')
    expect(remoteSummary()).toContain('Checking remote')
  })
})
