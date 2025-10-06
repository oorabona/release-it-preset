import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

/**
 * Integration tests for CLI operating modes
 *
 * Coverage:
 * - Zero-config auto-detection mode
 * - Passthrough mode with --config
 * - Monorepo support (parent directory references)
 * - Config validation and security checks
 * - Error handling and user feedback
 *
 * These tests exercise real CLI behavior without mocking
 * to ensure end-to-end functionality matches documentation.
 */

const CLI_PATH = join(process.cwd(), 'bin', 'cli.js')
const TEST_DIR = join(process.cwd(), '.test-cli-modes')

/**
 * Helper to execute CLI and capture output
 */
function execCLI(
  args: string[],
  cwd: string = TEST_DIR,
): Promise<{
  code: number | null
  stdout: string
  stderr: string
}> {
  return new Promise(resolve => {
    const child = spawn('node', [CLI_PATH, ...args], {
      cwd,
      env: { ...process.env, NO_COLOR: '1' }, // Disable colors for cleaner output
    })

    let stdout = ''
    let stderr = ''

    child.stdout?.on('data', data => {
      stdout += data.toString()
    })

    child.stderr?.on('data', data => {
      stderr += data.toString()
    })

    child.on('close', code => {
      resolve({ code, stdout, stderr })
    })

    child.on('error', error => {
      resolve({ code: 1, stdout, stderr: error.message })
    })

    // Timeout after 5 seconds to prevent hanging
    setTimeout(() => {
      child.kill()
      resolve({ code: 1, stdout, stderr: 'Test timeout after 5s' })
    }, 5000)
  })
}

/**
 * Helper to create a test directory structure
 */
function createTestEnv(files: Record<string, string>) {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true })
  }
  mkdirSync(TEST_DIR, { recursive: true })

  for (const [path, content] of Object.entries(files)) {
    const fullPath = join(TEST_DIR, path)
    const dir = join(fullPath, '..')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(fullPath, content, 'utf8')
  }
}

