#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

function loadDotEnv(file = '.env') {
  try {
    const content = fs.readFileSync(path.resolve(process.cwd(), file), 'utf8')
    content.split(/\r?\n/).forEach((line) => {
      if (!line || /^\s*#/.test(line)) return
      const idx = line.indexOf('=')
      if (idx < 0) return
      const key = line.slice(0, idx).trim()
      let val = line.slice(idx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      if (!(key in process.env)) process.env[key] = val
    })
  } catch {}
}

function parseArgs() {
  const args = process.argv.slice(2)
  return { write: args.includes('--write') }
}

function getEnv(name, def = '') {
  return process.env[name] ?? def
}

function deriveRefFromPublicUrl(pubUrl) {
  try {
    if (!pubUrl) return ''
    const u = new URL(pubUrl)
    const host = u.hostname // <ref>.supabase.co
    const [ref] = host.split('.')
    if (!ref) return ''
    return ref
  } catch {
    return ''
  }
}

function buildDatabaseUrl() {
  const publicUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL', '')
  const ref = deriveRefFromPublicUrl(publicUrl)
  const usePooler = ['1','true','yes'].includes(getEnv('SUPABASE_USE_POOLER','').toLowerCase())

  const host = getEnv('SUPABASE_DB_HOST', '')
  const name = getEnv('SUPABASE_DB_NAME', 'postgres')
  let user = getEnv('SUPABASE_DB_USER', '')
  const pass = getEnv('SUPABASE_DB_PASSWORD', '')
  const port = parseInt(getEnv('SUPABASE_DB_PORT', usePooler ? '6543' : '5432'), 10)

  // Defaults when not provided
  if (!user) {
    user = usePooler && ref ? `postgres.${ref}` : 'postgres'
  }

  // Host default only for direct; pooler host must be provided explicitly
  let computedHost = host
  if (!computedHost && !usePooler && ref) {
    computedHost = `db.${ref}.supabase.co`
  }

  if (!computedHost || !pass) {
    return { url: '', reason: 'Missing SUPABASE_DB_HOST (required for pooler) or SUPABASE_DB_PASSWORD' }
  }

  const base = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${computedHost}:${port}/${encodeURIComponent(name)}`
  const params = new URLSearchParams()
  params.set('sslmode', 'require')
  if (usePooler) {
    params.set('pgbouncer', 'true')
    params.set('connection_limit', '1')
  }
  const url = `${base}?${params.toString()}`
  return { url, mode: usePooler ? 'pooler' : 'direct' }
}

function writeEnvDatabaseUrl(dbUrl) {
  const envPath = path.resolve(process.cwd(), '.env')
  let content = ''
  try {
    content = fs.readFileSync(envPath, 'utf8')
  } catch {
    console.error('No .env found; create one first.')
    process.exit(1)
  }
  const lines = content.split(/\r?\n/)
  let set = false
  const updated = lines.map((line) => {
    if (line.startsWith('DATABASE_URL=')) {
      set = true
      return `DATABASE_URL=${dbUrl}`
    }
    return line
  })
  if (!set) updated.push(`DATABASE_URL=${dbUrl}`)
  fs.writeFileSync(envPath, updated.join('\n'))
}

loadDotEnv()
const { write } = parseArgs()
const { url, reason, mode } = buildDatabaseUrl()
if (!url) {
  console.error('Could not build DATABASE_URL:', reason)
  console.error('Set SUPABASE_DB_PASSWORD and SUPABASE_DB_HOST (required for pooler).')
  process.exit(1)
}

if (write) {
  writeEnvDatabaseUrl(url)
  console.log(`DATABASE_URL (${mode}) updated in .env`)
} else {
  console.log(url)
}
