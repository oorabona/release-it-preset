#!/usr/bin/env node
/* c8 ignore file */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function quote(value) {
  return `"${value.replace(/["\\]/g, '\\$&')}"`;
}

function resolveTsxCommand() {
  const localTsx = join(__dirname, '..', 'node_modules', '.bin', 'tsx');
  if (existsSync(localTsx)) {
    return localTsx;
  }
  return 'tsx';
}

function runWithNode(target, args) {
  const result = spawnSync(process.execPath, [target, ...args], { stdio: 'inherit' });
  if (result.error) {
    console.error(`❌ Failed to execute ${target}: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

function runWithTsx(tsxCommand, sourcePath, args) {
  const command = [`${quote(tsxCommand)} ${quote(sourcePath)}`]
    .concat(args.map(arg => quote(arg)))
    .join(' ');

  const result = spawnSync(command, { stdio: 'inherit', shell: true });
  if (result.error) {
    console.error(`❌ Failed to execute tsx: ${result.error.message}`);
    process.exit(1);
  }
  process.exit(result.status ?? 0);
}

const [scriptName, ...scriptArgs] = process.argv.slice(2);

if (!scriptName) {
  console.error('❌ Missing script name. Usage: node run-script.js <script-name> [...args]');
  process.exit(1);
}

const compiledPath = join(__dirname, '..', 'dist', 'scripts', `${scriptName}.js`);
const sourcePath = join(__dirname, '..', 'scripts', `${scriptName}.ts`);

if (existsSync(compiledPath)) {
  runWithNode(compiledPath, scriptArgs);
}

console.log('ℹ️  Compiled script not found, falling back to tsx execution.');
const tsxCommand = resolveTsxCommand();

if (!tsxCommand) {
  console.error('❌ Could not locate tsx. Run "pnpm install" or "pnpm build" and retry.');
  process.exit(1);
}

if (!existsSync(sourcePath)) {
  console.error(`❌ Source script not found: ${sourcePath}`);
  process.exit(1);
}

runWithTsx(tsxCommand, sourcePath, scriptArgs);
