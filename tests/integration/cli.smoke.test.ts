import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ROOT_DIR = join(__dirname, '..', '..')
const CLI_PATH = join(ROOT_DIR, 'bin', 'cli.js')
const RUN_SCRIPT_PATH = join(ROOT_DIR, 'bin', 'run-script.js')

function runNode(args: string[]) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  })
}

describe('CLI smoke tests', () => {
  it('should display help output', () => {
    const result = runNode([CLI_PATH, '--help'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Usage: release-it-preset')
  })

  it('should run the check utility through the CLI', () => {
    const result = runNode([CLI_PATH, 'check'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Check complete')
  })

  it('should execute run-script helper and fallback when needed', () => {
    const result = runNode([RUN_SCRIPT_PATH, 'check-config'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Check complete')
  })
})
