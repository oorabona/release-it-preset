import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BUILTIN_TYPE_MAP,
  type ChangelogTypeDeps,
  loadChangelogTypeMap,
} from '../../scripts/lib/changelog-types'

describe('changelog-types', () => {
  let deps: ChangelogTypeDeps

  beforeEach(() => {
    deps = {
      readFileSync: vi.fn(),
      getEnv: vi.fn((_key: string) => undefined),
      warn: vi.fn(),
    }
  })

  describe('BUILTIN_TYPE_MAP', () => {
    it('should map feat/feature/add to Added', () => {
      expect(BUILTIN_TYPE_MAP['feat']).toBe('### Added')
      expect(BUILTIN_TYPE_MAP['feature']).toBe('### Added')
      expect(BUILTIN_TYPE_MAP['add']).toBe('### Added')
    })

    it('should suppress ci/release/hotfix (false)', () => {
      expect(BUILTIN_TYPE_MAP['ci']).toBe(false)
      expect(BUILTIN_TYPE_MAP['release']).toBe(false)
      expect(BUILTIN_TYPE_MAP['hotfix']).toBe(false)
    })
  })

  describe('loadChangelogTypeMap', () => {
    it('returns built-in map when no file and no env var', () => {
      vi.mocked(deps.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT: file not found')
      })
      const result = loadChangelogTypeMap(deps)
      expect(result).toEqual(BUILTIN_TYPE_MAP)
      expect(deps.warn).not.toHaveBeenCalled()
    })

    it('file overrides built-in (custom type maps to custom section)', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        JSON.stringify({ deps: '### Dependencies', ops: '### Operations' }),
      )
      const result = loadChangelogTypeMap(deps)
      expect(result['deps']).toBe('### Dependencies')
      expect(result['ops']).toBe('### Operations')
      // built-in entries are preserved
      expect(result['feat']).toBe('### Added')
    })

    it('env var overrides file override (env wins)', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(JSON.stringify({ deps: '### Dependencies' }))
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_TYPE_MAP' ? JSON.stringify({ deps: '### Bumps' }) : undefined,
      )
      const result = loadChangelogTypeMap(deps)
      // env wins over file
      expect(result['deps']).toBe('### Bumps')
    })

    it('env var false value suppresses a type', () => {
      vi.mocked(deps.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_TYPE_MAP' ? JSON.stringify({ deps: false }) : undefined,
      )
      const result = loadChangelogTypeMap(deps)
      expect(result['deps']).toBe(false)
    })

    it('malformed env JSON → WARN + falls back to file/built-in', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(JSON.stringify({ ops: '### Ops' }))
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_TYPE_MAP' ? 'NOT VALID JSON{{{{' : undefined,
      )
      const result = loadChangelogTypeMap(deps)
      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid CHANGELOG_TYPE_MAP env var'),
      )
      // file layer still applied
      expect(result['ops']).toBe('### Ops')
    })

    it('malformed file JSON → WARN + falls back to built-in', () => {
      vi.mocked(deps.readFileSync).mockReturnValue('{ bad json ]]]')
      const result = loadChangelogTypeMap(deps)
      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid .changelog-types.json'),
      )
      expect(result).toEqual(BUILTIN_TYPE_MAP)
    })

    it('file with invalid value type → WARN + falls back to built-in', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        JSON.stringify({ deps: 42 }), // 42 is not string | false
      )
      const result = loadChangelogTypeMap(deps)
      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid .changelog-types.json'),
      )
      expect(result).toEqual(BUILTIN_TYPE_MAP)
    })

    it('env var with invalid value type → WARN + falls back to file/built-in', () => {
      vi.mocked(deps.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_TYPE_MAP' ? JSON.stringify({ deps: 99 }) : undefined,
      )
      const result = loadChangelogTypeMap(deps)
      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid CHANGELOG_TYPE_MAP env var'),
      )
      expect(result).toEqual(BUILTIN_TYPE_MAP)
    })

    it('missing file (ENOENT) is silently ignored — no warn', () => {
      vi.mocked(deps.readFileSync).mockImplementation(() => {
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      })
      loadChangelogTypeMap(deps)
      expect(deps.warn).not.toHaveBeenCalled()
    })

    it('env var array instead of object → WARN + falls back', () => {
      vi.mocked(deps.readFileSync).mockImplementation(() => {
        throw new Error('ENOENT')
      })
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_TYPE_MAP' ? JSON.stringify(['deps', 'ops']) : undefined,
      )
      const result = loadChangelogTypeMap(deps)
      expect(deps.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid CHANGELOG_TYPE_MAP env var'),
      )
      expect(result).toEqual(BUILTIN_TYPE_MAP)
    })

    it('both file and env var valid → result is built-in merged with file merged with env', () => {
      vi.mocked(deps.readFileSync).mockReturnValue(
        JSON.stringify({ custom1: '### Custom1', feat: '### NewAdded' }),
      )
      vi.mocked(deps.getEnv).mockImplementation(key =>
        key === 'CHANGELOG_TYPE_MAP'
          ? JSON.stringify({ custom2: '### Custom2', feat: '### EnvAdded' })
          : undefined,
      )
      const result = loadChangelogTypeMap(deps)
      expect(result['custom1']).toBe('### Custom1') // from file
      expect(result['custom2']).toBe('### Custom2') // from env
      expect(result['feat']).toBe('### EnvAdded') // env wins over file
      expect(result['fix']).toBe('### Fixed') // built-in preserved
    })
  })
})
