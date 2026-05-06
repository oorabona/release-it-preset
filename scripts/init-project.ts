#!/usr/bin/env tsx
/**
 * Initialize a project with release-it-preset
 *
 * This script:
 * - Creates CHANGELOG.md with Keep a Changelog template
 * - Creates .release-it.json with extends configuration
 * - Optionally adds scripts to package.json
 *
 * Usage:
 *   tsx init-project.ts [--yes]
 *
 * Options:
 *   --yes    Skip prompts and use defaults
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScript } from './lib/run-script.js';
import {
  parsePnpmWorkspaceYaml,
  parseWorkspacesFromPackageJson,
  resolvePackagePaths,
} from './lib/workspace-detect.js';
import { ValidationError } from './lib/errors.js';

const CHANGELOG_TEMPLATE = `# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release
`;

const RELEASE_IT_CONFIG = `{
  "extends": "@oorabona/release-it-preset/config/default"
}
`;

const SUGGESTED_SCRIPTS = {
  'release': 'release-it-preset default',
  'release:hotfix': 'release-it-preset hotfix',
  'release:dry': 'release-it-preset default --dry-run',
  'changelog:update': 'release-it-preset update',
};

interface Options {
  yes: boolean;
  withWorkflows: boolean;
  workflowName: string;
}

export interface InitProjectDeps {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  mkdirSync: typeof mkdirSync;
  readdirSync: typeof readdirSync;
  prompt: (question: string) => Promise<boolean>;
  log: (message: string) => void;
  warn: (message: string) => void;
}

export function parseArgs(args?: string[]): Options {
  /* c8 ignore next */
  const argv = args || process.argv.slice(2);

  // Extract --workflow-name=<value>
  const workflowNameArg = argv.find(a => a.startsWith('--workflow-name='));
  const workflowName = workflowNameArg ? workflowNameArg.slice('--workflow-name='.length) : 'release.yml';

  return {
    yes: argv.includes('--yes') || argv.includes('-y'),
    withWorkflows: argv.includes('--with-workflows'),
    workflowName,
  };
}

export async function createChangelog(options: Options, deps: InitProjectDeps): Promise<boolean> {
  const path = 'CHANGELOG.md';

  if (deps.existsSync(path)) {
    deps.warn(`⚠️  ${path} already exists`);
    if (!options.yes) {
      const overwrite = await deps.prompt('Overwrite it?');
      if (!overwrite) {
        deps.log(`ℹ️  Skipping ${path}`);
        return false;
      }
    } else {
      deps.log(`ℹ️  Skipping ${path} (--yes mode, not overwriting existing files)`);
      return false;
    }
  }

  deps.writeFileSync(path, CHANGELOG_TEMPLATE);
  deps.log(`✅ Created ${path}`);
  return true;
}

export async function createReleaseItConfig(options: Options, deps: InitProjectDeps): Promise<boolean> {
  const path = '.release-it.json';

  if (deps.existsSync(path)) {
    deps.warn(`⚠️  ${path} already exists`);
    if (!options.yes) {
      const overwrite = await deps.prompt('Overwrite it?');
      if (!overwrite) {
        deps.log(`ℹ️  Skipping ${path}`);
        return false;
      }
    } else {
      deps.log(`ℹ️  Skipping ${path} (--yes mode, not overwriting existing files)`);
      return false;
    }
  }

  deps.writeFileSync(path, RELEASE_IT_CONFIG);
  deps.log(`✅ Created ${path}`);
  return true;
}

