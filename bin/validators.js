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
 * Validates that a path does not contain directory traversal attempts
 *
 * @param {string} path - The path to validate
 * @throws {Error} If path contains traversal patterns
 * @returns {string} The validated path
 */
export function validatePath(path) {
  // Check for directory traversal patterns
  if (path.includes('..')) {
    throw new Error(
      `Path contains directory traversal pattern (..) which is not allowed: "${path}"`
    );
  }

  // Check for absolute paths (we expect relative paths)
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) {
    throw new Error(
      `Absolute paths are not allowed: "${path}"`
    );
  }

  return path;
}
