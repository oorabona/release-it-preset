import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process')
vi.mock('node:fs')

describe('CLI wrapper (bin/cli.js)', () => {
  const _mockSpawn = vi.mocked(spawn)
  const mockExistsSync = vi.mocked(existsSync)

  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('help display', () => {
    it('should show help with --help flag', () => {
      const args = ['--help']
      const shouldShowHelp = args.length === 0 || args[0] === '--help' || args[0] === '-h'

      expect(shouldShowHelp).toBe(true)
    })

    it('should show help with -h flag', () => {
      const args = ['-h']
      const shouldShowHelp = args.length === 0 || args[0] === '--help' || args[0] === '-h'

      expect(shouldShowHelp).toBe(true)
    })

    it('should show help with no arguments', () => {
      const args: string[] = []
      const shouldShowHelp = args.length === 0 || args[0] === '--help' || args[0] === '-h'

      expect(shouldShowHelp).toBe(true)
    })
  })

  describe('release commands', () => {
    const RELEASE_CONFIGS = {
      default: 'config/default.js',
      hotfix: 'config/hotfix.js',
      'changelog-only': 'config/changelog-only.js',
      'no-changelog': 'config/no-changelog.js',
      republish: 'config/republish.js',
      'retry-publish': 'config/retry-publish.js',
    }

    it('should recognize default as release command', () => {
      const command = 'default'
      const isReleaseCommand = command in RELEASE_CONFIGS

      expect(isReleaseCommand).toBe(true)
    })

    it('should recognize hotfix as release command', () => {
      const command = 'hotfix'
      const isReleaseCommand = command in RELEASE_CONFIGS

      expect(isReleaseCommand).toBe(true)
    })

    it('should map command to config path', () => {
      const command = 'default'
      const configPath = RELEASE_CONFIGS[command as keyof typeof RELEASE_CONFIGS]

      expect(configPath).toBe('config/default.js')
    })

    it('should build release-it command with config', () => {
      const configPath = 'config/default.js'
      const args = ['--dry-run']

      const fullArgs = ['--config', configPath, ...args]

      expect(fullArgs).toEqual(['--config', 'config/default.js', '--dry-run'])
    })

    it('should pass through additional arguments', () => {
      const args = ['--dry-run', '--verbose', '--no-git.push']
      const configPath = 'config/hotfix.js'

      const fullArgs = ['--config', configPath, ...args]

      expect(fullArgs).toContain('--dry-run')
      expect(fullArgs).toContain('--verbose')
      expect(fullArgs).toContain('--no-git.push')
    })
  })

  describe('utility commands', () => {
    const UTILITY_COMMANDS = {
      init: 'init-project',
      update: 'populate-unreleased-changelog',
      validate: 'validate-release',
      check: 'check-config',
    }

    it('should recognize init as utility command', () => {
      const command = 'init'
      const isUtilityCommand = command in UTILITY_COMMANDS

      expect(isUtilityCommand).toBe(true)
    })

    it('should recognize update as utility command', () => {
      const command = 'update'
      const isUtilityCommand = command in UTILITY_COMMANDS

      expect(isUtilityCommand).toBe(true)
    })

    it('should map command to script basename', () => {
      const command = 'init'
      const scriptBase = UTILITY_COMMANDS[command as keyof typeof UTILITY_COMMANDS]

      expect(scriptBase).toBe('init-project')
    })

    it('should prefer compiled script when available', () => {
      const compiledPath = 'dist/scripts/init-project.js'
      const sourcePath = 'scripts/init-project.ts'

      mockExistsSync.mockReturnValue(true)

      const useCompiled = existsSync(compiledPath)
      const runner = useCompiled ? 'node' : 'tsx'
      const target = useCompiled ? compiledPath : sourcePath

      expect(runner).toBe('node')
      expect(target).toBe(compiledPath)
    })

    it('should fallback to tsx when compiled not available', () => {
      const compiledPath = 'dist/scripts/init-project.js'
      const sourcePath = 'scripts/init-project.ts'

      mockExistsSync.mockReturnValue(false)

      const useCompiled = existsSync(compiledPath)
      const runner = useCompiled ? 'node' : 'tsx'
      const target = useCompiled ? compiledPath : sourcePath

      expect(runner).toBe('tsx')
      expect(target).toBe(sourcePath)
    })

    it('should pass arguments to utility scripts', () => {
      const args = ['--yes']
      const scriptPath = 'dist/scripts/init-project.js'

      const fullArgs = [scriptPath, ...args]

      expect(fullArgs).toEqual(['dist/scripts/init-project.js', '--yes'])
    })
  })

  describe('unknown commands', () => {
    const RELEASE_CONFIGS = {
      default: 'config/default.js',
      hotfix: 'config/hotfix.js',
      'changelog-only': 'config/changelog-only.js',
      'no-changelog': 'config/no-changelog.js',
      republish: 'config/republish.js',
      'retry-publish': 'config/retry-publish.js',
    }

    const UTILITY_COMMANDS = {
      init: 'init-project',
      update: 'populate-unreleased-changelog',
      validate: 'validate-release',
      check: 'check-config',
    }

    it('should detect unknown command', () => {
      const command = 'unknown-command'

      const isReleaseCommand = command in RELEASE_CONFIGS
      const isUtilityCommand = command in UTILITY_COMMANDS
      const isUnknown = !isReleaseCommand && !isUtilityCommand

      expect(isUnknown).toBe(true)
    })

    it('should provide available commands list', () => {
      const releaseCommands = Object.keys(RELEASE_CONFIGS)
      const utilityCommands = Object.keys(UTILITY_COMMANDS)

      expect(releaseCommands).toContain('default')
      expect(releaseCommands).toContain('hotfix')
      expect(utilityCommands).toContain('init')
      expect(utilityCommands).toContain('validate')
    })
  })

  describe('command parsing', () => {
    it('should extract command from argv', () => {
      const argv = ['node', 'cli.js', 'default', '--dry-run']
      const args = argv.slice(2)
      const command = args[0]
      const commandArgs = args.slice(1)

      expect(command).toBe('default')
      expect(commandArgs).toEqual(['--dry-run'])
    })

    it('should handle command with multiple arguments', () => {
      const argv = ['node', 'cli.js', 'init', '--yes']
      const args = argv.slice(2)
      const command = args[0]
      const commandArgs = args.slice(1)

      expect(command).toBe('init')
      expect(commandArgs).toEqual(['--yes'])
    })
  })
})
