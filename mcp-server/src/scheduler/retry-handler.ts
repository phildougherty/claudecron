/**
 * Retry Handler
 *
 * Manages retry policies for failed task executions
 * Supports exponential and linear backoff strategies
 *
 * % 0 COMPLETE - Retry Handler (Day 4)
 */

import { Task, Execution, RetryPolicy, ExecutionStatus } from '../models/types.js';
import { Storage } from '../storage/storage.js';

/**
 * Retry Metadata
 * Tracks retry attempts and state for an execution
 */
export interface RetryMetadata {
  retry_count: number;
  max_attempts: number;
  backoff_strategy: 'linear' | 'exponential';
  initial_delay: number;
  max_delay: number;
  retry_on: 'all' | 'timeout' | 'error';
  previous_attempts: Array<{
    execution_id: string;
    started_at: string;
    status: ExecutionStatus;
    error?: string;
    delay_ms: number;
  }>;
}

/**
 * RetryHandler
 *
 * Manages retry logic for failed task executions
 */
export class RetryHandler {
  private storage: Storage;
  private scheduler: any; // Set via setScheduler to avoid circular dependency

  constructor(storage: Storage) {
    this.storage = storage;
  }

  /**
   * Set scheduler reference (to avoid circular dependency)
   */
  setScheduler(scheduler: any): void {
    this.scheduler = scheduler;
  }

  /**
   * Check if a failed execution should be retried
   * @param task - The task that failed
   * @param execution - The failed execution
   * @returns True if retry should be attempted
   */
  shouldRetry(task: Task, execution: Execution): boolean {
    // Check if task has retry policy configured
    if (!task.options?.retry) {
      return false;
    }

    const retryPolicy = task.options.retry;
    const retryMetadata = this.getRetryMetadata(execution, task);

    // Check if max attempts reached
    if (retryMetadata.retry_count >= retryPolicy.max_attempts) {
      console.error(
        `[RetryHandler] Max retry attempts (${retryPolicy.max_attempts}) reached for task ${task.name}`
      );
      return false;
    }

    // Check if execution status matches retry criteria
    const retryOn = retryPolicy.retry_on || 'all';

    switch (retryOn) {
      case 'timeout':
        return execution.status === 'timeout';
      case 'error':
        return execution.status === 'failure';
      case 'all':
        return execution.status === 'failure' || execution.status === 'timeout';
      default:
        return false;
    }
  }

  /**
   * Calculate delay for next retry attempt
   * @param retryPolicy - The retry policy
   * @param retryCount - Current retry attempt number (0-based)
   * @returns Delay in milliseconds
   */
  calculateDelay(retryPolicy: RetryPolicy, retryCount: number): number {
    const initialDelay = retryPolicy.initial_delay;
    const maxDelay = retryPolicy.max_delay;

    let delay: number;

    if (retryPolicy.backoff === 'exponential') {
      // Exponential backoff: delay = initial_delay * 2^retry_count
      delay = initialDelay * Math.pow(2, retryCount);
    } else {
      // Linear backoff: delay = initial_delay * (retry_count + 1)
      delay = initialDelay * (retryCount + 1);
    }

    // Cap at max_delay
    return Math.min(delay, maxDelay);
  }

  /**
   * Schedule a retry for a failed execution
   * @param task - The task to retry
   * @param execution - The failed execution
   */
  async scheduleRetry(task: Task, execution: Execution): Promise<void> {
    if (!task.options?.retry) {
      throw new Error(`Task ${task.id} does not have retry policy configured`);
    }

    const retryPolicy = task.options.retry;
    const retryMetadata = this.getRetryMetadata(execution, task);
    const nextRetryCount = retryMetadata.retry_count + 1;

    // Calculate delay for this retry
    const delay = this.calculateDelay(retryPolicy, retryMetadata.retry_count);

    console.error(
      `[RetryHandler] Scheduling retry ${nextRetryCount}/${retryPolicy.max_attempts} for task ${task.name} in ${delay}ms (${retryPolicy.backoff} backoff)`
    );

    // Update retry metadata with this attempt
    const attemptRecord: {
      execution_id: string;
      started_at: string;
      status: ExecutionStatus;
      error?: string;
      delay_ms: number;
    } = {
      execution_id: execution.id,
      started_at: execution.started_at,
      status: execution.status,
      delay_ms: delay,
    };

    // Only add error if it exists
    if (execution.error !== undefined) {
      attemptRecord.error = execution.error;
    }

    const updatedMetadata: RetryMetadata = {
      ...retryMetadata,
      retry_count: nextRetryCount,
      previous_attempts: [
        ...retryMetadata.previous_attempts,
        attemptRecord,
      ],
    };

    // Schedule the retry
    setTimeout(async () => {
      try {
        await this.executeRetry(task, updatedMetadata);
      } catch (error: any) {
        console.error(
          `[RetryHandler] Retry execution failed for task ${task.name}:`,
          error.message
        );
      }
    }, delay);
  }

