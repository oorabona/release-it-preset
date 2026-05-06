import { join, resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  parsePnpmWorkspaceYaml,
  parseWorkspacesFromPackageJson,
  resolvePackagePaths,
} from '../../scripts/lib/workspace-detect'

describe('parsePnpmWorkspaceYaml', () => {
  it('parses a simple block-list', () => {
    const yaml = `packages:\n  - 'packages/*'\n  - 'apps/*'\n`
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(['packages/*', 'apps/*'])
  })

  it('returns empty array when no packages: key', () => {
    expect(parsePnpmWorkspaceYaml('# no packages here\n')).toEqual([])
  })

  it('throws ValidationError for flow-style array', () => {
    const yaml = `packages: ['packages/*', 'apps/*']\n`
    expect(() => parsePnpmWorkspaceYaml(yaml)).toThrow('flow-style')
  })

  it('stops at next top-level key', () => {
    const yaml = `packages:\n  - 'packages/*'\ncatalog:\n  react: ^18\n`
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(['packages/*'])
  })

  it('handles quoted and unquoted patterns', () => {
    const yaml = `packages:\n  - packages/*\n  - "apps/*"\n  - 'tools/*'\n`
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(['packages/*', 'apps/*', 'tools/*'])
  })

  it('strips inline comments', () => {
    const yaml = `packages:\n  - 'packages/*' # main packages\n`
    expect(parsePnpmWorkspaceYaml(yaml)).toEqual(['packages/*'])
  })
})

describe('parseWorkspacesFromPackageJson', () => {
  it('parses array form', () => {
    const content = JSON.stringify({ name: 'root', workspaces: ['packages/*', 'apps/*'] })
    expect(parseWorkspacesFromPackageJson(content)).toEqual(['packages/*', 'apps/*'])
  })

  it('parses object form {packages: [...]}', () => {
    const content = JSON.stringify({ name: 'root', workspaces: { packages: ['packages/*'] } })
    expect(parseWorkspacesFromPackageJson(content)).toEqual(['packages/*'])
  })

  it('returns empty array if no workspaces field', () => {
    const content = JSON.stringify({ name: 'root', version: '1.0.0' })
    expect(parseWorkspacesFromPackageJson(content)).toEqual([])
  })

  it('returns empty array for invalid JSON', () => {
    expect(parseWorkspacesFromPackageJson('not json')).toEqual([])
  })

  it('returns empty array for unknown workspaces shape', () => {
    const content = JSON.stringify({ workspaces: 'packages/*' })
    expect(parseWorkspacesFromPackageJson(content)).toEqual([])
  })
})

describe('resolvePackagePaths', () => {
  const projectRoot = '/tmp/test-root'

  it('expands single-level glob and returns dirs with package.json', () => {
    const deps = {
      existsSync: vi.fn((p: string) => {
        if (p === join(projectRoot, 'packages')) return true
        if (p === join(projectRoot, 'packages', 'a', 'package.json')) return true
        if (p === join(projectRoot, 'packages', 'b', 'package.json')) return true
        return false
      }),
      readFileSync: vi.fn(),
      readdirSync: vi.fn((_p: string) => ['a', 'b'] as unknown as string[]),
    }

    const result = resolvePackagePaths(['packages/*'], projectRoot, deps)
    expect(result).toEqual([
      join(projectRoot, 'packages', 'a'),
      join(projectRoot, 'packages', 'b'),
    ])
  })

  it('skips dirs without package.json', () => {
    const deps = {
      existsSync: vi.fn((p: string) => {
        if (p === join(projectRoot, 'packages')) return true
        if (p === join(projectRoot, 'packages', 'a', 'package.json')) return true
        // 'b' has no package.json
        return false
      }),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(() => ['a', 'b'] as unknown as string[]),
    }

    const result = resolvePackagePaths(['packages/*'], projectRoot, deps)
    expect(result).toEqual([join(projectRoot, 'packages', 'a')])
  })

  it('throws ValidationError for path-traversal pattern', () => {
    const deps = {
      existsSync: vi.fn(() => true),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(() => [] as unknown as string[]),
    }

    expect(() => resolvePackagePaths(['../etc'], projectRoot, deps)).toThrow('outside the project root')
  })

  it('returns empty when parent dir does not exist', () => {
    const deps = {
      existsSync: vi.fn(() => false),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(() => [] as unknown as string[]),
    }

    const result = resolvePackagePaths(['packages/*'], projectRoot, deps)
    expect(result).toEqual([])
  })

  it('resolves literal (non-glob) path with package.json', () => {
    const pkgDir = join(projectRoot, 'my-app')
    const deps = {
      existsSync: vi.fn((p: string) => p === join(pkgDir, 'package.json')),
      readFileSync: vi.fn(),
      readdirSync: vi.fn(() => [] as unknown as string[]),
    }

    const result = resolvePackagePaths(['my-app'], projectRoot, deps)
    expect(result).toEqual([pkgDir])
  })
})
