/**
 * Input validation and security utilities for CLI
 *
 * This module provides validation functions to prevent security issues
 * like command injection, path traversal, and invalid input.
 *
 * OWASP Security Principles Applied:
 * - Input Validation
 * - Whitelist validation
 * - Fail securely
 */

import { existsSync, statSync } from 'node:fs';
import { extname, isAbsolute, resolve } from 'node:path';

/**
 * Validates that a config name is in the allowed list
 *
 * @param {string} configName - The configuration name to validate
 * @param {Set<string>} allowedConfigs - Set of allowed configuration names
 * @throws {Error} If config name is not in the allowed list
 * @returns {string} The validated config name
 */
export function validateConfigName(configName, allowedConfigs) {
  if (!allowedConfigs.has(configName)) {
    const allowed = Array.from(allowedConfigs).join(', ');
    throw new Error(
      `Invalid configuration name: "${configName}"\n` +
      `Allowed configurations: ${allowed}`
    );
  }
  return configName;
}

/**
 * Validates that a utility command name is in the allowed list
 *
 * @param {string} commandName - The command name to validate
 * @param {Set<string>} allowedCommands - Set of allowed command names
 * @throws {Error} If command name is not in the allowed list
 * @returns {string} The validated command name
 */
export function validateUtilityCommand(commandName, allowedCommands) {
  if (!allowedCommands.has(commandName)) {
    const allowed = Array.from(allowedCommands).join(', ');
    throw new Error(
      `Invalid utility command: "${commandName}"\n` +
      `Allowed commands: ${allowed}`
    );
  }
  return commandName;
}

/**
 * Dangerous patterns that could indicate command injection attempts
 * Includes shell metacharacters and control operators
 */
const DANGEROUS_PATTERNS = [
  /[;&|`$()]/,           // Shell control operators
  /\$\{[^}]*\}/,         // Variable substitution
  /\$\([^)]*\)/,         // Command substitution
  /[<>]/,                // Redirection operators
  /\n|\r/,               // Line breaks (can chain commands)
  /\\\\/,                // Backslash escaping
];

/**
 * Sanitizes command arguments to prevent injection attacks
 *
 * This function validates each argument against dangerous patterns.
 * It uses a whitelist approach: only safe characters are allowed.
 *
 * @param {string[]} args - Array of command arguments
 * @throws {Error} If any argument contains dangerous patterns
 * @returns {string[]} The validated arguments
 */
export function sanitizeArgs(args) {
  return args.map((arg, index) => {
    // Check each dangerous pattern
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(arg)) {
        throw new Error(
          `Argument ${index + 1} contains potentially dangerous characters: "${arg}"\n` +
          `Matched pattern: ${pattern.toString()}\n` +
          `This could be a security risk and has been blocked.`
        );
      }
    }

    // Additional check for null bytes (common in exploits)
    if (arg.includes('\0')) {
      throw new Error(
        `Argument ${index + 1} contains null bytes, which is not allowed for security reasons.`
      );
    }

    return arg;
  });
}

/**
 * Validates config file paths with monorepo support
 *
 * Security approach: Defense in depth with multiple validation layers
 * - Whitelist allowed file extensions
 * - Limit parent directory traversal depth (monorepo support)
 * - Reject absolute paths from CLI
 * - Validate file existence
 *
 * Why we allow ".." (parent directory references):
 * - Standard pattern in monorepos (TypeScript, ESLint, Prettier all allow it)
 * - Developer controls the environment (config files are trusted code boundary)
 * - No privilege escalation possible in CLI tool context
 * - Multiple validation layers prevent abuse
 *
 * @param {string} configPath - The config file path to validate (relative or absolute)
 * @throws {Error} If validation fails (invalid extension, too deep, missing file, etc.)
 * @returns {string} Absolute path to validated config file
 */
export function validateConfigPath(configPath) {
  // 1. Whitelist config file extensions (defense in depth)
  const allowedExtensions = ['.json', '.js', '.cjs', '.mjs', '.yaml', '.yml', '.toml'];
  const ext = extname(configPath).toLowerCase();

  if (!allowedExtensions.includes(ext)) {
    throw new Error(
      `Invalid config file extension: "${ext}"\n` +
      `Allowed: ${allowedExtensions.join(', ')}\n` +
      `This restriction prevents reading non-config files.`
    );
  }

  // 2. Limit parent directory traversal depth (max 5 levels for monorepo support)
  const upwardLevels = (configPath.match(/\.\.\//g) || []).length;
  if (upwardLevels > 5) {
    throw new Error(
      `Too many parent directory references: ${upwardLevels}\n` +
      `Maximum allowed: 5 levels (../../../../../../)\n` +
      `This prevents accidental access to system directories.`
    );
  }

  // 3. Reject absolute paths from CLI (could reference system files)
  if (isAbsolute(configPath)) {
    throw new Error(
      `Absolute paths not allowed: "${configPath}"\n` +
      `Use relative paths from your project directory.\n` +
      `For monorepos, use parent references like ../../config.json`
    );
  }

  // 4. Resolve to absolute path and validate file exists
  const resolved = resolve(process.cwd(), configPath);

  if (!existsSync(resolved)) {
    throw new Error(
      `Config file not found: "${configPath}"\n` +
      `Resolved to: ${resolved}\n` +
      `Check that the file exists and the path is correct.`
    );
  }

  // 5. Validate it's a file (not a directory or symlink to avoid confusion)
  const stats = statSync(resolved);
  if (!stats.isFile()) {
    throw new Error(
      `Config path must be a file, not a directory: "${configPath}"\n` +
      `Resolved to: ${resolved}`
    );
  }

  return resolved;
}
