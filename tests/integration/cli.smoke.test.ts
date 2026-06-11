import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const ROOT_DIR = join(__dirname, '..', '..')
const CLI_PATH = join(ROOT_DIR, 'bin', 'cli.js')
const RUN_SCRIPT_PATH = join(ROOT_DIR, 'bin', 'run-script.js')

function runNode(args: string[], opts: { cwd?: string } = {}) {
  return spawnSync(process.execPath, args, {
    cwd: opts.cwd ?? ROOT_DIR,
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

  it('should wire annotate as a utility command', () => {
    // Mutation lock: removing the annotate entry from bin/cli.js
    // UTILITY_COMMANDS makes the CLI reject the command (unknown command
    // error) instead of resolving it to dist/scripts/annotate-changelog.js.
    // This spawns the real CLI — a local copy of the map cannot catch
    // de-wiring.
    const help = runNode([CLI_PATH, '--help'])
    expect(help.stdout).toContain('annotate')

    const result = runNode([CLI_PATH, 'annotate'], { cwd: tmpdir() })
    const output = `${result.stdout}\n${result.stderr}`
    expect(output).not.toContain('Invalid utility command')
    expect(output).not.toContain('Unknown command')
  })

  it('should execute run-script helper and fallback when needed', () => {
    const result = runNode([RUN_SCRIPT_PATH, 'check-config'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Check complete')
  })
})
