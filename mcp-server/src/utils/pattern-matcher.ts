/**
 * Pattern Matching Utilities
 *
 * Sophisticated pattern matching for file paths and strings
 *
 * % 0 COMPLETE - Pattern matcher implementation
 */

import { minimatch } from 'minimatch';

/**
 * Pattern Matcher
 *
 * Supports multiple pattern types:
 * 1. Glob patterns: *.ts, src/**\/*.js (using minimatch)
 * 2. Regex patterns: /^src\/.*\.tsx?$/
 * 3. Extensions: .ts, .tsx, .js
 */
export class PatternMatcher {
  /**
   * Check if a file path matches a pattern
   *
   * @param filePath - File path to test
   * @param pattern - Pattern to match against
   * @returns True if the file path matches the pattern
   */
  static matchesFilePattern(
    filePath: string,
    pattern: string
  ): boolean {
    // Support multiple pattern types:

    // 1. Regex pattern (starts and ends with /)
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      const regexStr = pattern.slice(1, -1);
      const regex = new RegExp(regexStr);
      return regex.test(filePath);
    }

    // 2. Extension pattern (starts with .)
    if (pattern.startsWith('.')) {
      return filePath.endsWith(pattern);
    }

    // 3. Glob pattern (use minimatch)
    return minimatch(filePath, pattern);
  }

  /**
   * Check if a string matches a regex pattern
   *
   * @param value - String to test
   * @param pattern - Regex pattern (with or without / delimiters)
   * @returns True if the string matches
   */
  static matchesRegex(
    value: string,
    pattern: string
  ): boolean {
    try {
      // Remove leading/trailing slashes if present
      const regexStr = pattern.startsWith('/') && pattern.endsWith('/')
        ? pattern.slice(1, -1)
        : pattern;

      const regex = new RegExp(regexStr);
      return regex.test(value);
    } catch (error) {
      console.error(`[PatternMatcher] Invalid regex pattern: ${pattern}`, error);
      return false;
    }
  }

  /**
   * Test multiple patterns (OR logic)
   *
   * @param value - String to test
   * @param patterns - Array of patterns
   * @returns True if the value matches any pattern
   */
  static matchesAny(
    value: string,
    patterns: string[]
  ): boolean {
    return patterns.some(pattern => this.matchesFilePattern(value, pattern));
  }

  /**
   * Test multiple patterns (AND logic)
   *
   * @param value - String to test
   * @param patterns - Array of patterns
   * @returns True if the value matches all patterns
   */
  static matchesAll(
    value: string,
    patterns: string[]
  ): boolean {
    return patterns.every(pattern => this.matchesFilePattern(value, pattern));
  }
}

/**
 * % 100 COMPLETE - Pattern matcher implementation
 */
