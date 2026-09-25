# IRM Ministries — church management

Members directory, service attendance and staff access for IRM Ministries.
`AGENTS.md` covers the stack, the conventions and how to run everything;
`docs/` holds the longer write-ups.

## Audit log

Every change to members, cell groups (and who is in them), deleted services,
staff accounts, roles and settings is written to `audit_log`, in the same
transaction as the change itself. Admins read it at **Settings → Audit log**
(`/settings/audit`), and a member's own entries appear on the **History** tab
of their page. Both need the `audit.view` permission, which only the Admin
role holds by default.

An update stores only the fields that changed. Secrets, passwords and tokens
are redacted before they are stored; the log records that the webhook secret
changed, never its value.

Entries are kept for 24 months (`AUDIT_RETENTION_MONTHS` in
`lib/constants.ts`). Nothing prunes them automatically — there is no cron — so
run this every few months:

```bash
bun run audit:prune --dry-run   # how many entries have expired
bun run audit:prune             # delete them
```

Against production, run it with that project's `DATABASE_URL` in the
environment.
