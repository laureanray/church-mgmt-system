# `irm`

`irm` is the local worktree and development-service manager for IRM Ministries.
It borrows the useful parts of Tails In Tub's `tit` workflow while keeping its
installation independent of disposable feature worktrees.

Install or update it from the primary checkout:

```sh
bun run irm:install
```

The installer copies the standalone CLI to `~/.local/share/irm/` and creates
`~/.local/bin/irm`. Its configuration lives at `~/.config/irm/config.json` and
service logs live under `~/.local/state/irm/`. Initialization also adds the
managed directory to the repository's local Git exclude, so it stays invisible
even while the primary checkout is on an older branch without the tracked
`.gitignore` rule.

## Worktrees

```sh
irm new feat/member-import       # fetch main, create .worktrees/member-import
cd "$(irm cd)"                   # enter the active worktree
irm wt                           # list state and spot old external worktrees
irm ws member-import             # select an existing worktree
irm move data-table              # preserve and move an old sibling checkout
irm remove member-import         # only clean + merged/commit-less trees qualify
irm clean                        # dry-run all safe stale worktrees
irm clean --apply                # remove the reported trees and merged branches
irm context                      # agent-friendly current Git/service context
```

`new` always fetches and branches from `origin/main`, links the configured
ignored environment file, and runs `bun install --frozen-lockfile`. Use
`--no-install` only when dependencies are intentionally unnecessary.

`move` uses `git worktree move`, so uncommitted work is preserved. It refuses
to move the primary checkout or a worktree serving the app. `remove` and
`clean --apply` refuse dirty, detached, and unmerged worktrees; there is no
force flag.

## Development services

```sh
irm run dev
irm run all                    # dev + Storybook in persistent tmux sessions
irm status
irm doctor
irm logs dev                  # follows; Ctrl-C stops following, not the server
irm logs storybook --lines 80
irm restart all
irm stop all
irm network tailscale         # localhost, lan, and tailscale are supported
```

Closing SSH or the terminal leaves managed services running. A switch, move,
or removal is blocked when it would invalidate a running service. `irm` also
refuses to claim or kill an unrelated process occupying port 3000 or 6006.

The default environment source is the primary checkout's `.env` (falling back
to `.env.local`). Change it safely with `irm setup --env /path/to/.env`; setup
never overwrites an existing environment file.