export async function updatePackageJson(options: Options, deps: InitProjectDeps): Promise<boolean> {
  const path = 'package.json';

  if (!deps.existsSync(path)) {
    deps.warn(`⚠️  ${path} not found, skipping script addition`);
    return false;
  }

  try {
    const packageJson = JSON.parse(deps.readFileSync(path, 'utf8') as string);

    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    const scriptsToAdd: Record<string, string> = {};
    let hasConflicts = false;

    for (const [name, command] of Object.entries(SUGGESTED_SCRIPTS)) {
      if (packageJson.scripts[name]) {
        deps.warn(`⚠️  Script "${name}" already exists in package.json`);
        hasConflicts = true;
      } else {
        scriptsToAdd[name] = command;
      }
    }

    if (Object.keys(scriptsToAdd).length === 0) {
      deps.log(`ℹ️  All suggested scripts already exist in package.json`);
      return false;
    }

    if (!options.yes) {
      deps.log(`\n📝 Suggested scripts to add to package.json:`);
      for (const [name, command] of Object.entries(scriptsToAdd)) {
        deps.log(`   "${name}": "${command}"`);
      }

      const addScripts = await deps.prompt('\nAdd these scripts to package.json?');
      if (!addScripts) {
        deps.log(`ℹ️  Skipping package.json scripts`);
        return false;
      }
    }

    Object.assign(packageJson.scripts, scriptsToAdd);

    deps.writeFileSync(path, JSON.stringify(packageJson, null, 2) + '\n');
    deps.log(`✅ Updated ${path} with ${Object.keys(scriptsToAdd).length} script(s)`);
    return true;
  } catch (error) {
    deps.warn(`❌ Failed to update ${path}: ${error}`);
    return false;
  }
}


/**
 * Write the GitHub Actions workflow file to .github/workflows/<name>.
 * Skips silently if the file already exists (existing skip-on-conflict policy).
 */
export async function writeWorkflow(options: Options, deps: InitProjectDeps): Promise<boolean> {
  const workflowDir = join('.github', 'workflows');
  const workflowPath = join(workflowDir, options.workflowName);

  if (deps.existsSync(workflowPath)) {
    deps.log(`ℹ️  ${workflowPath} already exists — skipping.`);
    deps.log(`   To integrate manually, review the template and merge into your existing workflow.`);
    return false;
  }

  // Resolve template path relative to this compiled script
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const templatePath = join(__dirname, 'templates', 'workflows', 'release.yml.template');

  let templateContent: string;
  try {
    templateContent = deps.readFileSync(templatePath, 'utf8') as string;
  } catch (error) {
    deps.warn(`❌ Failed to read workflow template: ${error}`);
    return false;
  }

  // Ensure .github/workflows/ exists
  if (!deps.existsSync(workflowDir)) {
    deps.mkdirSync(workflowDir, { recursive: true } as Parameters<typeof mkdirSync>[1]);
  }

  deps.writeFileSync(workflowPath, templateContent);
  deps.log(`✅ Created ${workflowPath}`);
  return true;
}

/**
 * Detect workspaces from pnpm-workspace.yaml or package.json#workspaces.
 * Returns resolved absolute package directory paths.
 * Returns empty array if no workspace config found.
 * Throws ValidationError if workspace patterns escape the project root.
 */
export function detectWorkspaces(projectRoot: string, deps: InitProjectDeps): string[] {
  const pnpmWorkspaceFile = join(projectRoot, 'pnpm-workspace.yaml');
  const packageJsonFile = join(projectRoot, 'package.json');

  let patterns: string[] = [];

  if (deps.existsSync(pnpmWorkspaceFile)) {
    const content = deps.readFileSync(pnpmWorkspaceFile, 'utf8') as string;
    patterns = parsePnpmWorkspaceYaml(content);
  } else if (deps.existsSync(packageJsonFile)) {
    const content = deps.readFileSync(packageJsonFile, 'utf8') as string;
    patterns = parseWorkspacesFromPackageJson(content);
  }

  if (patterns.length === 0) {
    return [];
  }

  return resolvePackagePaths(patterns, projectRoot, deps);
}

/**
 * Scaffold per-package .release-it.json for each detected workspace package.
 * Skips packages that already have .release-it.json (skip-on-conflict policy).
 * Does NOT write a root .release-it.json (would conflict with per-package configs).
 */
export async function scaffoldWorkspacePackages(
  packageDirs: string[],
  options: Options,
  deps: InitProjectDeps
): Promise<number> {
  let created = 0;

  for (const pkgDir of packageDirs) {
    const configPath = join(pkgDir, '.release-it.json');
    if (deps.existsSync(configPath)) {
      deps.log(`ℹ️  ${configPath} already exists — skipping`);
      continue;
    }
    deps.writeFileSync(configPath, RELEASE_IT_CONFIG);
    deps.log(`✅ Created ${configPath}`);
    created++;
  }

  return created;
}


