import { BoxRenderable, TextRenderable, TextAttributes, type CliRenderer } from '@opentui/core'
import { outputRows } from './navigation'
import { clean, icon, palette, remoteSummary, type RemoteUpdates, type Snapshot, type ThemeMode, type Tree } from './model'

export type ViewState = {
  updates?: RemoteUpdates | null;
  data: Snapshot | null; selected: number; theme: ThemeMode
  view: 'services' | 'worktrees' | 'logs'; trees: Tree[]; treeIndex: number
  logService: string; logOffset: number; output: string; busy: boolean; message: string
}
export function draw(renderer: CliRenderer, state: ViewState) {
  const p = palette(state.theme, renderer.themeMode)
  renderer.setBackgroundColor(p.bg)
  const old = renderer.root.getChildren()[0]
  if (old) old.destroyRecursively()
  const compact = renderer.height < 22
  const root = new BoxRenderable(renderer, { width: '100%', height: '100%', paddingX: 2, paddingY: 1, gap: compact ? 0 : 1, flexDirection: 'column', backgroundColor: p.bg, overflow: 'hidden' })
  renderer.root.add(root)
  function text(parent: BoxRenderable, content: string, fg = p.text, bold = false) {
    parent.add(new TextRenderable(renderer, { content: clean(content).split('\n').map(line => Array.from(line).slice(0, Math.max(1, renderer.width - 8)).join('')).join('\n'), fg, attributes: bold ? TextAttributes.BOLD : 0, flexShrink: 0 }))
  }
  if (renderer.width < 42 || renderer.height < 16) {
    text(root, 'IRM · Enlarge terminal to 42 × 16')
    text(root, 'q quit · t change theme', p.accent)
    return
  }
  text(root, `IRM / IRM Ministries  ·  ${state.theme}`, p.accent, true)
  text(root, state.data ? `${icon("branch")} ${state.data.branch} · ${remoteSummary(state.updates)}\n${state.data.worktree}` : 'Loading active worktree…', p.muted)
  if (state.view === 'services') {
    for (const [index, service] of (state.data?.services ?? []).entries()) {
      const selected = index === state.selected
      const card = new BoxRenderable(renderer, { backgroundColor: selected ? p.selected : p.panel, paddingX: 1, flexShrink: 0 })
      root.add(card)
      text(card, `${selected ? '›' : ' '} ${service.name.padEnd(12)} ${icon(service.state === "running" ? "running" : service.state === "occupied" ? "warning" : "stopped")} ${service.state.toUpperCase()}  ${service.url}`, service.state === 'running' ? p.good : service.state === 'occupied' ? p.warning : p.text, selected)
      if (service.worktree && service.worktree !== state.data?.worktree) text(card, `  Running from ${service.worktree}`, p.warning)
    }
    if (state.data?.supabase) text(root, `${icon("database")} DB: ${state.data.supabase.state} · Env: ${state.data.environment?.state || 'unknown'}`, p.muted)
  } else if (state.view === 'worktrees') {
    text(root, 'WORKTREES · l/Enter selects · h back', p.accent, true)
    const count = Math.max(1, renderer.height - 13)
    const start = Math.max(0, state.treeIndex - count + 1)
    const list = new BoxRenderable(renderer, { flexGrow: 1, flexDirection: 'column', overflow: 'hidden' })
    root.add(list)
    for (const [offset, tree] of state.trees.slice(start, start + count).entries()) {
      text(list, `${start + offset === state.treeIndex ? '›' : ' '} ${tree.active ? '* ' : '  '}${tree.branch}  ·  ${tree.changes.length} changed`, start + offset === state.treeIndex ? p.accent : p.text, start + offset === state.treeIndex)
    }
  }
  if (state.view !== 'worktrees') {
    const panel = new BoxRenderable(renderer, { flexGrow: 1, minHeight: 3, border: true, borderColor: p.muted, title: state.view === 'logs' ? ` ${state.logService} · ${state.logOffset > 0 ? 'paused · G follows' : 'live logs'} ` : ' Activity ', titleColor: p.muted, backgroundColor: p.panel, paddingX: 1, overflow: 'hidden' })
    root.add(panel)
    const rows = Math.max(1, outputRows(renderer.height, state.view === 'logs') - (state.view === 'services' && state.data?.supabase ? (compact ? 1 : 2) : 0))
    const lines = state.output.split('\n')
    const end = Math.max(rows, lines.length - (state.view === 'logs' ? state.logOffset : 0))
    text(panel, lines.slice(Math.max(0, end - rows), end).join('\n') || 'Ready. Select a service with j/k, then press r to start.', p.text)
  }
  text(root, state.busy ? 'Working… commands are locked until completion.' : state.message || 'q exits · servers keep running', state.busy ? p.warning : p.muted)
  text(root, state.view === 'services' ? (renderer.width < 70
    ? `r/s app b/B DB d status e env\n${icon('down')} p pull w trees t theme q quit`
    : `j/k select r/s app R/S all ${icon('down')} p pull\nb/B DB d status e env l logs a auth w trees t theme q quit`)
    : state.view === 'logs' ? 'j/k scroll  gg/G ends  h back' : 'j/k move  gg/G ends  l/Enter choose\nh/Esc/q back  t theme', p.accent)
}