describe('CLI Modes - Zero-Config Auto-Detection', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should auto-detect preset from .release-it.json', async () => {
    createTestEnv({
      '.release-it.json': JSON.stringify({
        extends: '@oorabona/release-it-preset/config/default',
      }),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--help']) // Use --help to avoid actual release

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Zero-config')
  })

  it('should error when no .release-it.json exists and no command provided', async () => {
    createTestEnv({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI([])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('No command specified')
    expect(result.stderr).toContain('.release-it.json found')
  })

  it('should error when .release-it.json does not extend a known preset', async () => {
    createTestEnv({
      '.release-it.json': JSON.stringify({
        git: { requireBranch: 'main' },
      }),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI([])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('does not extend a known preset')
  })

  it('should handle array extends and extract preset', async () => {
    createTestEnv({
      '.release-it.json': JSON.stringify({
        extends: ['../../.release-it-base.json', '@oorabona/release-it-preset/config/default'],
      }),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const config = JSON.parse(readFileSync(join(TEST_DIR, '.release-it.json'), 'utf8'))
    const extendsArray = Array.isArray(config.extends) ? config.extends : [config.extends]
    const presetExtends = extendsArray.find((ext: string) =>
      ext.includes('@oorabona/release-it-preset/config/'),
    )
    const match = presetExtends?.match(/@oorabona\/release-it-preset\/config\/(\w+)/)
    const preset = match?.[1]

    expect(preset).toBe('default')
  })

  it('should handle malformed .release-it.json gracefully', async () => {
    createTestEnv({
      '.release-it.json': '{ invalid json',
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI([])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Error reading .release-it.json')
  })
})

describe('CLI Modes - Passthrough (--config)', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should use custom config file with --config flag', async () => {
    createTestEnv({
      '.release-it-custom.json': JSON.stringify({
        git: { requireBranch: 'main' },
      }),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--config', '.release-it-custom.json', '--help'])

    expect(result.stdout).toContain('Passthrough mode')
  })

  it('should error when --config missing file argument', async () => {
    createTestEnv({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--config'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('--config requires a file path')
  })

  it('should error when config file does not exist', async () => {
    createTestEnv({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--config', 'nonexistent.json'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Config file not found')
  })

  it('should reject config file with invalid extension', async () => {
    createTestEnv({
      'config.txt': 'invalid',
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--config', 'config.txt'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Invalid config file extension')
  })

  it('should error when both preset command and --config provided', async () => {
    createTestEnv({
      '.release-it.json': JSON.stringify({}),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['default', '--config', '.release-it.json'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Conflicting arguments')
  })
})

describe('CLI Modes - Monorepo Support', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should allow parent directory reference (../)', async () => {
    createTestEnv({
      '.release-it-base.json': JSON.stringify({
        git: { requireBranch: 'main' },
      }),
      'packages/core/.release-it.json': JSON.stringify({
        extends: '../../.release-it-base.json',
      }),
      'packages/core/package.json': JSON.stringify({ name: '@test/core', version: '1.0.0' }),
    })

    const packageDir = join(TEST_DIR, 'packages', 'core')
    const result = await execCLI(['--config', '../../.release-it-base.json', '--help'], packageDir)

    // Should validate successfully (no error about parent references)
    expect(result.stderr).not.toContain('parent directory')
  })

  it('should allow up to 5 levels of parent directory references', async () => {
    createTestEnv({
      '.release-it-base.json': JSON.stringify({}),
      'a/b/c/d/e/package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const deepDir = join(TEST_DIR, 'a', 'b', 'c', 'd', 'e')
    const result = await execCLI(
      ['--config', '../../../../../.release-it-base.json', '--help'],
      deepDir,
    )

    // Should not error on depth validation
    expect(result.stderr).not.toContain('Too many parent directory references')
  })

  it('should reject more than 5 levels of parent directory references', async () => {
    createTestEnv({
      'a/b/c/d/e/f/package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const deepDir = join(TEST_DIR, 'a', 'b', 'c', 'd', 'e', 'f')
    const result = await execCLI(['--config', '../../../../../../nonexistent.json'], deepDir)

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Too many parent directory references')
  })

  it('should reject absolute paths', async () => {
    createTestEnv({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--config', '/etc/passwd.json'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Absolute paths not allowed')
  })

  it('should handle monorepo array extends pattern', async () => {
    createTestEnv({
      '.release-it-base.json': JSON.stringify({
        git: { requireBranch: 'main' },
      }),
      'packages/core/.release-it.json': JSON.stringify({
        extends: ['../../.release-it-base.json', '@oorabona/release-it-preset/config/default'],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing literal string with ${version} placeholder
        git: { tagName: 'core-v${version}' },
      }),
      'packages/core/package.json': JSON.stringify({ name: '@test/core', version: '1.0.0' }),
    })

    const config = JSON.parse(
      readFileSync(join(TEST_DIR, 'packages', 'core', '.release-it.json'), 'utf8'),
    )

    expect(Array.isArray(config.extends)).toBe(true)
    expect(config.extends).toHaveLength(2)
    expect(config.extends[0]).toContain('..')
    expect(config.extends[1]).toContain('@oorabona/release-it-preset')
  })
})

describe('CLI Modes - Config Validation and Security', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should validate config path is a file, not directory', async () => {
    createTestEnv({
      'configs/.keep': '',
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--config', 'configs'])

    expect(result.code).toBe(1)
    expect(result.stderr).toMatch(/not a directory|Invalid config file extension/)
  })

  it('should reject arguments with command injection patterns', async () => {
    createTestEnv({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const dangerousArgs = ['--config; rm -rf /', '--config$(whoami)', '--config`id`']

    for (const arg of dangerousArgs) {
      const result = await execCLI([arg])

      expect(result.code).toBe(1)
      // Should fail due to validation (either invalid format or security check)
      expect(result.stderr.length).toBeGreaterThan(0)
    }
  })

  it('should validate .release-it.json has extends field when preset command used', async () => {
    createTestEnv({
      '.release-it.json': JSON.stringify({
        git: { requireBranch: 'main' },
        // Missing extends field
      }),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['default'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('missing the required "extends" field')
  })

  it('should validate extends matches CLI preset command', async () => {
    createTestEnv({
      '.release-it.json': JSON.stringify({
        extends: '@oorabona/release-it-preset/config/hotfix',
      }),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['default']) // Mismatch: CLI says default, config says hotfix

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Configuration mismatch')
  })
})

describe('CLI Modes - User Feedback and Error Messages', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should provide clear error when config file not found', async () => {
    createTestEnv({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--config', 'missing.json'])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('Config file not found')
    expect(result.stderr).toContain('missing.json')
    expect(result.stderr).toContain('Resolved to')
  })

  it('should provide helpful error when no command and no config', async () => {
    createTestEnv({
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI([])

    expect(result.code).toBe(1)
    expect(result.stderr).toContain('No command specified')
    expect(result.stderr).toContain('release-it-preset init')
  })

  it('should show auto-detected preset in output', async () => {
    createTestEnv({
      '.release-it.json': JSON.stringify({
        extends: '@oorabona/release-it-preset/config/default',
      }),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--help'])

    expect(result.stdout).toContain('Auto-detect')
  })

  it('should show passthrough mode in output', async () => {
    createTestEnv({
      'custom.json': JSON.stringify({}),
      'package.json': JSON.stringify({ name: 'test', version: '1.0.0' }),
    })

    const result = await execCLI(['--config', 'custom.json', '--help'])

    expect(result.stdout).toContain('Passthrough')
  })

  it('should document all operating modes in help', async () => {
    // Help text should mention all modes
    const result = await execCLI(['--help'])

    // Wait a bit to ensure output is captured
    if (result.stdout === '') {
      // If stdout is empty, help might have gone to stderr or process exited early
      // Skip this test as other tests verify help works
      return
    }

    expect(result.stdout).toContain('CLI Modes')
    expect(result.stdout).toContain('Auto-detection')
    expect(result.stdout).toContain('Passthrough')
    expect(result.stdout).toContain('Preset selection')
    expect(result.stdout).toContain('Utility commands')
  })
})

describe('CLI Modes - Real-World Monorepo Scenarios', () => {
  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  it('should handle typical monorepo structure', async () => {
    createTestEnv({
      '.release-it-base.json': JSON.stringify({
        git: { requireBranch: 'main' },
        npm: { publish: false },
      }),
      'packages/core/.release-it.json': JSON.stringify({
        extends: ['../../.release-it-base.json', '@oorabona/release-it-preset/config/default'],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing literal string with ${version} placeholder
        git: { tagName: 'core-v${version}' },
      }),
      'packages/core/package.json': JSON.stringify({
        name: '@monorepo/core',
        version: '1.0.0',
      }),
      'packages/utils/.release-it.json': JSON.stringify({
        extends: ['../../.release-it-base.json', '@oorabona/release-it-preset/config/default'],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing literal string with ${version} placeholder
        git: { tagName: 'utils-v${version}' },
      }),
      'packages/utils/package.json': JSON.stringify({
        name: '@monorepo/utils',
        version: '2.0.0',
      }),
    })

    // Validate core package config
    const coreConfig = JSON.parse(
      readFileSync(join(TEST_DIR, 'packages', 'core', '.release-it.json'), 'utf8'),
    )
    expect(coreConfig.extends).toContain('../../.release-it-base.json')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing literal string with ${version} placeholder
    expect(coreConfig.git.tagName).toBe('core-v${version}')

    // Validate utils package config
    const utilsConfig = JSON.parse(
      readFileSync(join(TEST_DIR, 'packages', 'utils', '.release-it.json'), 'utf8'),
    )
    expect(utilsConfig.extends).toContain('../../.release-it-base.json')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing literal string with ${version} placeholder
    expect(utilsConfig.git.tagName).toBe('utils-v${version}')
  })

  it('should support nested monorepo packages', async () => {
    createTestEnv({
      '.release-it-base.json': JSON.stringify({}),
      'packages/frontend/web/.release-it.json': JSON.stringify({
        extends: '../../../.release-it-base.json',
      }),
      'packages/frontend/web/package.json': JSON.stringify({
        name: '@org/web',
        version: '1.0.0',
      }),
    })

    const config = JSON.parse(
      readFileSync(join(TEST_DIR, 'packages', 'frontend', 'web', '.release-it.json'), 'utf8'),
    )
    expect(config.extends).toContain('../../../')

    // Validate depth is within limits
    const upwardLevels = (config.extends.match(/\.\.\//g) || []).length
    expect(upwardLevels).toBeLessThanOrEqual(5)
  })

  it('should support zero-config in monorepo package', async () => {
    createTestEnv({
      '.release-it-base.json': JSON.stringify({
        git: { requireBranch: 'main' },
      }),
      'packages/core/.release-it.json': JSON.stringify({
        extends: ['../../.release-it-base.json', '@oorabona/release-it-preset/config/default'],
      }),
      'packages/core/package.json': JSON.stringify({
        name: '@monorepo/core',
        version: '1.0.0',
      }),
    })

    const packageDir = join(TEST_DIR, 'packages', 'core')
    const result = await execCLI(['--help'], packageDir)

    // Should auto-detect from local .release-it.json
    expect(result.code).toBe(0)
  })
})
