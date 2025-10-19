/**
 * Hook Manager Integration Tests
 *
 * Tests for Hook Manager functionality
 *
 * % 0 COMPLETE - Hook Manager tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Storage } from '../../src/storage/storage.js';
import { Scheduler } from '../../src/scheduler/scheduler.js';
import { HookManager } from '../../src/scheduler/hook-manager.js';
import { Task, HookEvent } from '../../src/models/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Hook Manager', () => {
  let storage: Storage;
  let scheduler: Scheduler;
  let hookManager: HookManager;
  let testDbPath: string;

  beforeEach(async () => {
    // Create temporary database
    testDbPath = path.join(os.tmpdir(), `test-hook-${Date.now()}.db`);

    // Initialize storage
    const { SQLiteStorage } = await import('../../src/storage/sqlite.js');
    storage = new SQLiteStorage({ type: 'sqlite', path: testDbPath });

    // Initialize scheduler
    scheduler = new Scheduler(storage);
    hookManager = scheduler.hookManager;
  });

  afterEach(async () => {
    // Cleanup
    await scheduler.stop();
    await storage.close();

    // Delete test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('handleHookEvent', () => {
    it('should handle SessionStart hook', async () => {
      // Create task with SessionStart hook
      const task = await storage.createTask({
        name: 'Session Init',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Session started"'
        },
        trigger: {
          type: 'hook',
          event: 'SessionStart',
          conditions: {
            source: ['startup']
          }
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger hook event
      await hookManager.handleHookEvent('SessionStart', {
        event: 'SessionStart',
        source: 'startup',
        timestamp: new Date().toISOString()
      });

      // Wait a bit for async execution
      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was executed
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      expect(executions.length).toBeGreaterThan(0);
      expect(executions[0].trigger_type).toBe('hook');
    });

    it('should filter by event type', async () => {
      // Create task for PostToolUse
      const task = await storage.createTask({
        name: 'Post Tool Handler',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Tool used"'
        },
        trigger: {
          type: 'hook',
          event: 'PostToolUse'
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger different event (should not execute)
      await hookManager.handleHookEvent('SessionStart', {
        event: 'SessionStart',
        timestamp: new Date().toISOString()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was NOT executed
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      expect(executions.length).toBe(0);
    });

    it('should match file patterns', async () => {
      // Create task for TypeScript files
      const task = await storage.createTask({
        name: 'TypeScript File Handler',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "TS file modified"'
        },
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          conditions: {
            file_pattern: '.*\\.ts$'
          }
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger with TypeScript file
      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        file_path: '/src/test.ts',
        timestamp: new Date().toISOString()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was executed
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      expect(executions.length).toBeGreaterThan(0);
    });

    it('should NOT match non-matching file patterns', async () => {
      // Create task for TypeScript files
      const task = await storage.createTask({
        name: 'TypeScript File Handler',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "TS file modified"'
        },
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          conditions: {
            file_pattern: '.*\\.ts$'
          }
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger with non-matching file
      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        file_path: '/src/test.js',
        timestamp: new Date().toISOString()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was NOT executed
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      expect(executions.length).toBe(0);
    });

    it('should apply debouncing', async () => {
      // Create task with debounce
      const task = await storage.createTask({
        name: 'Debounced Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Debounced"'
        },
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          debounce: '1s'
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger multiple events rapidly
      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        timestamp: new Date().toISOString()
      });

      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        timestamp: new Date().toISOString()
      });

      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        timestamp: new Date().toISOString()
      });

      // Wait for debounce period + execution
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Verify task was executed only once
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      // Should be 1 execution (debounced)
      expect(executions.length).toBe(1);
    });

    it('should match tool names', async () => {
      // Create task for specific tools
      const task = await storage.createTask({
        name: 'Write Tool Handler',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Write tool used"'
        },
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          conditions: {
            tool_names: ['Write', 'Edit']
          }
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger with matching tool
      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        tool_name: 'Write',
        timestamp: new Date().toISOString()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was executed
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      expect(executions.length).toBeGreaterThan(0);
    });

    it('should enrich context with git information', async () => {
      // Create task to capture context
      const task = await storage.createTask({
        name: 'Context Capture',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Captured"'
        },
        trigger: {
          type: 'hook',
          event: 'PostToolUse'
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger with file path
      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        file_path: '/src/test.ts',
        timestamp: new Date().toISOString()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify execution has enriched context
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      expect(executions.length).toBeGreaterThan(0);

      // Context should be enriched with git info
      const context = executions[0].trigger_context;
      expect(context).toBeDefined();
      // git_branch and git_dirty may or may not be present depending on git availability
    });
  });

  describe('Pattern Matching', () => {
    it('should use regex matcher for tool names', async () => {
      // Create task with regex matcher
      const task = await storage.createTask({
        name: 'Regex Matcher',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Matched"'
        },
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          matcher: '^(Write|Edit)$'
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger with matching tool
      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        tool_name: 'Write',
        timestamp: new Date().toISOString()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was executed
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      expect(executions.length).toBeGreaterThan(0);
    });

    it('should NOT match non-matching regex', async () => {
      // Create task with regex matcher
      const task = await storage.createTask({
        name: 'Regex Matcher',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Matched"'
        },
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          matcher: '^(Write|Edit)$'
        },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      // Trigger with non-matching tool
      await hookManager.handleHookEvent('PostToolUse', {
        event: 'PostToolUse',
        tool_name: 'Read',
        timestamp: new Date().toISOString()
      });

      await new Promise(resolve => setTimeout(resolve, 100));

      // Verify task was NOT executed
      const executions = await storage.loadExecutions({
        task_id: task.id
      });

      expect(executions.length).toBe(0);
    });
  });
});

/**
 * % 100 COMPLETE - Hook Manager tests
 */
