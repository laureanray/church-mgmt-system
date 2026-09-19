import type { ViewState } from './view'

export function outputRows(height: number, logs: boolean) {
  return Math.max(1, height - (height < 22 ? (logs ? 10 : 12) : (logs ? 14 : 18)))
}

type Key = { name: string; ctrl?: boolean; shift?: boolean; meta?: boolean }

// Kept independent of the renderer so navigation can be tested without a terminal.
export function createNavigation() {
  let pendingG = false
  return (key: Key, state: ViewState, height: number): boolean => {
    const first = pendingG && key.name === 'g' && !key.shift && !key.ctrl && !key.meta
    pendingG = false
    if (state.busy || key.meta) return false
    if (key.name === 'g' && !key.shift && !key.ctrl && !first) {
      pendingG = true
      return true
    }
    if (key.name === 'h' && !key.ctrl && !key.shift) {
      if (state.view !== 'services') {
        state.view = 'services'
        state.output = ''
        state.logOffset = 0
      }
      return true
    }
    const last = !key.ctrl && (key.name === 'G' || (key.name === 'g' && key.shift))
    const up = !key.ctrl && !key.shift && (key.name === 'k' || key.name === 'up')
    const down = !key.ctrl && !key.shift && (key.name === 'j' || key.name === 'down')
    const halfUp = key.ctrl && key.name === 'u'
    const halfDown = key.ctrl && key.name === 'd'
    if (!first && !last && !up && !down && !halfUp && !halfDown) return false
    const rows = state.view === 'logs' ? outputRows(height, true) : Math.max(1, height - 13)
    const step = halfUp || halfDown ? Math.max(1, Math.floor(rows / 2)) : 1
    const delta = up || halfUp ? -step : step
    if (state.view === 'logs') {
      const max = Math.max(0, state.output.split('\n').length - rows)
      state.logOffset = first ? max : last ? 0 : Math.max(0, Math.min(max, state.logOffset - delta))
    } else {
      const count = state.view === 'worktrees' ? state.trees.length : state.data?.services.length ?? 0
      const index = state.view === 'worktrees' ? state.treeIndex : state.selected
      const next = first ? 0 : last ? Math.max(0, count - 1) : Math.max(0, Math.min(Math.max(0, count - 1), index + delta))
      if (state.view === 'worktrees') state.treeIndex = next
      else state.selected = next
    }
    return true
  }
}
