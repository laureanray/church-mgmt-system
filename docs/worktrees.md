# Worktrees

Use the [IRM development manager](../tools/irm/README.md) for creation, selection,
service control and cleanup. Install once with `bun run irm:install` and `irm init`.

```sh
irm context
irm wt
irm new feat/member-export member-export
irm ws feat/member-export
cd "$(irm cd)"
irm setup
```

New tasks start from freshly fetched main in a new branch and sibling worktree —
or under the checkout's configured `worktree_root` (`irm init --worktree-root`).
The remote development host keeps them in `~/worktrees/church-mgmt-system/`.
`irm remote sync` mirrors a laptop worktree there; see the manager README.
Continue related follow-ups in the existing task worktree. The primary checkout
can contain local work; never reset it to get a clean task checkout.

```sh
irm cleanup --dry-run  # report merge status and protections
irm cleanup            # choose eligible removals in a terminal
```

Stop processes/agents using candidates first. Lock reserved worktrees with
`git worktree lock <path>`. Cleanup preserves local data and branches and requires
actual commit ancestry, including any commits added after a PR merged. Never use
force removal or automatic stashing to bypass a blocked cleanup.

Without an installed manager, use `bun run irm <command>` from the manager's
checkout. Without the manager at all, fetch main and use Git directly:

```sh
git fetch origin main
git worktree add --no-track -b <task-branch> <absolute-sibling-path> origin/main
```

Inspect dirty/untracked/ignored files, locks, active services and merge ancestry
before any manual removal. Keep the manager's installation checkout until it is
reinstalled elsewhere. See the manager README for setup and recovery details.
