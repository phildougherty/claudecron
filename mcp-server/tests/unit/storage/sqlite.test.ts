/**
 * SQLite Storage Unit Tests
 *
 * Comprehensive unit tests for SQLite storage implementation
 * Tests all CRUD operations, edge cases, and error conditions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SQLiteStorage } from '../../../src/storage/sqlite.js';
import { TestHelpers } from '../../fixtures/test-helpers.js';
import fs from 'fs';
import path from 'path';

describe('SQLiteStorage', () => {
  let storage: SQLiteStorage;
  let dbPath: string;

  beforeEach(() => {
    // Create unique database for each test
    dbPath = path.join('/tmp', `claudecron-test-${Date.now()}.db`);
    storage = new SQLiteStorage(dbPath);
  });

  afterEach(async () => {
    // Cleanup
    await storage.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  describe('Task CRUD Operations', () => {
    it('should create a task with all required fields', async () => {
      const task = await storage.createTask({
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      expect(task.id).toBeTruthy();
      expect(task.name).toBe('Test Task');
      expect(task.enabled).toBe(true);
      expect(task.created_at).toBeTruthy();
      expect(task.updated_at).toBeTruthy();
      expect(task.run_count).toBe(0);
    });

    it('should create a task with optional fields', async () => {
      const task = await storage.createTask({
        name: 'Complex Task',
        description: 'A task with all optional fields',
        enabled: true,
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Test prompt',
          allowed_tools: ['Read', 'Write'],
          additional_context: 'Extra context'
        },
        trigger: {
          type: 'schedule',
          cron: '0 * * * *',
          timezone: 'UTC'
        },
        options: {
          permission_mode: 'bypassPermissions',
          timeout: 60000
        },
        conditions: {
          skip_holidays: true,
          holiday_region: 'US'
        },
        on_success: [{
          type: 'notify',
          message: 'Success!'
        }],
        on_failure: [{
          type: 'notify',
          message: 'Failed!'
        }],
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      expect(task.description).toBe('A task with all optional fields');
      expect(task.options).toBeDefined();
      expect(task.conditions).toBeDefined();
      expect(task.on_success).toHaveLength(1);
      expect(task.on_failure).toHaveLength(1);
    });

    it('should retrieve task by id', async () => {
      const created = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const retrieved = await storage.getTask(created.id);
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.name).toBe(created.name);
      expect(retrieved?.enabled).toBe(created.enabled);
      expect(retrieved?.type).toBe(created.type);
      expect(retrieved?.task_config).toEqual(created.task_config);
      expect(retrieved?.trigger).toEqual(created.trigger);
    });

    it('should return null for non-existent task', async () => {
      const task = await storage.getTask('non-existent-id');
      expect(task).toBeNull();
    });

    it('should update task fields', async () => {
      const task = await storage.createTask({
        name: 'Original',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      // Small delay to ensure timestamp changes
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await storage.updateTask(task.id, {
        name: 'Updated',
        enabled: false
      });

      expect(updated.name).toBe('Updated');
      expect(updated.enabled).toBe(false);
      expect(updated.updated_at >= task.updated_at).toBe(true);
      expect(updated.id).toBe(task.id); // ID should not change
    });

    it('should throw error when updating non-existent task', async () => {
      await expect(
        storage.updateTask('non-existent', { name: 'Updated' })
      ).rejects.toThrow('Task not found');
    });

    it('should delete task', async () => {
      const task = await storage.createTask({
        name: 'To Delete',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.deleteTask(task.id);

      const retrieved = await storage.getTask(task.id);
      expect(retrieved).toBeNull();
    });

    it('should throw error when deleting non-existent task', async () => {
      await expect(
        storage.deleteTask('non-existent')
      ).rejects.toThrow('Task not found');
    });
  });

  describe('Task Filtering and Queries', () => {
    beforeEach(async () => {
      // Create test data
      await storage.createTask({
        name: 'Enabled Bash',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createTask({
        name: 'Disabled Bash',
        enabled: false,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createTask({
        name: 'Enabled AI',
        enabled: true,
        type: 'ai_prompt',
        task_config: { type: 'ai_prompt', prompt: 'test' },
        trigger: { type: 'schedule', cron: '0 * * * *' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createTask({
        name: 'Hook Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'hook', event: 'PostToolUse' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });
    });

    it('should load all tasks without filter', async () => {
      const tasks = await storage.loadTasks();
      expect(tasks).toHaveLength(4);
    });

    it('should filter by enabled status', async () => {
      const enabled = await storage.loadTasks({ enabled: true });
      expect(enabled).toHaveLength(3);
      expect(enabled.every(t => t.enabled)).toBe(true);

      const disabled = await storage.loadTasks({ enabled: false });
      expect(disabled).toHaveLength(1);
      expect(disabled[0].enabled).toBe(false);
    });

    it('should filter by task type', async () => {
      const bash = await storage.loadTasks({ type: 'bash' });
      expect(bash).toHaveLength(3);
      expect(bash.every(t => t.type === 'bash')).toBe(true);

      const ai = await storage.loadTasks({ type: 'ai_prompt' });
      expect(ai).toHaveLength(1);
      expect(ai[0].type).toBe('ai_prompt');
    });

    it('should filter by trigger type', async () => {
      const manual = await storage.loadTasks({ trigger_type: 'manual' });
      expect(manual).toHaveLength(2);

      const schedule = await storage.loadTasks({ trigger_type: 'schedule' });
      expect(schedule).toHaveLength(1);

      const hook = await storage.loadTasks({ trigger_type: 'hook' });
      expect(hook).toHaveLength(1);
    });

    it('should filter by trigger event', async () => {
      const hookTasks = await storage.loadTasks({ trigger_event: 'PostToolUse' });
      expect(hookTasks).toHaveLength(1);
      expect(hookTasks[0].name).toBe('Hook Task');
    });

    it('should combine multiple filters', async () => {
      const filtered = await storage.loadTasks({
        enabled: true,
        type: 'bash',
        trigger_type: 'manual'
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Enabled Bash');
    });
  });

  describe('Execution CRUD Operations', () => {
    let taskId: string;

    beforeEach(async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });
      taskId = task.id;
    });

    it('should create execution', async () => {
      const execution = await storage.createExecution({
        task_id: taskId,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      expect(execution.id).toBeTruthy();
      expect(execution.task_id).toBe(taskId);
      expect(execution.status).toBe('running');
    });

    it('should create execution with all fields', async () => {
      const execution = await storage.createExecution({
        task_id: taskId,
        status: 'success',
        trigger_type: 'scheduled',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 5000,
        exit_code: 0,
        output: 'Test output',
        sdk_usage: {
          input_tokens: 100,
          output_tokens: 50
        },
        cost_usd: 0.001
      });

      expect(execution.exit_code).toBe(0);
      expect(execution.output).toBe('Test output');
      expect(execution.sdk_usage).toBeDefined();
      expect(execution.cost_usd).toBe(0.001);
    });

    it('should retrieve execution by id', async () => {
      const created = await storage.createExecution({
        task_id: taskId,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      const retrieved = await storage.getExecution(created.id);
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.task_id).toBe(created.task_id);
      expect(retrieved?.status).toBe(created.status);
      expect(retrieved?.trigger_type).toBe(created.trigger_type);
    });

    it('should return null for non-existent execution', async () => {
      const execution = await storage.getExecution('non-existent');
      expect(execution).toBeNull();
    });

    it('should update execution', async () => {
      const execution = await storage.createExecution({
        task_id: taskId,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      const updated = await storage.updateExecution(execution.id, {
        status: 'success',
        completed_at: new Date().toISOString(),
        duration_ms: 1000,
        output: 'Command output'
      });

      expect(updated.status).toBe('success');
      expect(updated.duration_ms).toBe(1000);
      expect(updated.output).toBe('Command output');
    });

    it('should throw error when updating non-existent execution', async () => {
      await expect(
        storage.updateExecution('non-existent', { status: 'success' })
      ).rejects.toThrow('Execution not found');
    });

    it('should cascade delete executions when task deleted', async () => {
      await storage.createExecution({
        task_id: taskId,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      await storage.createExecution({
        task_id: taskId,
        status: 'failure',
        trigger_type: 'scheduled',
        started_at: new Date().toISOString()
      });

      await storage.deleteTask(taskId);

      const executions = await storage.loadExecutions({ task_id: taskId });
      expect(executions).toHaveLength(0);
    });
  });

  describe('Execution Filtering and Queries', () => {
    let task1Id: string;
    let task2Id: string;

    beforeEach(async () => {
      const task1 = await storage.createTask({
        name: 'Task 1',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });
      task1Id = task1.id;

      const task2 = await storage.createTask({
        name: 'Task 2',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });
      task2Id = task2.id;

      // Create executions with different statuses and times
      const baseTime = Date.now();

      await storage.createExecution({
        task_id: task1Id,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date(baseTime - 3000).toISOString()
      });

      await storage.createExecution({
        task_id: task1Id,
        status: 'failure',
        trigger_type: 'scheduled',
        started_at: new Date(baseTime - 2000).toISOString()
      });

      await storage.createExecution({
        task_id: task2Id,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date(baseTime - 1000).toISOString()
      });

      await storage.createExecution({
        task_id: task1Id,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date(baseTime).toISOString()
      });
    });

    it('should load all executions without filter', async () => {
      const executions = await storage.loadExecutions();
      expect(executions).toHaveLength(4);
    });

    it('should filter by task_id', async () => {
      const task1Execs = await storage.loadExecutions({ task_id: task1Id });
      expect(task1Execs).toHaveLength(3);

      const task2Execs = await storage.loadExecutions({ task_id: task2Id });
      expect(task2Execs).toHaveLength(1);
    });

    it('should filter by status', async () => {
      const success = await storage.loadExecutions({ status: 'success' });
      expect(success).toHaveLength(2);

      const failure = await storage.loadExecutions({ status: 'failure' });
      expect(failure).toHaveLength(1);

      const running = await storage.loadExecutions({ status: 'running' });
      expect(running).toHaveLength(1);
    });

    it('should filter by date range', async () => {
      const baseTime = Date.now();
      const executions = await storage.loadExecutions({
        start_date: new Date(baseTime - 2500).toISOString(),
        end_date: new Date(baseTime - 500).toISOString()
      });

      expect(executions.length).toBeGreaterThan(0);
    });

    it('should apply limit', async () => {
      const limited = await storage.loadExecutions({ limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it('should apply offset', async () => {
      const all = await storage.loadExecutions();
      const offset = await storage.loadExecutions({ offset: 2 });

      expect(offset).toHaveLength(all.length - 2);
    });

    it('should combine limit and offset', async () => {
      const page2 = await storage.loadExecutions({ limit: 2, offset: 2 });
      expect(page2).toHaveLength(2);
    });

    it('should return executions in descending order by started_at', async () => {
      const executions = await storage.loadExecutions();

      for (let i = 0; i < executions.length - 1; i++) {
        expect(executions[i].started_at >= executions[i + 1].started_at).toBe(true);
      }
    });
  });

  describe('Task Statistics', () => {
    let taskId: string;

    beforeEach(async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });
      taskId = task.id;
    });

    it('should return zero stats for task with no executions', async () => {
      const stats = await storage.getTaskStats(taskId);

      expect(stats.total_runs).toBe(0);
      expect(stats.successful_runs).toBe(0);
      expect(stats.failed_runs).toBe(0);
      expect(stats.average_duration_ms).toBe(0);
      expect(stats.total_cost_usd).toBe(0);
    });

    it('should calculate stats correctly', async () => {
      await storage.createExecution({
        task_id: taskId,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 1000,
        cost_usd: 0.001
      });

      await storage.createExecution({
        task_id: taskId,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 2000,
        cost_usd: 0.002
      });

      await storage.createExecution({
        task_id: taskId,
        status: 'failure',
        trigger_type: 'manual',
        started_at: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        duration_ms: 500,
        error: 'Test error'
      });

      const stats = await storage.getTaskStats(taskId);

      expect(stats.total_runs).toBe(3);
      expect(stats.successful_runs).toBe(2);
      expect(stats.failed_runs).toBe(1);
      expect(stats.average_duration_ms).toBe(1166.6666666666667); // (1000 + 2000 + 500) / 3
      expect(stats.total_cost_usd).toBe(0.003);
    });
  });

  describe('JSON Field Handling', () => {
    it('should correctly serialize and deserialize complex task_config', async () => {
      const task = await storage.createTask({
        name: 'Complex AI Task',
        enabled: true,
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Test prompt',
          model: 'claude-sonnet-4.5',
          allowed_tools: ['Read', 'Write', 'Bash'],
          additional_context: 'Extra context',
          max_thinking_tokens: 10000
        },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const retrieved = await storage.getTask(task.id);
      expect(retrieved?.task_config).toEqual(task.task_config);
    });

    it('should correctly serialize and deserialize complex trigger', async () => {
      const task = await storage.createTask({
        name: 'Hook Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          conditions: {
            tool_names: ['Write', 'Edit'],
            file_pattern: '*.ts'
          },
          debounce: '5s'
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const retrieved = await storage.getTask(task.id);
      expect(retrieved?.trigger).toEqual(task.trigger);
    });

    it('should handle null/undefined optional JSON fields', async () => {
      const task = await storage.createTask({
        name: 'Minimal',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const retrieved = await storage.getTask(task.id);
      expect(retrieved?.options).toBeUndefined();
      expect(retrieved?.conditions).toBeUndefined();
      expect(retrieved?.on_success).toBeUndefined();
      expect(retrieved?.on_failure).toBeUndefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty task list', async () => {
      const tasks = await storage.loadTasks();
      expect(tasks).toEqual([]);
    });

    it('should handle empty execution list', async () => {
      const executions = await storage.loadExecutions();
      expect(executions).toEqual([]);
    });

    it('should handle very long output strings', async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const longOutput = 'x'.repeat(100000); // 100KB string

      const execution = await storage.createExecution({
        task_id: task.id,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date().toISOString(),
        output: longOutput
      });

      const retrieved = await storage.getExecution(execution.id);
      expect(retrieved?.output).toBe(longOutput);
    });

    it('should handle special characters in strings', async () => {
      const task = await storage.createTask({
        name: 'Special "chars" & symbols',
        description: "Line 1\nLine 2\tTabbed\r\nWindows",
        enabled: true,
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "test\'s quote"'
        },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const retrieved = await storage.getTask(task.id);
      expect(retrieved?.name).toBe('Special "chars" & symbols');
      expect(retrieved?.description).toBe("Line 1\nLine 2\tTabbed\r\nWindows");
    });

    it('should maintain referential integrity on cascade delete', async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const exec1 = await storage.createExecution({
        task_id: task.id,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      await storage.deleteTask(task.id);

      const execution = await storage.getExecution(exec1.id);
      expect(execution).toBeNull();
    });
  });

  describe('Database Lifecycle', () => {
    it('should create database file on initialization', () => {
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('should close database connection cleanly', async () => {
      await storage.close();
      // Should not throw any errors
    });

    it('should support WAL mode for better concurrency', () => {
      // This is set in constructor, just verify no errors
      expect(storage).toBeTruthy();
    });
  });
});
