import { createCliRenderer } from '@opentui/core'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { nextTheme, syncCommand, type RemoteUpdates, type Snapshot, type Tree } from './model'
import { createNavigation } from './navigation'
import { draw, type ViewState } from './view'

async function main() {
  const backend = fileURLToPath(new URL('./irm.py', import.meta.url))
  const renderer = await createCliRenderer({ exitOnCtrlC: false, screenMode: 'alternate-screen' })
  const state: ViewState = { data: null, selected: 0, theme: 'auto', view: 'services', trees: [], treeIndex: 0, logService: 'dev', logOffset: 0, output: '', busy: false, message: '' }
  const navigate = createNavigation()
  let closed = false
  let refreshing = false
  const children = new Set<ReturnType<typeof spawn>>()
  function render() { if (!closed) draw(renderer, state) }
  function command(args: string[], stream = false): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('python3', ['-u', backend, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
      children.add(child)
      child.stdout.setEncoding('utf8')
      child.stderr.setEncoding('utf8')
      let stdout = '', stderr = ''
      function append(chunk: string, error: boolean) {
        const value = chunk
        if (error) stderr = (stderr + value).slice(-100_000)
        else stdout = stream ? (stdout + value).slice(-100_000) : stdout + value
        if (stream) { state.output = (state.output + value).slice(-100_000); render() }
      }
      child.stdout.on('data', chunk => append(chunk, false))
      child.stderr.on('data', chunk => append(chunk, true))
      child.on('error', reject)
      child.on('close', code => {
        children.delete(child)
        if (code === 0) resolve(stdout)
        else reject(new Error(stderr.trim() || `irm ${args.join(' ')} exited with ${code}`))
      })
    })
  }
  async function refresh() {
    if (refreshing || state.busy || closed) return
    refreshing = true
    try {
      const data: Snapshot = JSON.parse(await command(['ui-state']))
      if (state.busy || closed) return
      state.data = data
      state.theme = data.theme
      if (state.view === 'logs' && state.logOffset === 0) {
        const service = state.logService
        const output = await command(service === 'environment' ? ['env'] : service === 'supabase' ? ['supabase', 'status'] : ['logs', service, '--lines', '200'])
        if (!state.busy && state.logOffset === 0 && state.view === 'logs' && state.logService === service) state.output = output
      }
    } catch (error) { state.message = String(error) }
    finally { refreshing = false; render() }
  }
  let remoteCheck: Promise<void> | null = null
  let updateVersion = 0
  async function checkUpdates(fetch = true) {
    const version = ++updateVersion
    state.updates = null
    render()
    try {
      const updates: RemoteUpdates = JSON.parse(await command(['updates', '--json', ...(fetch ? [] : ['--cached'])]))
      if (!closed && version === updateVersion && updates.worktree === state.data?.worktree) state.updates = updates
    } catch {
      if (!closed && version === updateVersion) state.updates = { worktree: state.data?.worktree || '', state: 'unavailable', message: 'Remote check unavailable · irm updates retries' }
    }
    render()
  }
  function refreshRemote(fetch = true) {
    remoteCheck = checkUpdates(fetch)
    return remoteCheck
  }
  async function action(args: string[]) {
    if (state.busy) return
    state.busy = true
    state.output = `$ irm ${args.join(' ')}\n`
    state.message = ''
    render()
    try { await remoteCheck; await command(args, true); state.message = 'Done.'; return true }
    catch (error) { state.message = String(error); state.output += `\n${error}`; return false }
    finally { state.busy = false; await refresh(); render() }
  }
  function quit() {
    if (state.busy) { state.message = 'Wait for the current command to finish before quitting.'; render(); return }
    closed = true
    clearInterval(timer)
    for (const child of children) child.kill()
    renderer.destroy()
  }
  renderer.keyInput.on('keypress', async key => {
    try {
      if (key.name === 'c' && key.ctrl) { quit(); return }
      if (navigate(key, state, renderer.height)) { render(); await refresh(); return }
      if (state.busy || key.ctrl || key.meta) return
      if (key.name === 'q' || key.name === 'escape') {
        if (state.view === 'services') quit()
        else { state.view = 'services'; state.output = ''; state.logOffset = 0; render() }
        return
      }
      if (key.name === 't') {
        const theme = nextTheme(state.theme)
        if (await action(['theme', theme])) state.theme = theme
      } else if (state.view === 'worktrees') {
        if ((key.name === 'return' || key.name === 'l') && state.trees[state.treeIndex]) {
          const path = state.trees[state.treeIndex].path
          state.view = 'services'
          if (await action(['ws', path])) await refreshRemote()
        }
      } else if (state.view === 'services') {
        const sync = syncCommand(key, state.view, state.busy || !state.data)
        if (sync) { await action(sync); await refreshRemote(false); return }
        if (key.name.toLowerCase() === 'b') await action(['supabase', key.shift || key.name === 'B' ? 'stop' : 'start'])
        if (key.name === 'e' || key.name === 'd') {
          state.view = 'logs'; state.logOffset = 0; state.logService = key.name === 'e' ? 'environment' : 'supabase'; state.output = 'Loading status…'; await refresh()
        }
        const service = state.data?.services[state.selected]?.name
        if ((key.name.toLowerCase() === 'r' || key.name.toLowerCase() === 's') && service) {
          await action([key.name.toLowerCase() === 'r' ? 'run' : 'stop', key.shift ? 'all' : service])
        }
        if (key.name === 'l' || key.name === 'a') {
          state.view = 'logs'; state.logOffset = 0; state.logService = key.name === 'a' ? 'auth' : service || 'dev'; state.output = 'Loading logs…'; await refresh()
        }
        if (key.name === 'w') {
          state.busy = true; render()
          try { state.trees = JSON.parse(await command(['wt', '--json'])) as Tree[]; state.treeIndex = Math.max(0, state.trees.findIndex(t => t.active)); state.view = 'worktrees' }
          finally { state.busy = false }
        }
      }
      render()
    } catch (error) { state.message = String(error); render() }
  })
  renderer.on('resize', render)
  renderer.on('theme_mode', render)
  renderer.on('destroy', () => { closed = true; clearInterval(timer); for (const child of children) child.kill() })
  const timer = setInterval(() => void refresh(), 2000)
  render()
  await refresh()
  void refreshRemote()
}
void main().catch(error => { console.error(`irm: ${error}`); process.exitCode = 1 })
