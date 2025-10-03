/**
 * Semantic versioning utility functions
 */

/**
 * Validate if a string is a valid semantic version
 *
 * @param version Version string to validate (can have optional 'v' prefix)
 * @returns true if valid semver, false otherwise
 */
export function isValidSemver(version: string): boolean {
  const semverRegex = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
  return semverRegex.test(version);
}

/**
 * Validate and normalize a semantic version string
 *
 * @param version Version string to validate
 * @throws Error if version is not valid semver
 * @returns Normalized version without 'v' prefix
 */
export function validateAndNormalizeSemver(version: string): string {
  if (!isValidSemver(version)) {
    throw new Error(`Invalid semantic version: "${version}". Expected format: [v]MAJOR.MINOR.PATCH[-prerelease][+buildmetadata]`);
  }
  return version.replace(/^v/, '');
}
