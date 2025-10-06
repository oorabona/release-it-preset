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
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { validateConfigName, validateUtilityCommand, sanitizeArgs, validateConfigPath } from './validators.js';

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
Usage: release-it-preset [command] [...args]
       release-it-preset --config <file> [...args]

CLI Modes:
  1. Auto-detection (no command)      - Reads preset from .release-it.json
  2. Preset selection                  - Specify preset command
  3. Passthrough (--config)            - Direct config file, bypass validation
  4. Utility commands                  - Helper scripts

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

Passthrough Mode:
  --config <file>  Use custom config file, bypass preset validation

Examples:
  # Zero-config (auto-detect from .release-it.json)
  release-it-preset

  # Release commands
  release-it-preset default --dry-run
  release-it-preset hotfix --verbose
  release-it-preset changelog-only --ci

  # Passthrough mode (custom config)
  release-it-preset --config .release-it-manual.json

  # Monorepo (parent config reference)
  release-it-preset --config ../../.release-it-base.json

  # Utility commands
  release-it-preset init
  release-it-preset update
  release-it-preset validate

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

  if (hasUserConfig) {
    // Read and validate user config
    try {
      const userConfigContent = readFileSync(userConfigPath, 'utf8');
      const userConfig = JSON.parse(userConfigContent);

      const expectedExtends = `@oorabona/release-it-preset/config/${configName}`;

      if (!userConfig.extends) {
        // ERROR: extends is required for config merging
        console.error(`\n❌ Configuration error!`);
        console.error(`   .release-it.json is missing the required "extends" field.`);
        console.error(``);
        console.error(`Without "extends", your config won't merge with the preset.`);
        console.error(`This means you'll get release-it defaults instead of preset defaults.`);
        console.error(``);
        console.error(`Fix by adding this to .release-it.json:`);
        console.error(`  {`);
        console.error(`    "extends": "${expectedExtends}",`);
        console.error(`    ...your overrides`);
        console.error(`  }`);
        console.error(``);
        console.error(`Or remove .release-it.json to use the preset directly.\n`);
        process.exit(1);
      }

      // Validate extends matches CLI preset
      const extendsMatch = userConfig.extends.match(/@oorabona\/release-it-preset\/config\/([\w-]+)/);
      const extendsPreset = extendsMatch?.[1];

      if (extendsPreset && extendsPreset !== configName) {
        console.error(`\n❌ Configuration mismatch error!`);
        console.error(`   CLI preset:               ${configName}`);
        console.error(`   .release-it.json extends: ${extendsPreset}`);
        console.error(``);
        console.error(`Either:`);
        console.error(`  1. Run: release-it-preset ${extendsPreset}`);
        console.error(`     → Use the preset specified in your config file`);
        console.error(``);
        console.error(`  2. Update .release-it.json extends to: "${expectedExtends}"`);
        console.error(`     → Match your config file to the CLI command\n`);
        process.exit(1);
      }

      console.log(`✅ Config validated: preset "${configName}"`);
      console.log(`📝 Using: ${userConfigPath}\n`);
    } catch (error) {
      if (error instanceof SyntaxError) {
        console.error(`❌ Failed to parse .release-it.json: ${error.message}`);
      } else {
        console.error(`❌ Error reading .release-it.json: ${error.message}`);
      }
      process.exit(1);
    }

    // Let release-it discover .release-it.json and merge via extends
    fullArgs = [...args];
  } else {
    // No user config - use preset directly
    console.log(`📝 Using preset config directly: ${configPath}`);
    console.log(`   Tip: Create .release-it.json with "extends" to customize\n`);
    fullArgs = ['--config', configPath, ...args];
  }

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

function passthroughToReleaseIt(args) {
  // Extract --config value
  const configIndex = args.indexOf('--config');
  if (configIndex === -1 || configIndex === args.length - 1) {
    console.error('❌ --config requires a file path argument\n');
    console.error('Usage: release-it-preset --config <file>');
    process.exit(1);
  }

  const configPath = args[configIndex + 1];

  // Security validation
  try {
    validateConfigPath(configPath);
    sanitizeArgs(args);

    console.log(`🔀 Passthrough mode: using config ${configPath}`);
    console.log(`   Bypassing preset validation - direct release-it invocation\n`);
  } catch (error) {
    console.error(`❌ Configuration validation failed: ${error.message}`);
    process.exit(1);
  }

  // Delegate to release-it
  const releaseItCommand = 'release-it';
  const child = spawn(releaseItCommand, args, {
    stdio: 'inherit',
    shell: false, // Security: prevent command injection
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

function main() {
  const args = process.argv.slice(2);

  // Handle --help
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  // Check for conflicting arguments (preset command + --config)
  if (args.includes('--config') && RELEASE_CONFIGS[command]) {
    console.error('❌ Conflicting arguments detected!\n');
    console.error('   You specified both a preset command and --config flag.');
    console.error('');
    console.error('   Either:');
    console.error(`     1. Use preset: release-it-preset ${command}`);
    console.error(`     2. Use config: release-it-preset --config <file>`);
    console.error('');
    console.error('   Do not mix both approaches.');
    process.exit(1);
  }

  // MODE 1: Passthrough - Direct release-it with custom config
  if (args.includes('--config')) {
    passthroughToReleaseIt(args);
    return;
  }

  // MODE 2: Auto-detection - No arguments, read preset from .release-it.json
  if (args.length === 0) {
    const userConfigPath = join(process.cwd(), '.release-it.json');

    if (!existsSync(userConfigPath)) {
      console.error('❌ No command specified and no .release-it.json found\n');
      console.error('Either:');
      console.error('  1. Run: release-it-preset init');
      console.error('  2. Run: release-it-preset <command>\n');
      showHelp();
      process.exit(1);
    }

    try {
      const config = JSON.parse(readFileSync(userConfigPath, 'utf8'));
      const extendsMatch = config.extends?.match(/@oorabona\/release-it-preset\/config\/([\w-]+)/);

      if (!extendsMatch) {
        console.error('❌ .release-it.json does not extend a known preset\n');
        console.error('Expected extends field like:');
        console.error('  "@oorabona/release-it-preset/config/default"\n');
        process.exit(1);
      }

      const preset = extendsMatch[1];
      console.log(`🔍 Auto-detected preset: ${preset}`);
      handleReleaseCommand(preset, []);
      return;
    } catch (error) {
      console.error(`❌ Error reading .release-it.json: ${error.message}`);
      process.exit(1);
    }
  }

  // MODE 3: Preset command (existing logic)
  if (RELEASE_CONFIGS[command]) {
    handleReleaseCommand(command, commandArgs);
    return;
  }

  // MODE 4: Utility command (existing logic)
  if (UTILITY_COMMANDS[command]) {
    handleUtilityCommand(command, commandArgs);
    return;
  }

  // Unknown command
  console.error(`❌ Unknown command: ${command}`);
  console.error(`\nAvailable release configs: ${Object.keys(RELEASE_CONFIGS).join(', ')}`);
  console.error(`Available utility commands: ${Object.keys(UTILITY_COMMANDS).join(', ')}`);
  console.error(`\nFor direct config file usage: release-it-preset --config <file>`);
  console.error(`\nRun 'release-it-preset --help' for more information.`);
  process.exit(1);
}

main();
