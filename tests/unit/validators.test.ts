import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  sanitizeArgs,
  validateConfigName,
  validateConfigPath,
  validateUtilityCommand,
} from '../../bin/validators.js'

const TEST_DIR = join(process.cwd(), '.test-validators')

describe('validators - validateConfigName', () => {
  it('should accept valid config name', () => {
    const allowedConfigs = new Set(['default', 'hotfix', 'changelog-only'])

    expect(() => validateConfigName('default', allowedConfigs)).not.toThrow()
    expect(() => validateConfigName('hotfix', allowedConfigs)).not.toThrow()
  })

  it('should reject invalid config name', () => {
    const allowedConfigs = new Set(['default', 'hotfix'])

    expect(() => validateConfigName('invalid', allowedConfigs)).toThrow(
      'Invalid configuration name',
    )
    expect(() => validateConfigName('unknown', allowedConfigs)).toThrow()
  })

  it('should provide helpful error message with allowed configs', () => {
    const allowedConfigs = new Set(['default', 'hotfix', 'changelog-only'])

    try {
      validateConfigName('invalid', allowedConfigs)
      expect.fail('Should have thrown error')
    } catch (error) {
      expect((error as Error).message).toContain('Allowed configurations')
      expect((error as Error).message).toContain('default')
      expect((error as Error).message).toContain('hotfix')
    }
  })
})

describe('validators - validateUtilityCommand', () => {
  it('should accept valid utility command', () => {
    const allowedCommands = new Set(['init', 'update', 'validate', 'check'])

    expect(() => validateUtilityCommand('init', allowedCommands)).not.toThrow()
    expect(() => validateUtilityCommand('update', allowedCommands)).not.toThrow()
  })

  it('should reject invalid utility command', () => {
    const allowedCommands = new Set(['init', 'update'])

    expect(() => validateUtilityCommand('invalid', allowedCommands)).toThrow(
      'Invalid utility command',
    )
  })

  it('should provide helpful error message with allowed commands', () => {
    const allowedCommands = new Set(['init', 'update', 'validate'])

    try {
      validateUtilityCommand('unknown', allowedCommands)
      expect.fail('Should have thrown error')
    } catch (error) {
      expect((error as Error).message).toContain('Allowed commands')
      expect((error as Error).message).toContain('init')
      expect((error as Error).message).toContain('update')
    }
  })
})

describe('validators - sanitizeArgs', () => {
  it('should accept safe arguments', () => {
    const safeArgs = [
      '--dry-run',
      '--verbose',
      '--no-git.push',
      'default',
      'hotfix',
      '--config=file.json',
    ]

    expect(() => sanitizeArgs(safeArgs)).not.toThrow()
  })

  it('should reject shell control operators', () => {
    const dangerousArgs = ['test; rm -rf /', 'test && whoami', 'test | grep password', 'test `id`']

    for (const arg of dangerousArgs) {
      expect(() => sanitizeArgs([arg])).toThrow('potentially dangerous characters')
    }
  })

  it('should reject command substitution patterns', () => {
    expect(() => sanitizeArgs(['test$(whoami)'])).toThrow('dangerous')
    // biome-ignore lint/suspicious/noTemplateCurlyInString: Testing security validation of shell substitution
    expect(() => sanitizeArgs(['test${USER}'])).toThrow('dangerous')
  })

  it('should reject redirection operators', () => {
    expect(() => sanitizeArgs(['test > /dev/null'])).toThrow('dangerous')
    expect(() => sanitizeArgs(['test < input.txt'])).toThrow('dangerous')
  })

  it('should reject line breaks', () => {
    expect(() => sanitizeArgs(['test\nrm -rf'])).toThrow('dangerous')
    expect(() => sanitizeArgs(['test\rrm -rf'])).toThrow('dangerous')
  })

  it('should reject null bytes', () => {
    expect(() => sanitizeArgs(['test\0malicious'])).toThrow('null bytes')
  })

  it('should provide detailed error information', () => {
    try {
      sanitizeArgs(['test; rm'])
      expect.fail('Should have thrown error')
    } catch (error) {
      const message = (error as Error).message
      expect(message).toContain('Argument 1')
      expect(message).toContain('potentially dangerous characters')
      expect(message).toContain('security risk')
    }
  })

  it('should validate all arguments in array', () => {
    const args = ['--dry-run', 'test; rm', '--verbose']

    try {
      sanitizeArgs(args)
      expect.fail('Should have thrown error')
    } catch (error) {
      expect((error as Error).message).toContain('Argument 2')
    }
  })
})

