// Run with Bun: exercises the real native renderer without starting services.
import assert from 'node:assert/strict'
import { createTestRenderer } from '@opentui/core/testing'
import { icon } from './model'
import { createNavigation } from './navigation'
import { draw, type ViewState } from './view'

async function main() {
  const t = await createTestRenderer({ width: 100, height: 28 })
  const state: ViewState = { data: { supabase: { state: 'ready', project: 'demo' }, environment: { state: 'ready', endpoint: 'http://localhost:54421' }, branch: 'feat/irm-cli', worktree: '/repo with spaces', theme: 'auto', services: [{ name: 'dev', state: 'running', url: 'http://localhost:3000', worktree: null }, { name: 'storybook', state: 'stopped', url: 'http://localhost:6006', worktree: null }] }, selected: 0, theme: 'dark', view: 'services', trees: [], treeIndex: 0, logService: 'dev', logOffset: 0, output: '', busy: false, message: '' }
  try {
    for (const theme of ['dark', 'light'] as const) {
      state.theme = theme
      state.updates = { worktree: '/repo with spaces', state: 'behind', message: '2 remote commits available', behind: 2 }
      draw(t.renderer, state); await t.renderOnce()
      const frame = t.captureCharFrame()
      assert.match(frame, /2 remote commits/); assert.ok(frame.includes(icon('down'))); assert.match(frame, /DB: ready/); assert.match(frame, /Env: ready/); assert.match(frame, /RUNNING/); assert.match(frame, /STOPPED/); assert.match(frame, /r\/s app/)
      console.log(`${theme}: dashboard rendered`)
    }
    state.view = 'logs'; state.output = '\x1b[31mError: test log\x1b[0m'
    draw(t.renderer, state); await t.renderOnce()
    assert.match(t.captureCharFrame(), /Error: test log/)
    const navigate = createNavigation()
    state.output = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n')
    navigate({ name: 'g' }, state, 28); navigate({ name: 'g' }, state, 28)
    draw(t.renderer, state); await t.renderOnce()
    assert.match(t.captureCharFrame(), /line 0 /)
    assert.match(t.captureCharFrame(), /paused/)
    navigate({ name: 'G' }, state, 28)
    draw(t.renderer, state); await t.renderOnce()
    assert.match(t.captureCharFrame(), /line 199/)
    state.view = 'worktrees'; state.trees = [{ path: '/repo', branch: 'feat/example', active: true, changes: [] }]
    draw(t.renderer, state); await t.renderOnce()
    assert.match(t.captureCharFrame(), /feat\/example/)
    state.view = 'services'; state.output = Array.from({ length: 100 }, (_, i) => `log ${i}`).join('\n')
    for (const [width, height] of [[80, 24], [42, 16]]) {
      t.resize(width, height); draw(t.renderer, state); await t.renderOnce()
      const frame = t.captureCharFrame()
      assert.match(frame, /q quit/); assert.match(frame, /p pull/); assert.match(frame, /log 99/)
    }
    t.resize(32, 10); draw(t.renderer, state); await t.renderOnce()
    assert.match(t.captureCharFrame(), /Enlarge terminal/)
    console.log('logs, worktrees, narrow terminal: rendered')
  } finally { t.renderer.destroy() }
}
void main()
