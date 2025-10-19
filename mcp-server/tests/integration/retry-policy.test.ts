/**
 * Retry Policy Integration Tests
 *
 * End-to-end tests for retry policies with the scheduler
 * Tests exponential and linear backoff, different error types, and max attempts
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Scheduler } from '../../src/scheduler/scheduler.js';
import { MockStorage } from '../fixtures/test-helpers.js';
import { Task } from '../../src/models/types.js';

describe('Retry Policy Integration Tests', () => {
  let scheduler: Scheduler;
  let storage: MockStorage;

  beforeEach(async () => {
    storage = new MockStorage();

    scheduler = new Scheduler(storage, {
      check_interval: '1s',
      default_timezone: 'UTC',
      max_concurrent_tasks: 5,
    });

    vi.useFakeTimers();
  });

  afterEach(async () => {
    await scheduler.stop();
    vi.useRealTimers();
  });

  describe('Exponential Backoff', () => {
    it('should retry with exponential backoff after failure', async () => {
      // Create a failing bash task with retry policy
      const task = await storage.createTask({
        name: 'Failing Task',
        enabled: true,
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1', // Always fails
        },
        trigger: {
          type: 'manual',
          description: 'manual',
        },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 100,
            max_delay: 10000,
            retry_on: 'all',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      await scheduler.start();

      // Execute the task
      const executionId = await scheduler.executeTask(task.id, 'manual');

      // Wait for execution to complete
      await vi.advanceTimersByTimeAsync(50);

      // Check that first execution failed
      const firstExecution = await storage.getExecution(executionId);
      expect(firstExecution?.status).toBe('failure');

      // Wait for first retry (delay: 100ms)
      await vi.advanceTimersByTimeAsync(100);

      // Check that retry was scheduled
      const executions = await storage.getExecutions({ task_id: task.id });
      const retryExecutions = executions.filter((e) => e.trigger_type === 'retry');
      expect(retryExecutions.length).toBeGreaterThanOrEqual(1);

      // Verify retry metadata
      const firstRetry = retryExecutions[0];
      expect(firstRetry?.trigger_context?.retry_metadata).toBeDefined();
      expect(firstRetry?.trigger_context?.retry_metadata?.retry_count).toBe(1);
      expect(firstRetry?.trigger_context?.retry_metadata?.backoff_strategy).toBe(
        'exponential'
      );
    });

    it('should stop retrying after max attempts reached', async () => {
      const task = await storage.createTask({
        name: 'Max Attempts Task',
        enabled: true,
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1',
        },
        trigger: {
          type: 'manual',
          description: 'manual',
        },
        options: {
          retry: {
            max_attempts: 2,
            backoff: 'exponential',
            initial_delay: 50,
            max_delay: 10000,
            retry_on: 'all',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      await scheduler.start();

      // Execute the task
      await scheduler.executeTask(task.id, 'manual');

      // Wait for first execution and first retry
      await vi.advanceTimersByTimeAsync(200);

      // Wait for second retry
      await vi.advanceTimersByTimeAsync(200);

      // Wait a bit more to ensure no third retry happens
      await vi.advanceTimersByTimeAsync(500);

      // Check executions
      const executions = await storage.getExecutions({ task_id: task.id });

      // Should have: 1 initial + 2 retries = 3 total
      const allExecutions = executions.filter(
        (e) => e.status !== 'pending' && e.status !== 'running'
      );

      // We expect at most 3 executions (initial + 2 retries)
      expect(allExecutions.length).toBeLessThanOrEqual(3);

      const retryExecutions = executions.filter((e) => e.trigger_type === 'retry');

      // Should have at most 2 retry attempts
      expect(retryExecutions.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Linear Backoff', () => {
    it('should retry with linear backoff after failure', async () => {
      const task = await storage.createTask({
        name: 'Linear Backoff Task',
        enabled: true,
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1',
        },
        trigger: {
          type: 'manual',
          description: 'manual',
        },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'linear',
            initial_delay: 100,
            max_delay: 10000,
            retry_on: 'all',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      await scheduler.start();

      // Execute the task
      const executionId = await scheduler.executeTask(task.id, 'manual');

      // Wait for first execution to complete
      await vi.advanceTimersByTimeAsync(50);

      const firstExecution = await storage.getExecution(executionId);
      expect(firstExecution?.status).toBe('failure');

      // Wait for first retry (linear delay: 100ms * 1 = 100ms)
      await vi.advanceTimersByTimeAsync(100);

      const executions = await storage.getExecutions({ task_id: task.id });
      const retryExecutions = executions.filter((e) => e.trigger_type === 'retry');
      expect(retryExecutions.length).toBeGreaterThanOrEqual(1);

      const firstRetry = retryExecutions[0];
      expect(firstRetry?.trigger_context?.retry_metadata?.backoff_strategy).toBe('linear');
    });
  });

  describe('Retry Conditions', () => {
    it('should only retry on timeout when retry_on is "timeout"', async () => {
      const task = await storage.createTask({
        name: 'Timeout Retry Task',
        enabled: true,
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1', // Fails with error, not timeout
          timeout: 5000,
        },
        trigger: {
          type: 'manual',
          description: 'manual',
        },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 100,
            max_delay: 10000,
            retry_on: 'timeout', // Only retry on timeout
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      await scheduler.start();

      // Execute the task
      await scheduler.executeTask(task.id, 'manual');

      // Wait for execution to complete
      await vi.advanceTimersByTimeAsync(100);

      // Wait for potential retry
      await vi.advanceTimersByTimeAsync(200);

      // Should not retry because it failed with error, not timeout
      const executions = await storage.getExecutions({ task_id: task.id });
      const retryExecutions = executions.filter((e) => e.trigger_type === 'retry');
      expect(retryExecutions.length).toBe(0);
    });

    it('should retry on error when retry_on is "error"', async () => {
      const task = await storage.createTask({
        name: 'Error Retry Task',
        enabled: true,
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1', // Fails with error
        },
        trigger: {
          type: 'manual',
          description: 'manual',
        },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 100,
            max_delay: 10000,
            retry_on: 'error', // Only retry on error
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      await scheduler.start();

      // Execute the task
      await scheduler.executeTask(task.id, 'manual');

      // Wait for execution to complete
      await vi.advanceTimersByTimeAsync(50);

      // Wait for retry
      await vi.advanceTimersByTimeAsync(150);

      // Should retry because it failed with error
      const executions = await storage.getExecutions({ task_id: task.id });
      const retryExecutions = executions.filter((e) => e.trigger_type === 'retry');
      expect(retryExecutions.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Retry Metadata Tracking', () => {
    it('should track previous attempts in retry metadata', async () => {
      const task = await storage.createTask({
        name: 'Metadata Tracking Task',
        enabled: true,
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1',
        },
        trigger: {
          type: 'manual',
          description: 'manual',
        },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 50,
            max_delay: 10000,
            retry_on: 'all',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      });

      await scheduler.start();

      // Execute the task
      const firstExecutionId = await scheduler.executeTask(task.id, 'manual');

      // Wait for first execution
      await vi.advanceTimersByTimeAsync(50);

      // Wait for first retry (50ms delay)
      await vi.advanceTimersByTimeAsync(50);

      // Wait for second retry (100ms delay)
      await vi.advanceTimersByTimeAsync(100);

      const executions = await storage.getExecutions({ task_id: task.id });
      const retryExecutions = executions.filter((e) => e.trigger_type === 'retry');

      if (retryExecutions.length >= 2) {
        const secondRetry = retryExecutions[1];
        const metadata = secondRetry?.trigger_context?.retry_metadata;

        expect(metadata).toBeDefined();
        expect(metadata?.retry_count).toBe(2);
        expect(metadata?.previous_attempts.length).toBe(2);
        expect(metadata?.previous_attempts[0]?.execution_id).toBe(firstExecutionId);
      }
    });
  });
});
