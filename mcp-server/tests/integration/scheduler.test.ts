/**
 * Scheduler Integration Tests
 *
 * Tests the scheduler engine with real task execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Scheduler } from '../../src/scheduler/scheduler.js';
import { SQLiteStorage } from '../../src/storage/sqlite.js';
import { Task, ScheduleTrigger, BashTaskConfig } from '../../src/models/types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('Scheduler Integration Tests', () => {
  let scheduler: Scheduler;
  let storage: SQLiteStorage;
  let testDbPath: string;

  beforeEach(async () => {
    // Create temp database
    testDbPath = path.join('/tmp', `test-scheduler-${Date.now()}.db`);
    storage = new SQLiteStorage(testDbPath);
    scheduler = new Scheduler(storage, {
      default_timezone: 'UTC',
      check_interval: '1s',
    });
  });

  afterEach(async () => {
    await scheduler.stop();
    await storage.close();
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('should schedule and execute a bash task', async () => {
    // Create task that runs every 5 seconds
    const task = await storage.createTask({
      name: 'Test Echo',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "Hello World"',
      } as BashTaskConfig,
      trigger: {
        type: 'schedule',
        cron: '*/5 * * * * *', // Every 5 seconds
      } as ScheduleTrigger,
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    });

    // Schedule task
    await scheduler.scheduleTask(task);

    // Wait for execution (6 seconds to ensure cron triggers)
    await new Promise((resolve) => setTimeout(resolve, 6000));

    // Check execution
    const executions = await storage.loadExecutions({ task_id: task.id });
    expect(executions.length).toBeGreaterThan(0);
    expect(executions[0].status).toBe('success');
    expect(executions[0].output).toContain('Hello World');
  }, 10000); // 10 second timeout

  it('should manually execute a task', async () => {
    // Create manual task
    const task = await storage.createTask({
      name: 'Manual Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "Manual execution"',
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Manual only',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    });

    // Execute task manually
    const executionId = await scheduler.executeTask(task.id, 'manual');

    // Wait for execution to complete
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get execution
    const execution = await storage.getExecution(executionId);
    expect(execution).toBeDefined();
    expect(execution?.status).toBe('success');
    expect(execution?.output).toContain('Manual execution');

    // Check task stats
    const updatedTask = await storage.getTask(task.id);
    expect(updatedTask?.run_count).toBe(1);
    expect(updatedTask?.success_count).toBe(1);
  });

  it('should handle task failure correctly', async () => {
    // Create failing task
    const task = await storage.createTask({
      name: 'Failing Task',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'exit 1',
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Manual only',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    });

    // Execute task
    const executionId = await scheduler.executeTask(task.id, 'manual');

    // Wait for execution
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get execution
    const execution = await storage.getExecution(executionId);
    expect(execution).toBeDefined();
    expect(execution?.status).toBe('failure');
    expect(execution?.exit_code).toBe(1);

    // Check task stats
    const updatedTask = await storage.getTask(task.id);
    expect(updatedTask?.run_count).toBe(1);
    expect(updatedTask?.success_count).toBe(0);
    expect(updatedTask?.failure_count).toBe(1);
  });

  it('should skip task based on file existence condition', async () => {
    const testFilePath = '/tmp/test-condition-file-' + Date.now();

    // Create task with file condition
    const task = await storage.createTask({
      name: 'Conditional Task',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "Should not run"',
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Manual only',
      },
      conditions: {
        only_if_file_exists: testFilePath,
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    });

    // Execute task (should be skipped)
    const executionId = await scheduler.executeTask(task.id, 'manual');

    // Wait for execution
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Get execution
    const execution = await storage.getExecution(executionId);
    expect(execution).toBeDefined();
    expect(execution?.status).toBe('skipped');
  });

  it('should unschedule a task', async () => {
    // Create task
    const task = await storage.createTask({
      name: 'Unschedule Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "test"',
      } as BashTaskConfig,
      trigger: {
        type: 'schedule',
        cron: '*/10 * * * * *',
      } as ScheduleTrigger,
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    });

    // Schedule task
    await scheduler.scheduleTask(task);

    // Verify scheduled
    const scheduled = scheduler.getAllScheduledTasks();
    expect(scheduled.length).toBe(1);

    // Unschedule
    await scheduler.unscheduleTask(task.id);

    // Verify unscheduled
    const scheduledAfter = scheduler.getAllScheduledTasks();
    expect(scheduledAfter.length).toBe(0);
  });

  it('should reschedule a task when updated', async () => {
    // Create task
    const task = await storage.createTask({
      name: 'Reschedule Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "test"',
      } as BashTaskConfig,
      trigger: {
        type: 'schedule',
        cron: '*/10 * * * * *',
      } as ScheduleTrigger,
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    });

    // Schedule task
    await scheduler.scheduleTask(task);

    // Update trigger
    task.trigger = {
      type: 'schedule',
      cron: '*/20 * * * * *',
    } as ScheduleTrigger;

    // Reschedule
    await scheduler.rescheduleTask(task);

    // Verify still scheduled
    const scheduled = scheduler.getAllScheduledTasks();
    expect(scheduled.length).toBe(1);
  });

  it('should handle command timeout', async () => {
    // Create task with short timeout
    const task = await storage.createTask({
      name: 'Timeout Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'sleep 10',
        timeout: 1000, // 1 second timeout
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Manual only',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    });

    // Execute task
    const executionId = await scheduler.executeTask(task.id, 'manual');

    // Wait for timeout
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Get execution
    const execution = await storage.getExecution(executionId);
    expect(execution).toBeDefined();
    expect(execution?.status).toBe('timeout');
    expect(execution?.error).toContain('timed out');
  }, 5000);
});
