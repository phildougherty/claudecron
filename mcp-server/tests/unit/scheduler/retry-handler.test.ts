/**
 * RetryHandler Unit Tests
 *
 * Comprehensive tests for retry policy handling
 * Tests exponential/linear backoff, retry conditions, and statistics
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RetryHandler } from '../../../src/scheduler/retry-handler.js';
import { MockStorage } from '../../fixtures/test-helpers.js';
import { Task, Execution, RetryPolicy } from '../../../src/models/types.js';

describe('RetryHandler', () => {
  let retryHandler: RetryHandler;
  let storage: MockStorage;
  let mockScheduler: any;

  beforeEach(() => {
    storage = new MockStorage();
    retryHandler = new RetryHandler(storage);

    // Create mock scheduler
    mockScheduler = {
      executeTask: vi.fn(),
    };
    retryHandler.setScheduler(mockScheduler);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  describe('shouldRetry', () => {
    it('should return false if task has no retry policy', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'manual',
      };

      expect(retryHandler.shouldRetry(task, execution)).toBe(false);
    });

    it('should return false if max attempts reached', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'retry',
        trigger_context: {
          retry_metadata: {
            retry_count: 3,
            max_attempts: 3,
            backoff_strategy: 'exponential' as const,
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'all' as const,
            previous_attempts: [],
          },
        },
      };

      expect(retryHandler.shouldRetry(task, execution)).toBe(false);
    });

    it('should return true for failure when retry_on is "all"', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'all',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'manual',
      };

      expect(retryHandler.shouldRetry(task, execution)).toBe(true);
    });

    it('should return true for timeout when retry_on is "all"', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'all',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'timeout',
        trigger_type: 'manual',
      };

      expect(retryHandler.shouldRetry(task, execution)).toBe(true);
    });

    it('should return false for failure when retry_on is "timeout"', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'timeout',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'manual',
      };

      expect(retryHandler.shouldRetry(task, execution)).toBe(false);
    });

    it('should return true for timeout when retry_on is "timeout"', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'timeout',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'timeout',
        trigger_type: 'manual',
      };

      expect(retryHandler.shouldRetry(task, execution)).toBe(true);
    });

    it('should return true for failure when retry_on is "error"', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'error',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'manual',
      };

      expect(retryHandler.shouldRetry(task, execution)).toBe(true);
    });

    it('should return false for timeout when retry_on is "error"', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'error',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'timeout',
        trigger_type: 'manual',
      };

      expect(retryHandler.shouldRetry(task, execution)).toBe(false);
    });
  });

  describe('calculateDelay', () => {
    describe('exponential backoff', () => {
      it('should calculate exponential delay correctly', () => {
        const retryPolicy: RetryPolicy = {
          max_attempts: 5,
          backoff: 'exponential',
          initial_delay: 1000,
          max_delay: 60000,
        };

        // Attempt 0: 1000 * 2^0 = 1000
        expect(retryHandler.calculateDelay(retryPolicy, 0)).toBe(1000);

        // Attempt 1: 1000 * 2^1 = 2000
        expect(retryHandler.calculateDelay(retryPolicy, 1)).toBe(2000);

        // Attempt 2: 1000 * 2^2 = 4000
        expect(retryHandler.calculateDelay(retryPolicy, 2)).toBe(4000);

        // Attempt 3: 1000 * 2^3 = 8000
        expect(retryHandler.calculateDelay(retryPolicy, 3)).toBe(8000);

        // Attempt 4: 1000 * 2^4 = 16000
        expect(retryHandler.calculateDelay(retryPolicy, 4)).toBe(16000);
      });

      it('should cap exponential delay at max_delay', () => {
        const retryPolicy: RetryPolicy = {
          max_attempts: 10,
          backoff: 'exponential',
          initial_delay: 1000,
          max_delay: 10000,
        };

        // Attempt 5: 1000 * 2^5 = 32000, but capped at 10000
        expect(retryHandler.calculateDelay(retryPolicy, 5)).toBe(10000);

        // Attempt 10: 1000 * 2^10 = 1024000, but capped at 10000
        expect(retryHandler.calculateDelay(retryPolicy, 10)).toBe(10000);
      });
    });

    describe('linear backoff', () => {
      it('should calculate linear delay correctly', () => {
        const retryPolicy: RetryPolicy = {
          max_attempts: 5,
          backoff: 'linear',
          initial_delay: 1000,
          max_delay: 60000,
        };

        // Attempt 0: 1000 * (0 + 1) = 1000
        expect(retryHandler.calculateDelay(retryPolicy, 0)).toBe(1000);

        // Attempt 1: 1000 * (1 + 1) = 2000
        expect(retryHandler.calculateDelay(retryPolicy, 1)).toBe(2000);

        // Attempt 2: 1000 * (2 + 1) = 3000
        expect(retryHandler.calculateDelay(retryPolicy, 2)).toBe(3000);

        // Attempt 3: 1000 * (3 + 1) = 4000
        expect(retryHandler.calculateDelay(retryPolicy, 3)).toBe(4000);

        // Attempt 4: 1000 * (4 + 1) = 5000
        expect(retryHandler.calculateDelay(retryPolicy, 4)).toBe(5000);
      });

      it('should cap linear delay at max_delay', () => {
        const retryPolicy: RetryPolicy = {
          max_attempts: 100,
          backoff: 'linear',
          initial_delay: 1000,
          max_delay: 5000,
        };

        // Attempt 10: 1000 * (10 + 1) = 11000, but capped at 5000
        expect(retryHandler.calculateDelay(retryPolicy, 10)).toBe(5000);

        // Attempt 50: 1000 * (50 + 1) = 51000, but capped at 5000
        expect(retryHandler.calculateDelay(retryPolicy, 50)).toBe(5000);
      });
    });
  });

  describe('scheduleRetry', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    it('should schedule retry with correct delay for exponential backoff', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'manual',
        error: 'Test error',
      };

      await retryHandler.scheduleRetry(task, execution);

      // Should not execute immediately
      expect(mockScheduler.executeTask).not.toHaveBeenCalled();

      // Fast-forward time by 1000ms (initial delay)
      await vi.advanceTimersByTimeAsync(1000);

      // Should execute after delay
      expect(mockScheduler.executeTask).toHaveBeenCalledWith(
        'task-1',
        'retry',
        expect.objectContaining({
          retry_metadata: expect.objectContaining({
            retry_count: 1,
            max_attempts: 3,
            backoff_strategy: 'exponential',
          }),
        })
      );
    });

    it('should schedule retry with correct delay for linear backoff', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'linear',
            initial_delay: 2000,
            max_delay: 60000,
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'manual',
      };

      await retryHandler.scheduleRetry(task, execution);

      // Fast-forward time by 2000ms (initial delay)
      await vi.advanceTimersByTimeAsync(2000);

      expect(mockScheduler.executeTask).toHaveBeenCalledWith(
        'task-1',
        'retry',
        expect.objectContaining({
          retry_metadata: expect.objectContaining({
            retry_count: 1,
            backoff_strategy: 'linear',
          }),
        })
      );
    });

    it('should track previous attempts in retry metadata', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const execution: Execution = {
        id: 'exec-1',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'manual',
        error: 'First failure',
      };

      await retryHandler.scheduleRetry(task, execution);
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockScheduler.executeTask).toHaveBeenCalledWith(
        'task-1',
        'retry',
        expect.objectContaining({
          retry_metadata: expect.objectContaining({
            retry_count: 1,
            previous_attempts: expect.arrayContaining([
              expect.objectContaining({
                execution_id: 'exec-1',
                status: 'failure',
                error: 'First failure',
                delay_ms: 1000,
              }),
            ]),
          }),
        })
      );
    });

    it('should increment retry count on subsequent retries', async () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // Second attempt execution
      const execution: Execution = {
        id: 'exec-2',
        task_id: 'task-1',
        started_at: new Date().toISOString(),
        status: 'failure',
        trigger_type: 'retry',
        trigger_context: {
          retry_metadata: {
            retry_count: 1,
            max_attempts: 3,
            backoff_strategy: 'exponential' as const,
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'all' as const,
            previous_attempts: [
              {
                execution_id: 'exec-1',
                started_at: new Date().toISOString(),
                status: 'failure',
                delay_ms: 1000,
              },
            ],
          },
        },
      };

      await retryHandler.scheduleRetry(task, execution);

      // Delay should be 1000 * 2^1 = 2000
      await vi.advanceTimersByTimeAsync(2000);

      expect(mockScheduler.executeTask).toHaveBeenCalledWith(
        'task-1',
        'retry',
        expect.objectContaining({
          retry_metadata: expect.objectContaining({
            retry_count: 2,
            previous_attempts: expect.arrayContaining([
              expect.objectContaining({ execution_id: 'exec-1' }),
              expect.objectContaining({ execution_id: 'exec-2', delay_ms: 2000 }),
            ]),
          }),
        })
      );
    });
  });

  describe('getRetryStats', () => {
    it('should return zero stats when no retries exist', async () => {
      const stats = await retryHandler.getRetryStats('task-1');

      expect(stats).toEqual({
        total_retries: 0,
        successful_retries: 0,
        failed_retries: 0,
        average_retry_count: 0,
        max_retry_count: 0,
      });
    });

    it('should calculate retry statistics correctly', async () => {
      // Create some retry executions
      await storage.createExecution({
        task_id: 'task-1',
        trigger_type: 'retry',
        trigger_context: {
          retry_metadata: {
            retry_count: 1,
            max_attempts: 3,
            backoff_strategy: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'all',
            previous_attempts: [],
          },
        },
        status: 'success',
        started_at: new Date().toISOString(),
      });

      await storage.createExecution({
        task_id: 'task-1',
        trigger_type: 'retry',
        trigger_context: {
          retry_metadata: {
            retry_count: 2,
            max_attempts: 3,
            backoff_strategy: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'all',
            previous_attempts: [],
          },
        },
        status: 'failure',
        started_at: new Date().toISOString(),
      });

      await storage.createExecution({
        task_id: 'task-1',
        trigger_type: 'retry',
        trigger_context: {
          retry_metadata: {
            retry_count: 3,
            max_attempts: 3,
            backoff_strategy: 'exponential',
            initial_delay: 1000,
            max_delay: 60000,
            retry_on: 'all',
            previous_attempts: [],
          },
        },
        status: 'success',
        started_at: new Date().toISOString(),
      });

      const stats = await retryHandler.getRetryStats('task-1');

      expect(stats).toEqual({
        total_retries: 3,
        successful_retries: 2,
        failed_retries: 1,
        average_retry_count: 2, // (1 + 2 + 3) / 3 = 2
        max_retry_count: 3,
      });
    });
  });

  describe('createRetryMetadata', () => {
    it('should return null if task has no retry policy', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const metadata = retryHandler.createRetryMetadata(task);

      expect(metadata).toBeNull();
    });

    it('should create initial retry metadata from task policy', () => {
      const task: Task = {
        id: 'task-1',
        name: 'Test Task',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'manual' },
        options: {
          retry: {
            max_attempts: 5,
            backoff: 'linear',
            initial_delay: 2000,
            max_delay: 30000,
            retry_on: 'timeout',
          },
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const metadata = retryHandler.createRetryMetadata(task);

      expect(metadata).toEqual({
        retry_count: 0,
        max_attempts: 5,
        backoff_strategy: 'linear',
        initial_delay: 2000,
        max_delay: 30000,
        retry_on: 'timeout',
        previous_attempts: [],
      });
    });
  });
});
