#!/usr/bin/env node
/**
 * CLI wrapper for release-it-preset
 *
 * Provides two types of commands:
 * 1. Release commands - Run release-it with specific configurations
 * 2. Utility commands - Helper commands for project setup and validation
 *
 * Usage:
 *   release-it-preset <command> [...args]
 *
 * Release commands:
 *   release-it-preset default
 *   release-it-preset hotfix
 *   release-it-preset changelog-only
 *
 * Utility commands:
 *   release-it-preset init [--yes]
 *   release-it-preset update
 *   release-it-preset validate [--allow-dirty]
 *   release-it-preset check
 *   release-it-preset check-pr
 *   release-it-preset retry-publish-preflight
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateConfigName, validateUtilityCommand, sanitizeArgs } from './validators.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const RELEASE_CONFIGS = {
  default: 'config/default.js',
  hotfix: 'config/hotfix.js',
  'changelog-only': 'config/changelog-only.js',
  'manual-changelog': 'config/manual-changelog.js',
  'no-changelog': 'config/no-changelog.js',
  republish: 'config/republish.js',
  'retry-publish': 'config/retry-publish.js',
};

// Map base names (without extension) for utility scripts
const UTILITY_COMMANDS = {
  init: 'init-project',
  update: 'populate-unreleased-changelog',
  validate: 'validate-release',
  check: 'check-config',
  'check-pr': 'check-pr-status',
  'retry-publish-preflight': 'retry-publish',
};

function showHelp() {
  console.log(`
Usage: release-it-preset <command> [...args]

Release Commands:
  default          Full release with changelog, git, GitHub, and npm
  hotfix           Emergency hotfix with auto-changelog from commits
  changelog-only   Update changelog only, no release
  manual-changelog Release with manually edited changelog (skip auto-generation)
  no-changelog     Release without changelog updates
  republish        Republish existing version (moves git tag)
  retry-publish    Retry failed npm/GitHub publish

Utility Commands:
  init [--yes]           Initialize project (create CHANGELOG.md, .release-it.json, etc.)
  update                 Update [Unreleased] section from commits
  validate [--allow-dirty]  Validate project is ready for release
  check                  Display configuration and project status
  check-pr               Evaluate PR hygiene (branch diff, changelog status, conventions)
  retry-publish-preflight  Run retry publish safety checks without executing release

Examples:
  # Release commands
  release-it-preset default --dry-run
  release-it-preset hotfix --verbose
  release-it-preset changelog-only --ci

  # Utility commands
  release-it-preset init
  release-it-preset update
  release-it-preset validate
  release-it-preset check
  release-it-preset check-pr
  release-it-preset retry-publish-preflight

For release-it options, see: https://github.com/release-it/release-it
For environment variables, see: https://github.com/oorabona/release-it-preset#environment-variables
`);
}

function handleReleaseCommand(configName, args) {
  // Validate inputs
  try {
    validateConfigName(configName, new Set(Object.keys(RELEASE_CONFIGS)));
    sanitizeArgs(args);
  } catch (error) {
    console.error(`❌ Validation error: ${error.message}`);
    process.exit(1);
  }

  const configPath = join(__dirname, '..', RELEASE_CONFIGS[configName]);
  const userConfigPath = join(process.cwd(), '.release-it.json');
  const hasUserConfig = existsSync(userConfigPath);

  console.log(`🚀 Running release-it with preset: ${configName}`);

  const releaseItCommand = 'release-it';
  let fullArgs;
  let strategyMessage;

  if (hasUserConfig) {
    // User has .release-it.json - let release-it handle the merge naturally
    // The user config should have "extends": "@oorabona/release-it-preset/config/<preset>"
    fullArgs = [...args];
    strategyMessage = `📝 Using user config: ${userConfigPath}\n   (should extend preset: ${configName})`;
    console.log(strategyMessage);
    console.log(`ℹ️  Ensure your .release-it.json contains: "extends": "@oorabona/release-it-preset/config/${configName}"`);
  } else {
    // No user config - use preset directly
    fullArgs = ['--config', configPath, ...args];
    strategyMessage = `📝 Using preset config directly: ${configPath}`;
    console.log(strategyMessage);
    console.log(`ℹ️  Tip: Create .release-it.json with "extends" to customize the preset`);
  }

  console.log(`💡 Command: ${releaseItCommand} ${fullArgs.join(' ')}\n`);

  const child = spawn(releaseItCommand, fullArgs, {
    stdio: 'inherit',
    shell: false, // Security: disable shell to prevent command injection
  });

  child.on('error', (error) => {
    console.error(`❌ Failed to start release-it: ${error.message}`);
    console.error(`\nMake sure release-it is installed:`);
    console.error(`  pnpm add -D release-it`);
    process.exit(1);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

function handleUtilityCommand(commandName, args) {
  // Validate inputs
  try {
    validateUtilityCommand(commandName, new Set(Object.keys(UTILITY_COMMANDS)));
    sanitizeArgs(args);
  } catch (error) {
    console.error(`❌ Validation error: ${error.message}`);
    process.exit(1);
  }

  const base = UTILITY_COMMANDS[commandName];
  const compiledPath = join(__dirname, '..', 'dist', 'scripts', `${base}.js`);
  const sourcePath = join(__dirname, '..', 'scripts', `${base}.ts`);

  console.log(`🔧 Running utility command: ${commandName}\n`);

  // Prefer compiled script; fallback to tsx source if not built yet (developer convenience)
  import('node:fs').then(fs => {
    const useCompiled = fs.existsSync(compiledPath);
    const runner = useCompiled ? 'node' : 'tsx';
    const target = useCompiled ? compiledPath : sourcePath;
    if (!useCompiled) {
      console.log('ℹ️  Compiled script not found, falling back to tsx source execution (dev mode).');
    }

    const child = spawn(runner, [target, ...args], {
      stdio: 'inherit',
      shell: false, // Security: disable shell to prevent command injection
    });

    child.on('error', (error) => {
      console.error(`❌ Failed to run command: ${error.message}`);
      if (!useCompiled) {
        console.error(`\nMake sure tsx is installed for source execution:`);
        console.error(`  pnpm add -D tsx`);
      }
      process.exit(1);
    });

    child.on('close', (code) => {
      process.exit(code ?? 0);
    });
  });
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  // Check if it's a release config
  if (RELEASE_CONFIGS[command]) {
    handleReleaseCommand(command, commandArgs);
    return;
  }

  // Check if it's a utility command
  if (UTILITY_COMMANDS[command]) {
    handleUtilityCommand(command, commandArgs);
    return;
  }

  // Unknown command
  console.error(`❌ Unknown command: ${command}`);
  console.error(`\nAvailable release configs: ${Object.keys(RELEASE_CONFIGS).join(', ')}`);
  console.error(`Available utility commands: ${Object.keys(UTILITY_COMMANDS).join(', ')}`);
  console.error(`\nRun 'release-it-preset --help' for more information.`);
  process.exit(1);
}

main();
