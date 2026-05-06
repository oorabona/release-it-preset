import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * Integration tests for `release-it-preset init` new flags (issue #48).
 *
 * Coverage: scenarios A, B, C, D, E, F from spec §5.
 *
 * - A: Greenfield single-package + --with-workflows --yes → workflow file created
 * - B: Custom workflow name --workflow-name=publish.yml
 * - C: Greenfield monorepo (pnpm-workspace.yaml) → per-package configs, no root
 * - D: Existing workflow file → skipped, stdout advice
 * - E: Invalid workflow name --workflow-name=../etc.yml → exit non-zero
 * - F: pnpm-workspace.yaml with path-traversal → exit non-zero
 *
 * Env isolation: GITHUB_* vars are cleared to prevent CI runner leakage
 * (see feedback_e2e_env_isolation.md).
 */

const CLI_PATH = join(process.cwd(), 'bin', 'cli.js')
const TEST_BASE = join(process.cwd(), '.test-init-flags')

// Env vars that CI runners set automatically — must be cleared so tests
// don't inherit runner state (feedback_e2e_env_isolation.md).
const CLEARED_CI_ENV: Record<string, string> = {
  GITHUB_REPOSITORY: '',
  GITHUB_TOKEN: '',
  GITHUB_ACTIONS: '',
  GITHUB_EVENT_NAME: '',
  GITHUB_REF: '',
  GITHUB_SHA: '',
}

function execCLI(
  args: string[],
  cwd: string,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise(resolve => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd,
      env: {
        ...process.env,
        ...CLEARED_CI_ENV,
        NO_COLOR: '1',
      },
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const settle = (result: { code: number | null; stdout: string; stderr: string }) => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timeoutHandle)
      resolve(result)
    }

    child.stdout?.on('data', d => {
      stdout += d.toString()
    })
    child.stderr?.on('data', d => {
      stderr += d.toString()
    })

    child.on('close', code => settle({ code, stdout, stderr }))
    child.on('error', err => settle({ code: 1, stdout, stderr: err.message }))

    const timeoutHandle = setTimeout(() => {
      child.kill()
      settle({ code: 1, stdout, stderr: 'Test timeout after 10s' })
    }, 10_000)
  })
}

function createTestDir(name: string, files: Record<string, string>): string {
  const dir = join(TEST_BASE, name)
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
  }
  mkdirSync(dir, { recursive: true })

  for (const [relPath, content] of Object.entries(files)) {
    const fullPath = join(dir, relPath)
    mkdirSync(join(fullPath, '..'), { recursive: true })
    writeFileSync(fullPath, content, 'utf8')
  }

  return dir
}

