/**
 * Pack template inclusion test — Spec §4
 *
 * Asserts that `dist/scripts/templates/workflows/release.yml.template` is
 * included in the npm tarball produced by `pnpm pack`.  Prevents accidental
 * exclusion of template files from the published package.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import { describe, it, expect, afterAll } from 'vitest';

const ROOT_DIR = join(import.meta.dirname, '..', '..');

// Unique temp directory for this run — cleaned up in afterAll
const PACK_DIR = join(tmpdir(), `pack-test-${randomBytes(6).toString('hex')}`);

function findTarball(dir: string): string | undefined {
  const files = readdirSync(dir);
  return files.find((f) => f.endsWith('.tgz'));
}

describe('pnpm pack — template file inclusion', () => {
  let tarball: string | undefined;
  let extractDir: string | undefined;

  afterAll(() => {
    // Clean up temp directory regardless of test outcome
    if (existsSync(PACK_DIR)) {
      rmSync(PACK_DIR, { recursive: true, force: true });
    }
  });

  it(
    'pnpm pack produces a tarball',
    { timeout: 60_000 },
    () => {
      // Ensure pack destination exists
      spawnSync('mkdir', ['-p', PACK_DIR]);

      const result = spawnSync('pnpm', ['pack', '--pack-destination', PACK_DIR], {
        cwd: ROOT_DIR,
        encoding: 'utf8',
      });

      expect(result.status, `pnpm pack failed:\n${result.stderr}`).toBe(0);

      tarball = findTarball(PACK_DIR);
      expect(tarball, 'Expected a .tgz file in pack destination').toBeDefined();
    },
  );

  it(
    'tarball contains dist/scripts/templates/workflows/release.yml.template',
    { timeout: 60_000 },
    () => {
      // Depends on the previous test having produced a tarball
      expect(tarball, 'No tarball produced by pack step').toBeDefined();

      extractDir = join(PACK_DIR, 'extracted');
      spawnSync('mkdir', ['-p', extractDir]);

      const tarResult = spawnSync(
        'tar',
        ['-xzf', join(PACK_DIR, tarball!), '-C', extractDir],
        { encoding: 'utf8' },
      );

      expect(tarResult.status, `tar extraction failed:\n${tarResult.stderr}`).toBe(0);

      const expectedPath = join(
        extractDir,
        'package',
        'dist',
        'scripts',
        'templates',
        'workflows',
        'release.yml.template',
      );

      expect(
        existsSync(expectedPath),
        `Template file missing from tarball.\nExpected: ${expectedPath}`,
      ).toBe(true);
    },
  );
});
