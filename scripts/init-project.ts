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

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

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
}

export interface InitProjectDeps {
  existsSync: typeof existsSync;
  readFileSync: typeof readFileSync;
  writeFileSync: typeof writeFileSync;
  prompt: (question: string) => Promise<boolean>;
  log: (message: string) => void;
  warn: (message: string) => void;
}

export function parseArgs(args?: string[]): Options {
  /* c8 ignore next */
  const argv = args || process.argv.slice(2);
  return {
    yes: argv.includes('--yes') || argv.includes('-y'),
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

export async function initProject(options: Options, deps: InitProjectDeps): Promise<{
  changelog: boolean;
  releaseIt: boolean;
  packageJson: boolean;
}> {
  deps.log('🚀 Initializing project with release-it-preset\n');

  if (options.yes) {
    deps.log('ℹ️  Running in --yes mode (non-interactive)\n');
  }

  const results = {
    changelog: await createChangelog(options, deps),
    releaseIt: await createReleaseItConfig(options, deps),
    packageJson: await updatePackageJson(options, deps),
  };

  deps.log('\n📊 Summary:');
  deps.log(`   CHANGELOG.md: ${results.changelog ? '✅ Created' : '⏭️  Skipped'}`);
  deps.log(`   .release-it.json: ${results.releaseIt ? '✅ Created' : '⏭️  Skipped'}`);
  deps.log(`   package.json: ${results.packageJson ? '✅ Updated' : '⏭️  Skipped'}`);

  const anyCreated = Object.values(results).some((v) => v);

  if (anyCreated) {
    deps.log('\n🎉 Initialization complete!');
    deps.log('\nNext steps:');
    deps.log('   1. Review the generated files');
    deps.log('   2. Update CHANGELOG.md [Unreleased] section');
    deps.log('   3. Run: pnpm release-it-preset default --dry-run');
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

  initProject(options, {
    existsSync,
    readFileSync,
    writeFileSync,
    prompt: realPrompt,
    log: console.log,
    warn: console.warn,
  }).catch((error) => {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  });
}
/* c8 ignore end */