afterEach(() => {
  if (existsSync(TEST_BASE)) {
    rmSync(TEST_BASE, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Scenario A — Greenfield single-package + --with-workflows
// ---------------------------------------------------------------------------
describe('Scenario A — greenfield single + --with-workflows', () => {
  it('creates CHANGELOG, .release-it.json, and workflow file', async () => {
    const dir = createTestDir('A', {
      'package.json': JSON.stringify({ name: 'my-lib', version: '0.0.1' }),
    })

    const { code, stdout, stderr } = await execCLI(['init', '--yes', '--with-workflows'], dir)

    // Should succeed
    expect(code, `stderr: ${stderr}`).toBe(0)

    // CHANGELOG.md created
    expect(existsSync(join(dir, 'CHANGELOG.md'))).toBe(true)

    // .release-it.json created with default extends
    const config = JSON.parse(readFileSync(join(dir, '.release-it.json'), 'utf8'))
    expect(config.extends).toBe('@oorabona/release-it-preset/config/default')

    // Workflow file created
    const workflowPath = join(dir, '.github', 'workflows', 'release.yml')
    expect(existsSync(workflowPath), 'workflow file should exist').toBe(true)

    const workflowContent = readFileSync(workflowPath, 'utf8')
    // The env block pins the version; the step references it via ${{ env.NODE_VERSION }}
    expect(workflowContent).toMatch(/NODE_VERSION.*'?24'?|node-version.*24/i)
    expect(workflowContent).toContain('retry-publish-preflight')
    expect(workflowContent).toContain('OIDC')
    // HIGH fix: publish step must use release-it directly (not release-it-preset retry-publish)
    // to avoid CLI mismatch check when .release-it.json extends a preset config.
    expect(workflowContent).toMatch(
      /require\.resolve\(['"]@oorabona\/release-it-preset\/config\/retry-publish['"]\)/,
    )
    expect(workflowContent).toContain('release-it --ci --config')
    expect(workflowContent).not.toContain('release-it-preset retry-publish --ci')

    // stdout confirms creation
    expect(stdout + stderr).toMatch(/Created.*release\.yml|workflow.*Created/i)
  })
})

// ---------------------------------------------------------------------------
// Scenario B — Custom workflow name
// ---------------------------------------------------------------------------
describe('Scenario B — custom --workflow-name', () => {
  it('creates workflow at custom name, not at default release.yml', async () => {
    const dir = createTestDir('B', {
      'package.json': JSON.stringify({ name: 'my-lib', version: '0.0.1' }),
    })

    const { code, stderr } = await execCLI(
      ['init', '--yes', '--with-workflows', '--workflow-name=publish.yml'],
      dir,
    )

    expect(code, `stderr: ${stderr}`).toBe(0)

    // Custom name exists
    expect(existsSync(join(dir, '.github', 'workflows', 'publish.yml'))).toBe(true)

    // Default name does NOT exist
    expect(existsSync(join(dir, '.github', 'workflows', 'release.yml'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Scenario C — Greenfield monorepo (pnpm-workspace.yaml)
// ---------------------------------------------------------------------------
describe('Scenario C — monorepo auto-detection', () => {
  it('scaffolds per-package .release-it.json, skips root config', async () => {
    const dir = createTestDir('C', {
      'pnpm-workspace.yaml': `packages:\n  - 'packages/*'\n`,
      'package.json': JSON.stringify({ name: 'my-monorepo', version: '0.0.0' }),
      'packages/a/package.json': JSON.stringify({ name: '@my/a', version: '0.0.1' }),
      'packages/b/package.json': JSON.stringify({ name: '@my/b', version: '0.0.1' }),
    })

    const { code, stdout, stderr } = await execCLI(['init', '--yes'], dir)

    expect(code, `stderr: ${stderr}`).toBe(0)

    // Both package configs created
    const configA = join(dir, 'packages', 'a', '.release-it.json')
    const configB = join(dir, 'packages', 'b', '.release-it.json')
    expect(existsSync(configA), 'packages/a/.release-it.json should exist').toBe(true)
    expect(existsSync(configB), 'packages/b/.release-it.json should exist').toBe(true)

    // Root .release-it.json NOT created
    expect(
      existsSync(join(dir, '.release-it.json')),
      'root .release-it.json should NOT exist',
    ).toBe(false)

    // Post-init guidance printed
    expect(stdout + stderr).toMatch(/pnpm -F .* exec release-it-preset/i)
  })
})

// ---------------------------------------------------------------------------
// Scenario D — Existing workflow file → skip with advice
// ---------------------------------------------------------------------------
describe('Scenario D — existing workflow collision', () => {
  it('skips existing workflow file and prints advice', async () => {
    const existingWorkflowContent = '# existing workflow\non: push\n'
    const dir = createTestDir('D', {
      'package.json': JSON.stringify({ name: 'my-lib', version: '0.0.1' }),
      '.github/workflows/release.yml': existingWorkflowContent,
    })

    const { code, stdout, stderr } = await execCLI(['init', '--yes', '--with-workflows'], dir)

    expect(code, `stderr: ${stderr}`).toBe(0)

    // File unchanged
    const workflowContent = readFileSync(join(dir, '.github', 'workflows', 'release.yml'), 'utf8')
    expect(workflowContent).toBe(existingWorkflowContent)

    // Stdout includes skip advice
    expect(stdout + stderr).toMatch(/already exists|skipping/i)
  })
})

// ---------------------------------------------------------------------------
// Scenario E — Invalid workflow name → exit non-zero
// ---------------------------------------------------------------------------
describe('Scenario E — invalid --workflow-name', () => {
  it('exits non-zero with validation error for path traversal', async () => {
    const dir = createTestDir('E', {
      'package.json': JSON.stringify({ name: 'my-lib', version: '0.0.1' }),
    })

    const { code, stderr, stdout } = await execCLI(['init', '--workflow-name=../etc.yml'], dir)

    expect(code).not.toBe(0)
    expect(stderr + stdout).toMatch(/invalid workflow name|validation/i)
  })
})

// ---------------------------------------------------------------------------
// Scenario F — pnpm-workspace.yaml with path-traversal → exit non-zero
// ---------------------------------------------------------------------------
describe('Scenario F — path-traversal workspace pattern', () => {
  it('exits non-zero with containment error', async () => {
    const dir = createTestDir('F', {
      'package.json': JSON.stringify({ name: 'my-monorepo', version: '0.0.0' }),
      'pnpm-workspace.yaml': `packages:\n  - '../etc'\n`,
    })

    const { code, stderr, stdout } = await execCLI(['init', '--yes'], dir)

    expect(code).not.toBe(0)
    expect(stderr + stdout).toMatch(/outside the project root|containment/i)
  })
})

// ---------------------------------------------------------------------------
// Scenario G — pnpm-workspace.yaml with empty packages: → single-package mode + warning
// ---------------------------------------------------------------------------
describe('Scenario G — workspace config exists but no packages declared', () => {
  it('proceeds in single-package mode and emits a warning', async () => {
    const dir = createTestDir('G', {
      'package.json': JSON.stringify({ name: 'my-pkg', version: '0.0.1' }),
      // packages: key present but no list items beneath it
      'pnpm-workspace.yaml': `packages:\n`,
    })

    const { code, stdout, stderr } = await execCLI(['init', '--yes'], dir)

    // Should exit successfully (soft warning, not fatal)
    expect(code, `stderr: ${stderr}`).toBe(0)

    // Single-package config created at root (not per-package)
    expect(existsSync(join(dir, '.release-it.json')), 'root .release-it.json should exist').toBe(
      true,
    )

    // Root config should NOT be absent (i.e., did not enter monorepo mode)
    expect(existsSync(join(dir, 'packages')), 'packages/ dir should not be created').toBe(false)

    // Warning emitted to stdout/stderr
    expect(stdout + stderr).toMatch(/workspace.*present|no packages declared|treating as single/i)
  })
})

// ---------------------------------------------------------------------------
// Scenario H — pnpm-workspace.yaml with YAML alias reference → exit non-zero
// ---------------------------------------------------------------------------
describe('Scenario H — pnpm-workspace.yaml with YAML alias reference', () => {
  it('exits non-zero with unsupported alias error', async () => {
    const dir = createTestDir('H', {
      'package.json': JSON.stringify({ name: 'my-monorepo', version: '0.0.0' }),
      'pnpm-workspace.yaml': `packages: *pkgList\n`,
    })

    const { code, stderr, stdout } = await execCLI(['init', '--yes'], dir)

    expect(code).not.toBe(0)
    expect(stderr + stdout).toMatch(/alias|anchor|not supported/i)
  })
})
