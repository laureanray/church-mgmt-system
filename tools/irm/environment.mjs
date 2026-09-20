// Resolve the selected worktree's Next env loader, never the launcher's checkout.
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
const localRequire = createRequire(resolve('package.json'))
const nextRequire = createRequire(localRequire.resolve('next/package.json'))
const names = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'DATABASE_URL', 'DIRECT_URL', 'POSTGRES_URL', 'POSTGRES_URL_NON_POOLING']
const sources = Object.fromEntries(names.filter(k => process.env[k] !== undefined).map(k => [k, 'process environment']))
const { loadEnvConfig } = nextRequire('@next/env')
const { loadedEnvFiles } = loadEnvConfig(process.cwd(), true, { info() {}, error() { throw new Error('Environment parsing failed') } })
for (const file of loadedEnvFiles) {
  for (const key of names) if (!sources[key] && Object.hasOwn(file.env, key)) sources[key] = file.path
}
const variables = names.map(name => ({ name, state: process.env[name]?.trim() ? 'set' : process.env[name] === undefined ? 'missing' : 'empty', source: sources[name] || null }))
// Connection values are consumed privately by the Python backend. Only metadata
// is included in public status/JSON; never forward this raw result to the UI.
process.stdout.write(JSON.stringify({ variables, files: ['.env.development.local', '.env.local', '.env.development', '.env'], url: process.env.NEXT_PUBLIC_SUPABASE_URL || '', key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', database_url: process.env.DATABASE_URL || process.env.POSTGRES_URL || '', direct_url: process.env.DIRECT_URL || process.env.POSTGRES_URL_NON_POOLING || '' }))
