import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FIRST_TICK_DELAY_MS = 10_000
const cronOnly = process.argv.includes('--cron-only')

const env = {
  ...process.env,
  ...readEnvFile('.env.local'),
}

const baseUrl = env.AUTOMATION_CRON_BASE_URL || 'http://localhost:3000'
const cronUrl = `${baseUrl.replace(/\/$/, '')}/api/automations/cron`
const cronSecret = env.AUTOMATION_CRON_SECRET
const minSleepMs = Math.max(1, Number(env.AUTOMATION_CRON_MIN_SLEEP_SECONDS || 1)) * 1_000
const retrySleepMs = Math.max(1, Number(env.AUTOMATION_CRON_RETRY_SECONDS || 5)) * 1_000

let nextProcess = null
let tickInFlight = false

if (!cronOnly) {
  nextProcess = spawn('next', ['dev'], {
    env,
    shell: true,
    stdio: 'inherit',
  })

  nextProcess.on('exit', (code, signal) => {
    if (signal) process.exit(0)
    process.exit(code ?? 0)
  })
}

if (!cronSecret) {
  console.warn(
    '[automation-cron] Disabled: AUTOMATION_CRON_SECRET is missing in .env.local.',
  )
} else {
  console.log(`[automation-cron] Enabled: ${cronUrl} adaptive schedule`)
  setTimeout(() => {
    scheduleNext(0)
  }, cronOnly ? 0 : FIRST_TICK_DELAY_MS)
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    if (nextProcess && !nextProcess.killed) {
      nextProcess.kill(signal)
    }
    process.exit(0)
  })
}

function scheduleNext(delayMs) {
  const safeDelay = Math.max(minSleepMs, delayMs)
  setTimeout(async () => {
    const nextDelay = await tick()
    scheduleNext(nextDelay)
  }, safeDelay)
}

async function tick() {
  if (tickInFlight) return retrySleepMs
  tickInFlight = true
  try {
    const response = await fetch(cronUrl, {
      headers: { 'x-cron-secret': cronSecret },
    })
    const body = await response.text()
    if (!response.ok) {
      console.warn(`[automation-cron] ${response.status}: ${body}`)
      return retrySleepMs
    }
    const result = parseCronResponse(body)
    if (result.summary) {
      console.log(`[automation-cron] ${result.summary}`)
    }
    return result.nextCheckMs ?? 60_000
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[automation-cron] Waiting for app: ${message}`)
    return retrySleepMs
  } finally {
    tickInFlight = false
  }
}

function readEnvFile(fileName) {
  const path = resolve(process.cwd(), fileName)
  if (!existsSync(path)) return {}

  const parsed = {}
  const content = readFileSync(path, 'utf8')
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const equalsIndex = line.indexOf('=')
    if (equalsIndex === -1) continue

    const key = line.slice(0, equalsIndex).trim()
    let value = line.slice(equalsIndex + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }
  return parsed
}

function parseCronResponse(body) {
  try {
    const json = JSON.parse(body)
    const processed = Number(json.processed ?? 0)
    const automations = Number(json.scheduled_automations ?? 0)
    const contacts = Number(json.scheduled_contacts ?? 0)
    const nextCheckMs = Number(json.next_check_ms)
    const summary =
      processed === 0 && automations === 0 && contacts === 0
        ? null
        : [
            `waits=${processed}`,
            `automations=${automations}`,
            `contacts=${contacts}`,
          ].join(' ')
    return {
      summary,
      nextCheckMs: Number.isFinite(nextCheckMs) ? nextCheckMs : null,
    }
  } catch {
    return { summary: body, nextCheckMs: null }
  }
}