  /**
   * Execute a retry attempt
   * @param task - The task to retry
   * @param retryMetadata - Retry metadata including attempt count
   */
  private async executeRetry(task: Task, retryMetadata: RetryMetadata): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler not set. Call setScheduler() before executing retries.');
    }

    console.error(
      `[RetryHandler] Executing retry attempt ${retryMetadata.retry_count}/${retryMetadata.max_attempts} for task ${task.name}`
    );

    // Execute task with retry context
    const triggerContext = {
      retry_metadata: retryMetadata,
    };

    await this.scheduler.executeTask(task.id, 'retry', triggerContext);
  }

  /**
   * Extract retry metadata from execution trigger context
   * @param execution - The execution to extract metadata from
   * @param task - The task that owns this execution
   * @returns Retry metadata (creates new if not present)
   */
  private getRetryMetadata(execution: Execution, task: Task): RetryMetadata {
    const context = execution.trigger_context;

    // If retry metadata exists in context, return it
    if (context?.retry_metadata) {
      return context.retry_metadata;
    }

    // Otherwise, create initial metadata from task's retry policy
    const retryPolicy = task.options?.retry;

    if (!retryPolicy) {
      throw new Error(`No retry policy found for task ${task.id}`);
    }

    return {
      retry_count: 0,
      max_attempts: retryPolicy.max_attempts,
      backoff_strategy: retryPolicy.backoff,
      initial_delay: retryPolicy.initial_delay,
      max_delay: retryPolicy.max_delay,
      retry_on: retryPolicy.retry_on || 'all',
      previous_attempts: [],
    };
  }

  /**
   * Get retry statistics for a task
   * @param taskId - Task ID
   * @returns Retry statistics
   */
  async getRetryStats(taskId: string): Promise<{
    total_retries: number;
    successful_retries: number;
    failed_retries: number;
    average_retry_count: number;
    max_retry_count: number;
  }> {
    // Get all executions for this task
    const executions = await this.storage.loadExecutions({ task_id: taskId });

    // Filter retry executions
    const retryExecutions = executions.filter(
      (exec: Execution) => exec.trigger_type === 'retry' && exec.trigger_context?.retry_metadata
    );

    if (retryExecutions.length === 0) {
      return {
        total_retries: 0,
        successful_retries: 0,
        failed_retries: 0,
        average_retry_count: 0,
        max_retry_count: 0,
      };
    }

    // Calculate statistics
    const successfulRetries = retryExecutions.filter(
      (exec: Execution) => exec.status === 'success'
    ).length;
    const failedRetries = retryExecutions.filter(
      (exec: Execution) => exec.status === 'failure' || exec.status === 'timeout'
    ).length;

    const retryCounts = retryExecutions
      .map((exec: Execution) => exec.trigger_context?.retry_metadata?.retry_count || 0)
      .filter((count: number) => count > 0);

    const avgRetryCount =
      retryCounts.length > 0
        ? retryCounts.reduce((sum: number, count: number) => sum + count, 0) / retryCounts.length
        : 0;
    const maxRetryCount = retryCounts.length > 0 ? Math.max(...retryCounts) : 0;

    return {
      total_retries: retryExecutions.length,
      successful_retries: successfulRetries,
      failed_retries: failedRetries,
      average_retry_count: Math.round(avgRetryCount * 100) / 100,
      max_retry_count: maxRetryCount,
    };
  }

  /**
   * Create retry metadata for a new execution
   * @param task - Task with retry policy
   * @returns Initial retry metadata
   */
  createRetryMetadata(task: Task): RetryMetadata | null {
    if (!task.options?.retry) {
      return null;
    }

    const retryPolicy = task.options.retry;

    return {
      retry_count: 0,
      max_attempts: retryPolicy.max_attempts,
      backoff_strategy: retryPolicy.backoff,
      initial_delay: retryPolicy.initial_delay,
      max_delay: retryPolicy.max_delay,
      retry_on: retryPolicy.retry_on || 'all',
      previous_attempts: [],
    };
  }
}

/**
 * % 100 COMPLETE - Retry Handler (Day 4)
 */
