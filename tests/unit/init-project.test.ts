import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createChangelog,
  createReleaseItConfig,
  type InitProjectDeps,
  initProject,
  parseArgs,
  updatePackageJson,
} from '../../scripts/init-project'

describe('init-project (with DI)', () => {
  let deps: InitProjectDeps

  beforeEach(() => {
    deps = {
      existsSync: vi.fn(),
      readFileSync: vi.fn(),
      writeFileSync: vi.fn(),
      prompt: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
    }
  })

  describe('parseArgs', () => {
    it('should parse --yes flag', () => {
      const result = parseArgs(['--yes'])
      expect(result.yes).toBe(true)
    })

    it('should parse -y flag', () => {
      const result = parseArgs(['-y'])
      expect(result.yes).toBe(true)
    })

    it('should default to false', () => {
      const result = parseArgs([])
      expect(result.yes).toBe(false)
    })

    it('should handle other args', () => {
      const result = parseArgs(['--other', '--flags'])
      expect(result.yes).toBe(false)
    })
  })

  describe('createChangelog', () => {
    it('should create changelog when file does not exist', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(false)

      const result = await createChangelog({ yes: false }, deps)

      expect(result).toBe(true)
      expect(deps.writeFileSync).toHaveBeenCalledWith(
        'CHANGELOG.md',
        expect.stringContaining('Keep a Changelog'),
      )
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('Created CHANGELOG.md'))
    })

    it('should skip when file exists in --yes mode', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)

      const result = await createChangelog({ yes: true }, deps)

      expect(result).toBe(false)
      expect(deps.writeFileSync).not.toHaveBeenCalled()
      expect(deps.log).toHaveBeenCalledWith(
        expect.stringContaining('--yes mode, not overwriting existing files'),
      )
    })

    it('should prompt to overwrite when file exists and not --yes mode', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.prompt).mockResolvedValue(true)

      const result = await createChangelog({ yes: false }, deps)

      expect(result).toBe(true)
      expect(deps.prompt).toHaveBeenCalledWith('Overwrite it?')
      expect(deps.writeFileSync).toHaveBeenCalled()
    })

    it('should skip when user declines overwrite', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.prompt).mockResolvedValue(false)

      const result = await createChangelog({ yes: false }, deps)

      expect(result).toBe(false)
      expect(deps.writeFileSync).not.toHaveBeenCalled()
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('Skipping CHANGELOG.md'))
    })
  })

  describe('createReleaseItConfig', () => {
    it('should create config when file does not exist', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(false)

      const result = await createReleaseItConfig({ yes: false }, deps)

      expect(result).toBe(true)
      expect(deps.writeFileSync).toHaveBeenCalledWith(
        '.release-it.json',
        expect.stringContaining('@oorabona/release-it-preset'),
      )
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('Created .release-it.json'))
    })

    it('should skip when file exists in --yes mode', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)

      const result = await createReleaseItConfig({ yes: true }, deps)

      expect(result).toBe(false)
      expect(deps.writeFileSync).not.toHaveBeenCalled()
    })

    it('should prompt to overwrite when file exists', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.prompt).mockResolvedValue(true)

      const result = await createReleaseItConfig({ yes: false }, deps)

      expect(result).toBe(true)
      expect(deps.prompt).toHaveBeenCalledWith('Overwrite it?')
      expect(deps.writeFileSync).toHaveBeenCalled()
    })

    it('should skip when user declines overwrite', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.prompt).mockResolvedValue(false)

      const result = await createReleaseItConfig({ yes: false }, deps)

      expect(result).toBe(false)
      expect(deps.writeFileSync).not.toHaveBeenCalled()
    })
  })

  describe('updatePackageJson', () => {
    const packageJsonContent = JSON.stringify({
      name: 'test-package',
      scripts: {},
    })

    it('should skip when package.json does not exist', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(false)

      const result = await updatePackageJson({ yes: false }, deps)

      expect(result).toBe(false)
      expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('not found'))
    })

    it('should add scripts when none exist', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(packageJsonContent)
      vi.mocked(deps.prompt).mockResolvedValue(true)

      const result = await updatePackageJson({ yes: false }, deps)

      expect(result).toBe(true)
      expect(deps.prompt).toHaveBeenCalledWith(expect.stringContaining('Add these scripts'))
      expect(deps.writeFileSync).toHaveBeenCalled()
      const writtenContent = JSON.parse(vi.mocked(deps.writeFileSync).mock.calls[0][1] as string)
      expect(writtenContent.scripts).toHaveProperty('release')
      expect(writtenContent.scripts).toHaveProperty('release:hotfix')
    })

    it('should skip adding scripts in --yes mode when none needed', async () => {
      const existingPackageJson = JSON.stringify({
        name: 'test-package',
        scripts: {
          release: 'existing-command',
          'release:hotfix': 'existing-command',
          'release:dry': 'existing-command',
          'changelog:update': 'existing-command',
        },
      })
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(existingPackageJson)

      const result = await updatePackageJson({ yes: true }, deps)

      expect(result).toBe(false)
      expect(deps.log).toHaveBeenCalledWith(
        expect.stringContaining('All suggested scripts already exist'),
      )
    })

    it('should warn about conflicts but add non-conflicting scripts', async () => {
      const partialPackageJson = JSON.stringify({
        name: 'test-package',
        scripts: {
          release: 'existing-command',
        },
      })
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(partialPackageJson)
      vi.mocked(deps.prompt).mockResolvedValue(true)

      const result = await updatePackageJson({ yes: false }, deps)

      expect(result).toBe(true)
      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Script "release" already exists'),
      )
      const writtenContent = JSON.parse(vi.mocked(deps.writeFileSync).mock.calls[0][1] as string)
      expect(writtenContent.scripts.release).toBe('existing-command') // Not overwritten
      expect(writtenContent.scripts['release:hotfix']).toBe('release-it-preset hotfix') // Added
    })

    it('should skip when user declines to add scripts', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(packageJsonContent)
      vi.mocked(deps.prompt).mockResolvedValue(false)

      const result = await updatePackageJson({ yes: false }, deps)

      expect(result).toBe(false)
      expect(deps.writeFileSync).not.toHaveBeenCalled()
    })

    it('should handle JSON parse error gracefully', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue('invalid json')

      const result = await updatePackageJson({ yes: false }, deps)

      expect(result).toBe(false)
      expect(deps.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to update'))
    })

    it('should create scripts object if missing', async () => {
      const packageJsonWithoutScripts = JSON.stringify({
        name: 'test-package',
      })
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(packageJsonWithoutScripts)
      vi.mocked(deps.prompt).mockResolvedValue(true)

      const result = await updatePackageJson({ yes: false }, deps)

      expect(result).toBe(true)
      const writtenContent = JSON.parse(vi.mocked(deps.writeFileSync).mock.calls[0][1] as string)
      expect(writtenContent.scripts).toBeDefined()
    })
  })

  describe('initProject', () => {
    it('should initialize all components successfully', async () => {
      vi.mocked(deps.existsSync).mockImplementation((path: string) => {
        // package.json exists, others don't
        return path === 'package.json'
      })
      vi.mocked(deps.readFileSync).mockReturnValue(JSON.stringify({ name: 'test', scripts: {} }))
      vi.mocked(deps.prompt).mockResolvedValue(true)

      const results = await initProject({ yes: false }, deps)

      expect(results.changelog).toBe(true)
      expect(results.releaseIt).toBe(true)
      expect(results.packageJson).toBe(true)
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('🚀 Initializing'))
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('📊 Summary'))
      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('🎉 Initialization complete'))
    })

    it('should show --yes mode message', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)

      await initProject({ yes: true }, deps)

      expect(deps.log).toHaveBeenCalledWith(expect.stringContaining('Running in --yes mode'))
    })

    it('should handle all files already existing', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(true)
      vi.mocked(deps.readFileSync).mockReturnValue(
        JSON.stringify({
          name: 'test',
          scripts: {
            release: 'existing',
            'release:hotfix': 'existing',
            'release:dry': 'existing',
            'changelog:update': 'existing',
          },
        }),
      )

      const results = await initProject({ yes: true }, deps)

      expect(results.changelog).toBe(false)
      expect(results.releaseIt).toBe(false)
      expect(results.packageJson).toBe(false)
      expect(deps.log).toHaveBeenCalledWith(
        expect.stringContaining('All files already exist, nothing to do'),
      )
    })

    it('should return results object with all boolean fields', async () => {
      vi.mocked(deps.existsSync).mockReturnValue(false)
      vi.mocked(deps.readFileSync).mockReturnValue(JSON.stringify({ name: 'test' }))

      const results = await initProject({ yes: true }, deps)

      expect(results).toHaveProperty('changelog')
      expect(results).toHaveProperty('releaseIt')
      expect(results).toHaveProperty('packageJson')
      expect(typeof results.changelog).toBe('boolean')
      expect(typeof results.releaseIt).toBe('boolean')
      expect(typeof results.packageJson).toBe('boolean')
    })
  })
})
