/**
 * Trigger Task Handler
 *
 * Triggers execution of other tasks based on completion of current task
 * Supports:
 * - Triggering tasks by ID
 * - Passing execution context to triggered tasks
 * - Conditional triggering
 * - Chaining multiple tasks
 */

import { Task, Execution, TriggerTaskHandler as TriggerTaskHandlerConfig } from '../models/types.js';

export class TriggerTaskHandler {
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
   * Execute trigger task handler - trigger another task
   *
   * @param handler - Trigger task handler configuration
   * @param task - Task that was executed (parent task)
   * @param execution - Execution record of parent task
   */
  async execute(
    handler: TriggerTaskHandlerConfig,
    task: Task,
    execution: Execution
  ): Promise<void> {
    if (!this.scheduler) {
      throw new Error('Scheduler not set on TriggerTaskHandler');
    }

    // Build trigger context
    const triggerContext = handler.pass_context
      ? this.buildTriggerContext(task, execution)
      : undefined;

    console.error(
      `[TriggerTaskHandler] Triggering task ${handler.task_id} from ${task.name} (pass_context: ${handler.pass_context || false})`
    );

    try {
      // Trigger the task
      const triggeredExecutionId = await this.scheduler.executeTask(
        handler.task_id,
        'triggered',
        triggerContext
      );

      console.error(
        `[TriggerTaskHandler] Successfully triggered task ${handler.task_id}, execution ID: ${triggeredExecutionId}`
      );
    } catch (error: any) {
      console.error(
        `[TriggerTaskHandler] Failed to trigger task ${handler.task_id}: ${error.message}`
      );
      throw error;
    }
  }

  /**
   * Build trigger context to pass to triggered task
   *
   * @param parentTask - Parent task that triggered execution
   * @param parentExecution - Parent execution record
   * @returns Trigger context object
   */
  private buildTriggerContext(
    parentTask: Task,
    parentExecution: Execution
  ): Record<string, any> {
    return {
      // Parent task information
      parent_task_id: parentTask.id,
      parent_task_name: parentTask.name,
      parent_task_type: parentTask.type,

      // Parent execution information
      parent_execution_id: parentExecution.id,
      parent_status: parentExecution.status,
      parent_started_at: parentExecution.started_at,
      parent_completed_at: parentExecution.completed_at,
      parent_duration_ms: parentExecution.duration_ms,

      // Parent results (limited to avoid large payloads)
      parent_output: this.truncateOutput(parentExecution.output),
      parent_error: parentExecution.error,
      parent_exit_code: parentExecution.exit_code,

      // Metadata
      triggered_at: new Date().toISOString(),
      trigger_source: 'task_completion',
    };
  }

  /**
   * Truncate output to reasonable size
   * Prevents large outputs from being passed in context
   *
   * @param output - Output string (may be undefined)
   * @param maxLength - Maximum length (default: 1000 chars)
   * @returns Truncated output
   */
  private truncateOutput(
    output: string | undefined,
    maxLength: number = 1000
  ): string | undefined {
    if (!output) {
      return undefined;
    }

    if (output.length <= maxLength) {
      return output;
    }

    return output.substring(0, maxLength) + '... [truncated]';
  }
}
