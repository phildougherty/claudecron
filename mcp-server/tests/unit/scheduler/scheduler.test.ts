/**
 * Scheduler Unit Tests
 *
 * Comprehensive unit tests for scheduler with mocked dependencies
 * Tests scheduling logic, condition evaluation, and task execution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scheduler } from '../../../src/scheduler/scheduler.js';
import { MockStorage, TestHelpers } from '../../fixtures/test-helpers.js';
import { Task } from '../../../src/models/types.js';

// Mock node-cron to avoid real scheduling
vi.mock('node-cron', () => ({
  default: {
    validate: (expr: string) => {
      // Simple validation
      const parts = expr.split(' ');
      return parts.length >= 5 && parts.length <= 6;
    },
    schedule: vi.fn((expr, callback, options) => ({
      stop: vi.fn()
    }))
  }
}));

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let storage: MockStorage;

  beforeEach(() => {
    storage = new MockStorage();
    scheduler = new Scheduler(storage, {
      check_interval: '30s',
      default_timezone: 'UTC',
      max_concurrent_tasks: 10
    });
  });

  afterEach(async () => {
    await scheduler.stop();
  });

  describe('Lifecycle', () => {
    it('should start scheduler successfully', async () => {
      await scheduler.start();

      const status = scheduler.getStatus();
      expect(status.running).toBe(true);
      expect(status.config.default_timezone).toBe('UTC');
    });

    it('should throw error when starting already running scheduler', async () => {
      await scheduler.start();

      await expect(scheduler.start()).rejects.toThrow('already running');
    });

    it('should stop scheduler successfully', async () => {
      await scheduler.start();
      await scheduler.stop();

      const status = scheduler.getStatus();
      expect(status.running).toBe(false);
    });

    it('should not error when stopping already stopped scheduler', async () => {
      await expect(scheduler.stop()).resolves.not.toThrow();
    });

    it('should return correct status', () => {
      const status = scheduler.getStatus();

      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('config');
      expect(status).toHaveProperty('scheduled_count');
      expect(status.config.default_timezone).toBe('UTC');
    });
  });

  describe('Task Scheduling', () => {
    beforeEach(async () => {
      await scheduler.start();
    });

    it('should schedule a cron task', async () => {
      const task = await storage.createTask({
        name: 'Hourly Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'schedule', cron: '0 * * * *' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.scheduleTask(task);

      const scheduled = scheduler.getAllScheduledTasks();
      expect(scheduled).toHaveLength(1);
      expect(scheduled[0].task.id).toBe(task.id);
      expect(scheduled[0].nextRun).toBeTruthy();
    });

    it('should throw error when scheduling non-schedule trigger', async () => {
      const task = TestHelpers.createMockTask({
        trigger: { type: 'manual', description: 'Manual only' }
      });

      await expect(scheduler.scheduleTask(task)).rejects.toThrow('Cannot schedule task');
    });

    it('should throw error for invalid cron expression', async () => {
      const task = await storage.createTask({
        name: 'Invalid Cron',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'schedule', cron: 'invalid cron' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await expect(scheduler.scheduleTask(task)).rejects.toThrow('Invalid cron expression');
    });

    it('should unschedule a task', async () => {
      const task = TestHelpers.createScheduledTask();
      await storage.createTask(task as any);

      await scheduler.scheduleTask(task);
      expect(scheduler.getAllScheduledTasks()).toHaveLength(1);

      await scheduler.unscheduleTask(task.id);
      expect(scheduler.getAllScheduledTasks()).toHaveLength(0);
    });

    it('should not error when unscheduling non-scheduled task', async () => {
      await expect(scheduler.unscheduleTask('non-existent')).resolves.not.toThrow();
    });

    it('should reschedule a task', async () => {
      const task = TestHelpers.createScheduledTask('0 * * * *');
      await storage.createTask(task as any);

      await scheduler.scheduleTask(task);

      // Modify trigger
      task.trigger = { type: 'schedule', cron: '0 0 * * *' };
      await storage.updateTask(task.id, { trigger: task.trigger });

      await scheduler.rescheduleTask(task);

      const scheduled = scheduler.getAllScheduledTasks();
      expect(scheduled).toHaveLength(1);
    });

    it('should unschedule when rescheduling disabled task', async () => {
      const task = TestHelpers.createScheduledTask();
      await storage.createTask(task as any);

      await scheduler.scheduleTask(task);

      task.enabled = false;
      await storage.updateTask(task.id, { enabled: false });

      await scheduler.rescheduleTask(task);

      expect(scheduler.getAllScheduledTasks()).toHaveLength(0);
    });

    it('should unschedule when rescheduling with non-schedule trigger', async () => {
      const task = TestHelpers.createScheduledTask();
      await storage.createTask(task as any);

      await scheduler.scheduleTask(task);

      task.trigger = { type: 'manual', description: 'Manual' };
      await storage.updateTask(task.id, { trigger: task.trigger });

      await scheduler.rescheduleTask(task);

      expect(scheduler.getAllScheduledTasks()).toHaveLength(0);
    });

    it('should update next_run in database when scheduling', async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'schedule', cron: '0 * * * *' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.scheduleTask(task);

      const updated = await storage.getTask(task.id);
      expect(updated?.next_run).toBeTruthy();
    });
  });

  describe('Task Execution', () => {
    it('should execute a manual task', async () => {
      const task = await storage.createTask({
        name: 'Manual Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const executionId = await scheduler.executeTask(task.id, 'manual');

      expect(executionId).toBeTruthy();

      const execution = await storage.getExecution(executionId);
      expect(execution).toBeTruthy();
      expect(execution?.task_id).toBe(task.id);
      expect(execution?.trigger_type).toBe('manual');
    });

    it('should throw error when executing non-existent task', async () => {
      await expect(
        scheduler.executeTask('non-existent')
      ).rejects.toThrow('Task not found');
    });

    it('should throw error when executing disabled task', async () => {
      const task = await storage.createTask({
        name: 'Disabled',
        enabled: false,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await expect(
        scheduler.executeTask(task.id)
      ).rejects.toThrow('Task is disabled');
    });

    it('should create running execution record immediately', async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const executionId = await scheduler.executeTask(task.id);
      const execution = await storage.getExecution(executionId);

      expect(execution?.status).toBe('running');
      expect(execution?.started_at).toBeTruthy();
    });

    it('should pass trigger context to execution', async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const context = { source: 'test', data: { key: 'value' } };
      const executionId = await scheduler.executeTask(task.id, 'manual', context);

      const execution = await storage.getExecution(executionId);
      expect(execution?.trigger_context).toEqual(context);
    });
  });

  describe('Condition Evaluation', () => {
    it('should skip task when condition is not met', async () => {
      const task = await storage.createTask({
        name: 'Conditional Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Manual' },
        conditions: {
          only_if_file_exists: '/this/file/does/not/exist.txt'
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const executionId = await scheduler.executeTask(task.id);
      const execution = await storage.getExecution(executionId);

      expect(execution?.status).toBe('skipped');
    });

    it('should execute task when overrideConditions is true', async () => {
      const task = await storage.createTask({
        name: 'Conditional Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Manual' },
        conditions: {
          only_if_file_exists: '/nonexistent'
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const executionId = await scheduler.executeTask(task.id, 'manual', undefined, true);
      const execution = await storage.getExecution(executionId);

      expect(execution?.status).toBe('running');
    });

    it('should check time window condition', async () => {
      const now = new Date();
      const currentHour = now.getHours();
      const futureHour = (currentHour + 2) % 24;

      const task = await storage.createTask({
        name: 'Time Window Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Manual' },
        conditions: {
          time_window: {
            start: `${futureHour}:00`,
            end: `${(futureHour + 1) % 24}:00`,
            timezone: 'UTC'
          }
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const executionId = await scheduler.executeTask(task.id);
      const execution = await storage.getExecution(executionId);

      expect(execution?.status).toBe('skipped');
    });

    it('should check file existence conditions', async () => {
      const task = await storage.createTask({
        name: 'File Check Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Manual' },
        conditions: {
          skip_if_file_exists: '/tmp' // /tmp should exist
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const executionId = await scheduler.executeTask(task.id);
      const execution = await storage.getExecution(executionId);

      expect(execution?.status).toBe('skipped');
    });
  });

  describe('Task Statistics Updates', () => {
    it('should update task run_count after execution', async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.executeTask(task.id);

      // Wait a bit for async execution to complete
      await TestHelpers.sleep(100);

      const updated = await storage.getTask(task.id);
      expect(updated?.run_count).toBeGreaterThan(0);
    });

    it('should update last_run timestamp', async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.executeTask(task.id);
      await TestHelpers.sleep(100);

      const updated = await storage.getTask(task.id);
      expect(updated?.last_run).toBeTruthy();
    });
  });

  describe('Multiple Tasks', () => {
    it('should schedule multiple tasks independently', async () => {
      const tasks = TestHelpers.createMultipleTasks(3, (i) => ({
        trigger: { type: 'schedule', cron: `${i} * * * *` }
      }));

      for (const task of tasks) {
        await storage.createTask(task as any);
        await scheduler.scheduleTask(task);
      }

      const scheduled = scheduler.getAllScheduledTasks();
      expect(scheduled).toHaveLength(3);
    });

    it('should load and schedule enabled tasks on start', async () => {
      // Create tasks before starting scheduler
      await storage.createTask({
        name: 'Task 1',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'schedule', cron: '0 * * * *' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createTask({
        name: 'Task 2',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'schedule', cron: '30 * * * *' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createTask({
        name: 'Disabled Task',
        enabled: false,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'schedule', cron: '0 0 * * *' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.start();

      const scheduled = scheduler.getAllScheduledTasks();
      expect(scheduled).toHaveLength(2);
    });

    it('should not schedule manual or hook tasks on start', async () => {
      await storage.createTask({
        name: 'Manual',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createTask({
        name: 'Hook',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'hook', event: 'PostToolUse' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.start();

      const scheduled = scheduler.getAllScheduledTasks();
      expect(scheduled).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle scheduling errors gracefully', async () => {
      const invalidTask = {
        ...TestHelpers.createScheduledTask(),
        trigger: { type: 'schedule', cron: 'invalid' }
      } as Task;

      await expect(scheduler.scheduleTask(invalidTask)).rejects.toThrow();
    });

    it('should continue scheduling other tasks if one fails', async () => {
      await storage.createTask({
        name: 'Valid Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'schedule', cron: '0 * * * *' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createTask({
        name: 'Invalid Cron',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'schedule', cron: 'bad' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.start();

      const scheduled = scheduler.getAllScheduledTasks();
      expect(scheduled).toHaveLength(1);
    });
  });

  describe('Timezone Handling', () => {
    it('should use task-specific timezone', async () => {
      const task = await storage.createTask({
        name: 'Tokyo Time',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'schedule', cron: '0 9 * * *', timezone: 'Asia/Tokyo' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.start();
      await scheduler.scheduleTask(task);

      const scheduled = scheduler.getAllScheduledTasks();
      expect(scheduled).toHaveLength(1);
    });

    it('should use default timezone when not specified', async () => {
      const task = await storage.createTask({
        name: 'Default TZ',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'schedule', cron: '0 * * * *' }, // No timezone specified
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await scheduler.start();
      await scheduler.scheduleTask(task);

      const scheduled = scheduler.getAllScheduledTasks();
      expect(scheduled).toHaveLength(1);
    });
  });
});
