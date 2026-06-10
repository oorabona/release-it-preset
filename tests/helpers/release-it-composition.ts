import { spawnSync } from 'node:child_process'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TempRepo } from './temp-repo.js'

const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url))
const WORKSPACES_PLUGIN = '@release-it-plugins/workspaces'

const RELEASE_IT_PACKAGES = {
  19: {
    packageRoot: join(PROJECT_ROOT, 'node_modules/release-it19'),
    binPath: join(PROJECT_ROOT, 'node_modules/release-it19/bin/release-it.js'),
  },
  20: {
    packageRoot: join(PROJECT_ROOT, 'node_modules/release-it'),
    binPath: join(PROJECT_ROOT, 'node_modules/release-it/bin/release-it.js'),
  },
} as const

export type ReleaseItMajor = keyof typeof RELEASE_IT_PACKAGES

export interface ReleaseItResult {
  stdout: string
  stderr: string
  exitCode: number
}

export interface PackageJson {
  version: string
  dependencies?: Record<string, string>
}

interface PackageManifest {
  dependencies?: Record<string, string>
}

function symlinkDir(target: string, linkPath: string): void {
  if (existsSync(linkPath)) {
    return
  }
  mkdirSync(dirname(linkPath), { recursive: true })
  symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
}

function copyPackageFile(sourceRoot: string, targetRoot: string, fileName: string): void {
  const source = join(sourceRoot, fileName)
  if (!existsSync(source)) {
    return
  }
  const target = join(targetRoot, fileName)
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(source, target)
}

function linkNodeModule(sourceRoot: string, targetRoot: string, packageName: string): void {
  const source = join(sourceRoot, packageName)
  if (!existsSync(source)) {
    throw new Error(`Missing test fixture dependency: ${source}`)
  }
  symlinkDir(source, join(targetRoot, packageName))
}

function linkWorkspacesPlugin(repo: TempRepo, releaseItPackageRoot: string): void {
  const sourceRoot = realpathSync(join(PROJECT_ROOT, 'node_modules', WORKSPACES_PLUGIN))
  const sourceDependenciesRoot = resolve(sourceRoot, '../..')
  const targetRoot = join(repo.cwd, 'node_modules', WORKSPACES_PLUGIN)

  mkdirSync(targetRoot, { recursive: true })
  copyPackageFile(sourceRoot, targetRoot, 'package.json')
  copyPackageFile(sourceRoot, targetRoot, 'index.js')

  const manifest = JSON.parse(
    readFileSync(join(sourceRoot, 'package.json'), 'utf8'),
  ) as PackageManifest
  const targetNodeModules = join(targetRoot, 'node_modules')

  for (const packageName of Object.keys(manifest.dependencies ?? {})) {
    linkNodeModule(sourceDependenciesRoot, targetNodeModules, packageName)
  }

  symlinkDir(releaseItPackageRoot, join(targetNodeModules, 'release-it'))
}

export function linkReleaseItCompositionModules(
  repo: TempRepo,
  releaseItMajor: ReleaseItMajor,
): void {
  const releaseItPackage = RELEASE_IT_PACKAGES[releaseItMajor]

  ignoreNodeModules(repo)
  symlinkDir(PROJECT_ROOT, join(repo.cwd, 'node_modules/@oorabona/release-it-preset'))
  symlinkDir(releaseItPackage.packageRoot, join(repo.cwd, 'node_modules/release-it'))
  linkWorkspacesPlugin(repo, releaseItPackage.packageRoot)
}

// The temp-repo commit helper stages with `git add -A`; without this the
// fixture would commit the node_modules symlinks, including one pointing
// back at the project root (unfaithful fixture, junction hazards on Windows).
function ignoreNodeModules(repo: TempRepo): void {
  const gitignorePath = join(repo.cwd, '.gitignore')
  if (existsSync(gitignorePath) && readFileSync(gitignorePath, 'utf8').includes('node_modules/')) {
    return
  }
  appendFileSync(gitignorePath, 'node_modules/\n')
}

export function runReleaseIt(
  repo: TempRepo,
  releaseItMajor: ReleaseItMajor,
  args = ['patch', '--ci'],
): ReleaseItResult {
  const result = spawnSync(
    process.execPath,
    [RELEASE_IT_PACKAGES[releaseItMajor].binPath, ...args],
    {
      cwd: repo.cwd,
      env: {
        ...process.env,
        CI: 'true',
        FORCE_COLOR: '0',
        GITHUB_REPOSITORY: '',
        GITHUB_RELEASE: 'false',
        NPM_PUBLISH: 'false',
        NPM_SKIP_CHECKS: 'true',
      },
      encoding: 'utf8',
      timeout: 30_000,
    },
  )

  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.status ?? 1,
  }
}

export function readPackage(repo: TempRepo, path: string): PackageJson {
  return JSON.parse(readFileSync(join(repo.cwd, path), 'utf8')) as PackageJson
}

export function releaseItOutput(result: ReleaseItResult): string {
  return `${result.stdout}\n${result.stderr}`
}

export function isWorkspacesReleaseIt20PeerMismatch(result: ReleaseItResult): boolean {
  const combined = releaseItOutput(result)
  return (
    combined.includes('@release-it-plugins/workspaces has the following unmet peerDependencies') &&
    combined.includes('release-it') &&
    combined.includes('20.')
  )
}
