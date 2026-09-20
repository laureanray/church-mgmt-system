import { stripVTControlCharacters } from 'node:util'

export type ThemeMode = 'auto' | 'light' | 'dark'
export const palettes = {
  dark: { bg: '#111827', panel: '#1f2937', text: '#f3f4f6', muted: '#cbd5e1', accent: '#67e8f9', selected: '#164e63', good: '#86efac', warning: '#fde68a' },
  light: { bg: '#f8fafc', panel: '#e2e8f0', text: '#0f172a', muted: '#334155', accent: '#075985', selected: '#bae6fd', good: '#166534', warning: '#854d0e' },
}
export type Snapshot = {
  supabase?: { state: string; project: string | null }
  environment?: { state: string; endpoint: string }
  worktree: string
  branch: string
  theme: ThemeMode
  services: { name: string; state: 'running' | 'stopped' | 'occupied'; url: string; worktree: string | null }[]
}
export type Tree = { path: string; branch: string; active: boolean; changes: unknown[] }
export function clean(text: string): string {
  // Node 22's VT stripper can leave OSC payloads behind. Remove complete OSC
  // sequences first, supporting both BEL and string-terminator endings.
  const withoutOsc = text.replace(/(?:\x1b\]|\x9d)[\s\S]*?(?:\x07|\x1b\\|\x9c)/g, '')
  return stripVTControlCharacters(withoutOsc).replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '')
}
export function palette(mode: ThemeMode, terminal: string | null) {
  return palettes[mode === 'auto' ? (terminal === 'light' ? 'light' : 'dark') : mode]
}
export function nextTheme(mode: ThemeMode): ThemeMode {
  return mode === 'auto' ? 'light' : mode === 'light' ? 'dark' : 'auto'
}

export type RemoteUpdates = { worktree: string; state: 'unavailable' | 'current' | 'ahead' | 'behind' | 'diverged'; message: string; ahead?: number; behind?: number }
export function syncCommand(key: { name: string; ctrl?: boolean; meta?: boolean; shift?: boolean }, view: string, busy: boolean): string[] | null {
  if (busy || view !== 'services' || key.ctrl || key.meta || key.shift) return null
  return key.name === 'p' ? ['pull'] : null
}

const glyphs = {
  branch: ['\ue0a0', '⑂'], down: ['\uf063', '↓'], up: ['\uf062', '↑'],
  current: ['\uf00c', '✓'], diverged: ['\uf126', '↕'], warning: ['\uf071', '!'],
  sync: ['\uf021', '↻'], running: ['\uf04b', '▶'], stopped: ['\uf04d', '■'], database: ['\uf1c0', '▤'],
} as const
export function icon(name: keyof typeof glyphs, mode = process.env.IRM_ICONS) {
  return glyphs[name][mode === 'unicode' ? 1 : 0]
}
export function remoteSummary(updates?: RemoteUpdates | null) {
  if (!updates) return `${icon('sync')} Checking remote…`
  const name = updates.state === 'behind' ? 'down' : updates.state === 'ahead' ? 'up'
    : updates.state === 'diverged' ? 'diverged' : updates.state === 'current' ? 'current' : 'warning'
  return `${icon(name)} ${updates.message}`
}
