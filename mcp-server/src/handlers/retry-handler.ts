/**
 * Retry Handler
 *
 * Automatically retries failed tasks with configurable backoff strategies
 * Supports:
 * - Linear and exponential backoff
 * - Maximum retry attempts
 * - Delay limits (initial and max)
 * - Retry count tracking
 * - Smart retry scheduling
 */

import { Task, Execution, RetryHandler as RetryHandlerConfig } from '../models/types.js';

export class RetryHandler {
  private scheduler: any; // Scheduler instance (set via setScheduler)

  /**
   * Set scheduler reference
   * Called during initialization to avoid circular dependencies
   *
   * @param scheduler - Scheduler instance
   */
  setScheduler(scheduler: any): void {
    this.scheduler = scheduler;
  }

  /**
   * Execute retry handler - schedule a retry of the failed task
   *
   * @param handler - Retry handler configuration
   * @param task - Task that failed
   * @param execution - Failed execution record
   */
  async execute(
    handler: RetryHandlerConfig,
    task: Task,
    execution: Execution
  ): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler not set on RetryHandler');
    }

    // Get current retry count from execution context
    const retryCount = this.getRetryCount(execution) + 1;

    // Check if max attempts reached
    if (retryCount >= handler.max_attempts) {
      console.error(
        `[RetryHandler] Max retry attempts (${handler.max_attempts}) reached for task ${task.name}`
      );
      return;
    }

    // Calculate delay based on backoff strategy
    const delay = this.calculateDelay(
      retryCount,
      handler.backoff,
      handler.initial_delay || 1000,
      handler.max_delay || 60000
    );

    console.error(
      `[RetryHandler] Scheduling retry ${retryCount}/${handler.max_attempts} for task ${task.name} in ${delay}ms`
    );

    // Schedule retry with delay
    setTimeout(async () => {
      try {
        const retryContext = this.buildRetryContext(
          execution,
          retryCount,
          delay
        );

        await this.scheduler.executeTask(
          task.id,
          'retry',
          retryContext
        );

        console.error(
          `[RetryHandler] Retry ${retryCount} started for task ${task.name}`
        );
      } catch (error: any) {
        console.error(
          `[RetryHandler] Failed to execute retry ${retryCount} for task ${task.name}: ${error.message}`
        );
      }
    }, delay);
  }

  /**
   * Get retry count from execution context
   *
   * @param execution - Execution record
   * @returns Current retry count (0 if first attempt)
   */
  private getRetryCount(execution: Execution): number {
    if (!execution.trigger_context) {
      return 0;
    }

    return execution.trigger_context.retry_count || 0;
  }

  /**
   * Calculate delay for next retry based on backoff strategy
   *
   * @param retryCount - Current retry attempt (1-based)
   * @param backoff - Backoff strategy (linear or exponential)
   * @param initialDelay - Initial delay in milliseconds
   * @param maxDelay - Maximum delay in milliseconds
   * @returns Delay in milliseconds
   */
  private calculateDelay(
    retryCount: number,
    backoff: 'linear' | 'exponential',
    initialDelay: number,
    maxDelay: number
  ): number {
    let delay: number;

    if (backoff === 'exponential') {
      // Exponential backoff: delay = initial * 2^(retryCount - 1)
      delay = initialDelay * Math.pow(2, retryCount - 1);
    } else {
      // Linear backoff: delay = initial * retryCount
      delay = initialDelay * retryCount;
    }

    // Apply max delay limit
    return Math.min(delay, maxDelay);
  }

  /**
   * Build retry context for triggered task
   *
   * @param previousExecution - Previous failed execution
   * @param retryCount - Current retry attempt
   * @param delayMs - Delay before retry
   * @returns Retry context object
   */
  private buildRetryContext(
    previousExecution: Execution,
    retryCount: number,
    delayMs: number
  ): Record<string, any> {
    return {
      retry_count: retryCount,
      previous_execution_id: previousExecution.id,
      previous_error: previousExecution.error,
      previous_exit_code: previousExecution.exit_code,
      retry_delay_ms: delayMs,
      retry_scheduled_at: new Date().toISOString(),
      retry_start_time: new Date(Date.now() + delayMs).toISOString(),
    };
  }

  /**
   * Get retry statistics for a task
   * Useful for monitoring and debugging
   *
   * @param executions - Array of executions for a task
   * @returns Retry statistics
   */
  static getRetryStats(executions: Execution[]): {
    total_retries: number;
    max_retry_count: number;
    successful_retries: number;
    failed_retries: number;
    avg_retry_delay_ms: number;
  } {
    const retries = executions.filter(
      e => e.trigger_type === 'retry' && e.trigger_context?.retry_count
    );

    const totalRetries = retries.length;
    const maxRetryCount = Math.max(
      0,
      ...retries.map(e => e.trigger_context?.retry_count || 0)
    );
    const successfulRetries = retries.filter(e => e.status === 'success').length;
    const failedRetries = retries.filter(e => e.status === 'failure').length;

    const delaySum = retries.reduce(
      (sum, e) => sum + (e.trigger_context?.retry_delay_ms || 0),
      0
    );
    const avgRetryDelay = totalRetries > 0 ? delaySum / totalRetries : 0;

    return {
      total_retries: totalRetries,
      max_retry_count: maxRetryCount,
      successful_retries: successfulRetries,
      failed_retries: failedRetries,
      avg_retry_delay_ms: avgRetryDelay,
    };
  }
}