describe('validators - validateConfigPath (v0.9.0 monorepo support)', () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
    mkdirSync(TEST_DIR, { recursive: true })
  })

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true })
    }
  })

  describe('Extension Whitelist Validation', () => {
    it('should accept .json files', () => {
      const file = join(TEST_DIR, 'config.json')
      writeFileSync(file, '{}')

      const origCwd = process.cwd()
      process.chdir(TEST_DIR)
      expect(() => validateConfigPath('config.json')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should accept .js, .cjs, .mjs files', () => {
      const extensions = ['.js', '.cjs', '.mjs']
      const origCwd = process.cwd()
      process.chdir(TEST_DIR)

      for (const ext of extensions) {
        const file = join(TEST_DIR, `config${ext}`)
        writeFileSync(file, 'module.exports = {}')

        expect(() => validateConfigPath(`config${ext}`)).not.toThrow()
      }

      process.chdir(origCwd)
    })

    it('should accept .yaml, .yml files', () => {
      const extensions = ['.yaml', '.yml']
      const origCwd = process.cwd()
      process.chdir(TEST_DIR)

      for (const ext of extensions) {
        const file = join(TEST_DIR, `config${ext}`)
        writeFileSync(file, 'git:\n  requireBranch: main')

        expect(() => validateConfigPath(`config${ext}`)).not.toThrow()
      }

      process.chdir(origCwd)
    })

    it('should accept .toml files', () => {
      const file = join(TEST_DIR, 'config.toml')
      writeFileSync(file, '[git]\nrequireBranch = "main"')

      const origCwd = process.cwd()
      process.chdir(TEST_DIR)
      expect(() => validateConfigPath('config.toml')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should reject non-config file extensions', () => {
      const invalidExtensions = ['.txt', '.sh', '.exe', '.pdf', '.zip']
      const origCwd = process.cwd()
      process.chdir(TEST_DIR)

      for (const ext of invalidExtensions) {
        const file = join(TEST_DIR, `file${ext}`)
        writeFileSync(file, 'content')

        expect(() => validateConfigPath(`file${ext}`)).toThrow('Invalid config file extension')
      }

      process.chdir(origCwd)
    })

    it('should handle case-insensitive extensions', () => {
      const file = join(TEST_DIR, 'config.JSON')
      writeFileSync(file, '{}')

      const origCwd = process.cwd()
      process.chdir(TEST_DIR)
      expect(() => validateConfigPath('config.JSON')).not.toThrow()
      process.chdir(origCwd)
    })
  })

  describe('Parent Directory Depth Validation', () => {
    it('should allow 1 level of parent directory reference', () => {
      mkdirSync(join(TEST_DIR, 'packages'), { recursive: true })
      const file = join(TEST_DIR, 'config.json')
      writeFileSync(file, '{}')

      const origCwd = process.cwd()
      process.chdir(join(TEST_DIR, 'packages'))
      expect(() => validateConfigPath('../config.json')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should allow up to 5 levels of parent directory reference', () => {
      const deepDir = join(TEST_DIR, 'a', 'b', 'c', 'd', 'e')
      mkdirSync(deepDir, { recursive: true })
      const file = join(TEST_DIR, 'config.json')
      writeFileSync(file, '{}')

      const origCwd = process.cwd()
      process.chdir(deepDir)
      expect(() => validateConfigPath('../../../../../config.json')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should reject more than 5 levels of parent directory reference', () => {
      const path = '../../../../../../config.json' // 6 levels

      expect(() => validateConfigPath(path)).toThrow('Too many parent directory references')
      expect(() => validateConfigPath(path)).toThrow('Maximum allowed: 5')
    })

    it('should count parent references correctly', () => {
      const testCases = [
        { path: '../config.json', levels: 1 },
        { path: '../../config.json', levels: 2 },
        { path: '../../../config.json', levels: 3 },
        { path: '../../../../config.json', levels: 4 },
        { path: '../../../../../config.json', levels: 5 },
        { path: '../../../../../../config.json', levels: 6 },
      ]

      for (const { path, levels } of testCases) {
        const upwardLevels = (path.match(/\.\.\//g) || []).length
        expect(upwardLevels).toBe(levels)
      }
    })
  })

  describe('Absolute Path Validation', () => {
    it('should reject Unix absolute paths', () => {
      expect(() => validateConfigPath('/etc/passwd.json')).toThrow('Absolute paths not allowed')
      expect(() => validateConfigPath('/home/user/config.json')).toThrow('Absolute paths')
    })

    it('should reject Windows absolute paths on Windows platform', () => {
      // On Linux, Windows paths are treated as regular paths without drive letters
      // We test that absolute paths with : are still caught
      expect(() => validateConfigPath('/C:/Windows/config.json')).toThrow('Absolute paths')
    })

    it('should provide helpful error message for absolute paths', () => {
      try {
        validateConfigPath('/etc/config.json')
        expect.fail('Should have thrown error')
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('Use relative paths')
        expect(message).toContain('monorepo')
        expect(message).toContain('../../config.json')
      }
    })
  })

  describe('File Existence Validation', () => {
    it('should error when config file does not exist', () => {
      expect(() => validateConfigPath('nonexistent.json')).toThrow('Config file not found')
    })

    it('should provide resolved path in error message', () => {
      try {
        validateConfigPath('missing.json')
        expect.fail('Should have thrown error')
      } catch (error) {
        const message = (error as Error).message
        expect(message).toContain('Resolved to:')
        expect(message).toContain('Check that the file exists')
      }
    })

    it('should accept existing config files', () => {
      const file = join(TEST_DIR, 'exists.json')
      writeFileSync(file, '{}')

      const origCwd = process.cwd()
      process.chdir(TEST_DIR)
      expect(() => validateConfigPath('exists.json')).not.toThrow()
      process.chdir(origCwd)
    })
  })

  describe('File Type Validation', () => {
    it('should reject directories', () => {
      const dir = join(TEST_DIR, 'configs.json')
      mkdirSync(dir, { recursive: true })

      const origCwd = process.cwd()
      process.chdir(TEST_DIR)
      expect(() => validateConfigPath('configs.json')).toThrow('must be a file, not a directory')
      process.chdir(origCwd)
    })

    it('should accept regular files', () => {
      const file = join(TEST_DIR, 'regular.json')
      writeFileSync(file, '{}')

      const origCwd = process.cwd()
      process.chdir(TEST_DIR)
      expect(() => validateConfigPath('regular.json')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should provide resolved path in directory error', () => {
      const dir = join(TEST_DIR, 'dir.json')
      mkdirSync(dir, { recursive: true })

      const origCwd = process.cwd()
      process.chdir(TEST_DIR)
      try {
        validateConfigPath('dir.json')
        expect.fail('Should have thrown error')
      } catch (error) {
        expect((error as Error).message).toContain('Resolved to:')
      }
      process.chdir(origCwd)
    })
  })

  describe('Return Value', () => {
    it('should return absolute path when valid', () => {
      const file = join(TEST_DIR, 'config.json')
      writeFileSync(file, '{}')

      const origCwd = process.cwd()
      process.chdir(TEST_DIR)
      const result = validateConfigPath('config.json')

      expect(result).toBeTruthy()
      expect(result).toContain('config.json')
      expect(result).toContain(TEST_DIR)
      process.chdir(origCwd)
    })
  })

  describe('Real-World Monorepo Scenarios', () => {
    it('should validate typical monorepo base config reference', () => {
      // Structure: packages/core/.release-it.json extends ../../.release-it-base.json
      const baseConfig = join(TEST_DIR, '.release-it-base.json')
      writeFileSync(baseConfig, '{}')

      const packageDir = join(TEST_DIR, 'packages', 'core')
      mkdirSync(packageDir, { recursive: true })

      const origCwd = process.cwd()
      process.chdir(packageDir)
      expect(() => validateConfigPath('../../.release-it-base.json')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should validate nested monorepo package', () => {
      // Structure: packages/frontend/web/.release-it.json extends ../../../.release-it-base.json
      const baseConfig = join(TEST_DIR, '.release-it-base.json')
      writeFileSync(baseConfig, '{}')

      const nestedDir = join(TEST_DIR, 'packages', 'frontend', 'web')
      mkdirSync(nestedDir, { recursive: true })

      const origCwd = process.cwd()
      process.chdir(nestedDir)
      expect(() => validateConfigPath('../../../.release-it-base.json')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should validate deeply nested package at 5-level limit', () => {
      // Structure: a/b/c/d/e/.release-it.json extends ../../../../../.release-it-base.json
      const baseConfig = join(TEST_DIR, '.release-it-base.json')
      writeFileSync(baseConfig, '{}')

      const deepDir = join(TEST_DIR, 'a', 'b', 'c', 'd', 'e')
      mkdirSync(deepDir, { recursive: true })

      const origCwd = process.cwd()
      process.chdir(deepDir)
      expect(() => validateConfigPath('../../../../../.release-it-base.json')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should validate alternate config file formats in monorepo', () => {
      const formats = [
        '.release-it-base.js',
        '.release-it-base.cjs',
        '.release-it-base.yaml',
        '.release-it-base.toml',
      ]
      const origCwd = process.cwd()

      for (const format of formats) {
        const file = join(TEST_DIR, format)
        writeFileSync(file, '')

        const packageDir = join(TEST_DIR, 'packages', 'test')
        mkdirSync(packageDir, { recursive: true })

        process.chdir(packageDir)
        expect(() => validateConfigPath(`../../${format}`)).not.toThrow()
        process.chdir(origCwd)

        rmSync(packageDir, { recursive: true, force: true })
      }
    })
  })

  describe('Security - Defense in Depth', () => {
    it('should apply multiple validation layers', () => {
      const origCwd = process.cwd()
      process.chdir(TEST_DIR)

      // Layer 1: Extension whitelist
      const file1 = join(TEST_DIR, 'bad.exe')
      writeFileSync(file1, '')
      expect(() => validateConfigPath('bad.exe')).toThrow('Invalid config file extension')

      // Layer 2: Depth limit
      expect(() => validateConfigPath('../../../../../../file.json')).toThrow('Too many parent')

      // Layer 3: Absolute path
      expect(() => validateConfigPath('/etc/passwd.json')).toThrow('Absolute paths')

      // Layer 4: File existence (if it passes previous layers)
      expect(() => validateConfigPath('nonexistent.json')).toThrow('not found')

      // Layer 5: File type (directory check)
      const dir = join(TEST_DIR, 'dir.json')
      mkdirSync(dir, { recursive: true })
      expect(() => validateConfigPath('dir.json')).toThrow('not a directory')

      process.chdir(origCwd)
    })

    it('should prevent path traversal to system files', () => {
      const systemFiles = [
        '/etc/passwd.json',
        '/etc/shadow.json',
        '/root/.ssh/id_rsa.json',
        '/Windows/System32/config/SAM.json',
      ]

      for (const path of systemFiles) {
        expect(() => validateConfigPath(path)).toThrow()
      }
    })

    it('should prevent excessive traversal even to valid directories', () => {
      const file = join(TEST_DIR, '.release-it-base.json')
      writeFileSync(file, '{}')

      const deepDir = join(TEST_DIR, 'a', 'b', 'c', 'd', 'e', 'f', 'g')
      mkdirSync(deepDir, { recursive: true })

      const origCwd = process.cwd()
      process.chdir(deepDir)
      // 7 levels up - should be rejected even if file exists
      expect(() => validateConfigPath('../../../../../../.release-it-base.json')).toThrow(
        'Too many',
      )
      process.chdir(origCwd)
    })
  })

  describe('Documentation Examples', () => {
    it('should match README.md monorepo example', () => {
      // README.md example: packages/core/.release-it.json extends ../../.release-it-base.json
      const baseConfig = join(TEST_DIR, '.release-it-base.json')
      writeFileSync(
        baseConfig,
        JSON.stringify({
          git: { requireBranch: 'main' },
        }),
      )

      const coreDir = join(TEST_DIR, 'packages', 'core')
      mkdirSync(coreDir, { recursive: true })

      const origCwd = process.cwd()
      process.chdir(coreDir)
      const result = validateConfigPath('../../.release-it-base.json')
      expect(result).toContain('.release-it-base.json')
      process.chdir(origCwd)
    })

    it('should match monorepo-workflow.md security examples', () => {
      // Allowed examples from docs
      const baseConfig = join(TEST_DIR, '.release-it-base.json')
      writeFileSync(baseConfig, '{}')

      const origCwd = process.cwd()

      // 2 levels up - OK
      const dir2 = join(TEST_DIR, 'a', 'b')
      mkdirSync(dir2, { recursive: true })
      process.chdir(dir2)
      expect(() => validateConfigPath('../../.release-it-base.json')).not.toThrow()
      process.chdir(origCwd)

      // 5 levels up - OK
      const dir5 = join(TEST_DIR, 'a', 'b', 'c', 'd', 'e')
      mkdirSync(dir5, { recursive: true })
      process.chdir(dir5)
      expect(() => validateConfigPath('../../../../../.release-it-base.json')).not.toThrow()
      process.chdir(origCwd)
    })

    it('should block examples marked as ❌ in docs', () => {
      // 6 levels up - BLOCKED
      expect(() => validateConfigPath('../../../../../../etc/passwd.json')).toThrow(
        'Too many parent',
      )

      // Absolute path - BLOCKED
      expect(() => validateConfigPath('/etc/passwd.json')).toThrow('Absolute paths')
    })
  })
})
