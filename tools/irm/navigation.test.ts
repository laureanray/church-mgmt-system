import { describe, expect, it } from 'bun:test'
import { createNavigation } from './navigation'
import type { ViewState } from './view'

function fixture(view: ViewState['view'] = 'services'): ViewState {
  return { data: { branch: 'main', worktree: '/repo', theme: 'auto', services: ['dev', 'storybook'].map(name => ({ name, state: 'stopped', url: '', worktree: null })) }, selected: 0, theme: 'auto', view, trees: Array.from({ length: 20 }, (_, i) => ({ path: `/tree/${i}`, branch: `branch-${i}`, active: false, changes: [] })), treeIndex: 0, logService: 'dev', logOffset: 0, output: Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n'), busy: false, message: '' }
}

describe('Vim navigation', () => {
  it('moves service selection with j/k and arrows, clamping at boundaries', () => {
    const state = fixture(), navigate = createNavigation()
    for (const name of ['j', 'j']) navigate({ name }, state, 24)
    expect(state.selected).toBe(1)
    navigate({ name: 'k' }, state, 24)
    expect(state.selected).toBe(0)
    navigate({ name: 'up' }, state, 24)
    expect(state.selected).toBe(0)
    navigate({ name: 'down' }, state, 24)
    expect(state.selected).toBe(1)
  })
  it('handles gg, shifted G, and half pages in long worktree lists', () => {
    const state = fixture('worktrees'), navigate = createNavigation()
    navigate({ name: 'd', ctrl: true }, state, 24)
    expect(state.treeIndex).toBe(5)
    navigate({ name: 'g', shift: true }, state, 24)
    expect(state.treeIndex).toBe(19)
    navigate({ name: 'g' }, state, 24)
    expect(state.treeIndex).toBe(19)
    navigate({ name: 'g' }, state, 24)
    expect(state.treeIndex).toBe(0)
    navigate({ name: 'G' }, state, 24)
    expect(state.treeIndex).toBe(19)
  })
  it('scrolls captured logs and returns to following at G', () => {
    const state = fixture('logs'), navigate = createNavigation()
    navigate({ name: 'k' }, state, 24)
    expect(state.logOffset).toBe(1)
    navigate({ name: 'u', ctrl: true }, state, 24)
    expect(state.logOffset).toBe(6)
    navigate({ name: 'g' }, state, 24)
    navigate({ name: 'g' }, state, 24)
    expect(state.logOffset).toBe(190)
    navigate({ name: 'k' }, state, 24)
    expect(state.logOffset).toBe(190)
    navigate({ name: 'G' }, state, 24)
    expect(state.logOffset).toBe(0)
    navigate({ name: 'j' }, state, 24)
    expect(state.logOffset).toBe(0)
  })
  it('returns with h and leaves activation keys to the command handler', () => {
    const state = fixture('logs'), navigate = createNavigation()
    state.logOffset = 5
    expect(navigate({ name: 'l' }, state, 24)).toBe(false)
    expect(navigate({ name: 'h' }, state, 24)).toBe(true)
    expect(state.view).toBe('services')
    expect(state.logOffset).toBe(0)
    expect(state.output).toBe('')
  })
  it('does not navigate while busy, with modifiers, or across interrupted gg sequences', () => {
    const state = fixture('worktrees'), navigate = createNavigation()
    state.treeIndex = 5
    navigate({ name: 'g' }, state, 24)
    navigate({ name: 't' }, state, 24)
    navigate({ name: 'g' }, state, 24)
    expect(state.treeIndex).toBe(5)
    state.busy = true
    navigate({ name: 'g' }, state, 24)
    navigate({ name: 'j' }, state, 24)
    expect(state.treeIndex).toBe(5)
    state.busy = false
    expect(navigate({ name: 'j', ctrl: true }, state, 24)).toBe(false)
    expect(navigate({ name: 'G', meta: true }, state, 24)).toBe(false)
    expect(state.treeIndex).toBe(5)
  })
  it('keeps empty lists and short logs at zero', () => {
    const state = fixture('worktrees'), navigate = createNavigation()
    state.trees = []
    navigate({ name: 'G' }, state, 24)
    expect(state.treeIndex).toBe(0)
    state.view = 'logs'; state.output = 'one line'
    navigate({ name: 'k' }, state, 24)
    expect(state.logOffset).toBe(0)
  })
})
