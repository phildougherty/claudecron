/**
 * Vitest Configuration
 *
 * Configuration for unit and integration testing with coverage
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files
    include: ['tests/**/*.test.ts'],

    // Global test environment
    globals: true,
    environment: 'node',

    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',

      // Files to include in coverage
      include: [
        'src/**/*.ts'
      ],

      // Files to exclude from coverage
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        'src/server.ts' // Entry point with minimal logic
      ],

      // Coverage thresholds
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85
      },

      // Report on all files, even those not tested
      all: true,

      // Clean coverage results before each run
      clean: true
    },

    // Test timeouts (increased for E2E tests)
    testTimeout: 30000,
    hookTimeout: 30000,

    // Retry failed tests once to handle flaky tests
    retry: 1,

    // Run tests in sequence for predictable results
    // (Can be changed to parallel for faster execution)
    sequence: {
      concurrent: false
    }
  }
});
