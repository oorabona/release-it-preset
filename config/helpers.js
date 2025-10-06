import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CHANGELOG_COMMAND } from './constants.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const RUN_SCRIPT_PATH = join(__dirname, '..', 'bin', 'run-script.js');

const DOUBLE_QUOTE = /["\\]/g;

function quote(value) {
  return `"${value.replace(DOUBLE_QUOTE, '\\$&')}"`;
}

function fallbackReleaseNotes(version) {
  return `# Release v${version}\n\nNo changelog entry available.\n`;
}

export function runScriptCommand(scriptName, extraArgs = []) {
  const args = [scriptName, ...extraArgs].map(quote).join(' ');
  return `node ${quote(RUN_SCRIPT_PATH)} ${args}`.trim();
}

export function createReleaseNotesGenerator() {
  return ({ version }) => {
    const result = spawnSync(
      process.execPath,
      [RUN_SCRIPT_PATH, 'extract-changelog', version],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'inherit'],
      },
    );

    if (result.error) {
      console.warn(`⚠️  Failed to run extract-changelog script: ${result.error.message}`);
      return fallbackReleaseNotes(version);
    }

    if (result.status !== 0) {
      console.warn(
        `⚠️  extract-changelog exited with code ${
          typeof result.status === 'number' ? result.status : 'unknown'
        }`,
      );
      return fallbackReleaseNotes(version);
    }

    const output = result.stdout?.trim();
    return output ? `${output}\n` : fallbackReleaseNotes(version);
  };
}

export function getGitChangelogCommand() {
  return process.env.GIT_CHANGELOG_COMMAND || DEFAULT_CHANGELOG_COMMAND;
}