export async function initProject(options: Options, deps: InitProjectDeps): Promise<{
  changelog: boolean;
  releaseIt: boolean;
  packageJson: boolean;
  workflow: boolean;
  monorepoPackages: number;
}> {
  deps.log('🚀 Initializing project with release-it-preset\n');

  if (options.yes) {
    deps.log('ℹ️  Running in --yes mode (non-interactive)\n');
  }

  // Detect monorepo workspaces before deciding what to scaffold
  const projectRoot = process.cwd();
  const workspaceDirs = detectWorkspaces(projectRoot, deps);
  const isMonorepo = workspaceDirs.length > 0;

  const results = {
    changelog: await createChangelog(options, deps),
    // In monorepo mode: per-package configs, NO root .release-it.json
    releaseIt: isMonorepo ? false : await createReleaseItConfig(options, deps),
    packageJson: isMonorepo ? false : await updatePackageJson(options, deps),
    workflow: options.withWorkflows ? await writeWorkflow(options, deps) : false,
    monorepoPackages: isMonorepo ? await scaffoldWorkspacePackages(workspaceDirs, options, deps) : 0,
  };

  deps.log('\n📊 Summary:');
  deps.log(`   CHANGELOG.md: ${results.changelog ? '✅ Created' : '⏭️  Skipped'}`);
  if (isMonorepo) {
    deps.log(`   workspace packages: ${results.monorepoPackages} .release-it.json created`);
  } else {
    deps.log(`   .release-it.json: ${results.releaseIt ? '✅ Created' : '⏭️  Skipped'}`);
    deps.log(`   package.json: ${results.packageJson ? '✅ Updated' : '⏭️  Skipped'}`);
  }
  if (options.withWorkflows) {
    deps.log(`   workflow: ${results.workflow ? '✅ Created' : '⏭️  Skipped'}`);
  }

  const anyCreated =
    results.changelog ||
    results.releaseIt ||
    results.packageJson ||
    results.workflow ||
    results.monorepoPackages > 0;

  if (anyCreated) {
    deps.log('\n🎉 Initialization complete!');
    deps.log('\nNext steps:');
    deps.log('   1. Review the generated files');
    deps.log('   2. Update CHANGELOG.md [Unreleased] section');
    if (isMonorepo) {
      deps.log('   3. Release a package: pnpm -F <package-name> exec release-it-preset default --dry-run');
      deps.log('      (use `pnpm -F <package-name> exec release-it-preset default` to release)');
    } else {
      deps.log('   3. Run: pnpm release-it-preset default --dry-run');
    }
  } else {
    deps.log('\n✨ All files already exist, nothing to do!');
  }

  return results;
}

/**
 * CLI entry point - only runs when script is executed directly
 */
/* c8 ignore start */
if (import.meta.url === `file://${process.argv[1]}`) {
  void runScript({ error: console.error, exit: process.exit }, async () => {
    async function realPrompt(question: string): Promise<boolean> {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      return new Promise((resolve) => {
        rl.question(`${question} (y/N): `, (answer) => {
          rl.close();
          resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
      });
    }

    const options = parseArgs();

    // Validate workflow name whenever explicitly provided (even without --with-workflows)
    const argv = process.argv.slice(2);
    const workflowNameExplicit = argv.some(a => a.startsWith('--workflow-name='));
    if (workflowNameExplicit || options.withWorkflows) {
      const WORKFLOW_NAME_RE = /^[A-Za-z0-9._-]+\.ya?ml$/;
      if (!WORKFLOW_NAME_RE.test(options.workflowName)) {
        throw new ValidationError(
          `Invalid workflow name: "${options.workflowName}"\n` +
          `Workflow name must match ^[A-Za-z0-9._-]+\\.ya?ml$\n` +
          `Examples: release.yml, publish.yml\n` +
          `Path components and traversal (../etc.yml) are not allowed.`
        );
      }
    }

    await initProject(options, {
      existsSync,
      readFileSync,
      writeFileSync,
      mkdirSync,
      readdirSync,
      prompt: realPrompt,
      log: console.log,
      warn: console.warn,
    });
  });
}
/* c8 ignore end */
