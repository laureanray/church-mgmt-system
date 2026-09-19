# irm — IRM Ministries development manager

Adapted from the local `tailsintub-v0/tools/tit` manager. macOS and Linux; Python
3.11+, Git, Node, the Bun version in `.bun-version`, and tmux. Docker and the
Supabase CLI are needed only for the local database. When the shell Bun differs from `.bun-version`, `irm` uses `bunx bun@<version>`
(cached after first use) without upgrading the global installation. The terminal dashboard uses
OpenTUI, installed with the repository's development dependencies.

## Install

From this checkout:

```sh
bun install --frozen-lockfile
bun run irm:install
irm init
irm setup --env /absolute/path/to/your/.env
irm
```

The executable is `~/.local/bin/irm`; add that directory to PATH if necessary.
`bun run irm --help` also works before installation. `init` records the primary
repository and current worktree, and uses an existing `.env` in either as the
initial setup source. It never overwrites configuration. `setup` links an ignored
`.env` without overwriting existing files, then installs locked dependencies.
The shared source must stay available. No credentials are committed or displayed
by environment/status reports. Application logs can contain the application's
own diagnostics.

Config: `~/.config/irm/config.json` (mode 600). Logs and mutation lock:
`~/.local/state/irm/`. tmux sessions: `irm-dev` and `irm-storybook`.
These are independent of `tit`. The installed launcher follows the selected
worktree when it has a compatible manager, otherwise uses the installation
checkout. Keep that checkout until you reinstall from the primary checkout
after merging; cleanup protects both manager locations.

## Daily commands

```sh
irm                        # dashboard; q leaves services running
irm context                # active branch, edits, commits, services
irm wt                     # all worktrees, active selection, change counts
irm new feat/member-export member-export
irm ws feat/member-export  # select an existing registered worktree
cd "$(irm cd)"             # selection does not change the calling shell
irm setup                  # link env if missing; install locked dependencies
irm run dev                # app on :3000
irm run storybook          # Storybook on :6006
irm run all
irm status
irm doctor                 # also probe HTTP and Supabase Auth
irm logs dev               # follow; Ctrl-C stops following only
irm logs storybook --lines 60
irm logs auth
irm restart all
irm stop all
irm updates                # fetch/check the active branch's upstream
irm pull                   # fast-forward only; no autostash/reset/rebase
```

`wt`, `context`, `env`, `updates`, `supabase status`, and `cleanup` accept `--json`.
`updates --cached` avoids fetching. `new` always fetches main and creates a sibling
of the primary checkout with no upstream; it does not switch selection. Publish
explicitly with `git push -u origin <branch>` when ready. A branch with no upstream
shows that state until published. Follow-up tasks reuse their existing worktree.

Stop managed services before switching worktrees. `run all` validates both
package scripts before starting anything; use `run dev` for branches without
Storybook. Runtime startup failures may leave earlier services running; status
and logs show what happened. Port conflicts leave other processes untouched.
Closing the dashboard or disconnecting SSH leaves servers running; rebooting does
not restart them. The default ports are shared with many apps, including `tit`;
stop the other manager's services before using those ports here.

## Dashboard

Use j/k or arrows to select; r/s starts/stops the selected service, R/S all
services. l opens logs; a Auth logs; w worktrees; d database status; e environment;
b/B starts/stops local Supabase; p pulls the selected branch; t cycles theme.
h/Escape returns; q quits. gg/G and Ctrl-u/Ctrl-d navigate long lists and logs.
Scrolling pauses log following; G resumes. Light/dark palettes and 42×16 minimum
terminal layouts are tested. Set `IRM_ICONS=unicode` without a Nerd Font.

## Database and environment

```sh
irm env
irm supabase status
irm supabase start
irm migrate                # explicit Drizzle migrations, local project only
irm supabase stop          # preserves volumes; requires dev stopped
```

This project uses **Drizzle**, with `db/migrations` as its sole history. `migrate`
loads the selected worktree's Next development environment, validates the effective
direct URL against loopback, database `postgres`, and its Supabase `db.port`,
then runs `bun run db:migrate` with that URL pinned. It refuses hosted databases.
Starting or restarting dev never migrates, seeds, resets, or repairs the database.
Worktrees share the local database: review schema compatibility before running
`migrate` after a branch switch. Supabase readiness requires db, auth and kong;
REST is disabled in this project. Status presence checks do not validate credentials.

Environment precedence follows Next's own loader, with process variables first.
Reports show key presence, sources and a sanitized endpoint, never values. `.env`
is the setup link so the project's Drizzle CLI and Next can both read it. Existing
`.env.local` or development-specific files can override it; `irm env` shows this.

## Networking

```sh
irm network auto           # macOS/local Linux: localhost; SSH Linux: host address
irm network local
irm network lan
irm network tailscale
irm restart all
```

Local mode binds to loopback; remote modes bind to network interfaces. The
manager supplies the app URL, Next development origin, and Storybook allowed
hosts. Only loopback Supabase URLs are rewritten for remote browsers; hosted URLs
are preserved. Source environment files stay unchanged. Restart after changing
network selection. Supabase's own Docker port bindings are controlled separately.

## Cleanup

```sh
irm cleanup --dry-run
irm cleanup --json
irm cleanup                # prompt individually in a terminal
```

Cleanup fetches origin and checks actual HEAD ancestry against `origin/main`.
`--base REF` changes the target; `--no-fetch` explicitly uses cached refs.
JSON, dry-run and redirected input never delete. A merged PR alone is not proof:
post-merge commits and squash/rebase merges can remain outside main.

Primary, active, current-directory, installed/executing manager, running-service,
locked, missing, detached and integration worktrees are protected. Dirty/untracked
files and ignored local data also block removal. Only generated dependency/build/
test directories, Python caches, `next-env.d.ts` and `tsconfig.tsbuildinfo` are
disposable. `.env`, `.vercel`, local databases and notes are retained. External
agents/processes are not fully detectable: stop them or lock their worktrees.
State is rechecked after confirmation. Removal never forces, prunes, deletes
branches, stashes, or resets. Restore a removed checkout with
`git worktree add /absolute/path <retained-branch>`, then run setup.

## Checks

```sh
bun run test:irm
bun run typecheck
bun run lint
```

Python tests use temporary repositories and mocked service controls; the renderer
check exercises real OpenTUI in both themes, narrow terminals and log/worktree
views without starting application services.
