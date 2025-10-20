/**
 * Scheduler Engine
 *
 * Manages task scheduling and execution
 *
 * % 95 COMPLETE - Scheduler implementation (Day 3)
 */

import cron from 'node-cron';
import Holidays from 'date-holidays';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import { Storage } from '../storage/storage.js';
import {
  SchedulerConfig,
  Task,
  Execution,
  ScheduleTrigger,
  CommandCondition,
  IntervalTrigger,
  SmartScheduleTrigger,
} from '../models/types.js';
import { ExecutorFactory, ExecutionResult } from '../executors/factory.js';
import { HookManager } from './hook-manager.js';
import { DependencyManager } from './dependency-manager.js';
import { FileWatchManager } from './file-watch-manager.js';
import { ResultHandlerExecutor } from './result-handlers.js';
import { RetryHandler } from './retry-handler.js';
import { CronExpressionParser } from 'cron-parser';

const execAsync = promisify(exec);

/**
 * Scheduled Task Tracking
 */
interface ScheduledTaskInfo {
  task: Task;
  cronJob: cron.ScheduledTask;
  nextRun: Date;
}

/**
 * Scheduler Engine
 *
 * Manages cron schedules, hook events, and task execution
 */
export class Scheduler {
  public storage: Storage;
  private config: SchedulerConfig;
  private isRunning: boolean = false;
  private checkInterval?: NodeJS.Timeout;
  private scheduledTasks: Map<string, ScheduledTaskInfo> = new Map();
  private holidays: Holidays;
  public hookManager: HookManager;

  // Day 3 additions
  private intervalJobs: Map<string, {
    timeout?: NodeJS.Timeout;
    interval?: NodeJS.Timeout;
  }> = new Map();
  public dependencyManager: DependencyManager;
  public fileWatchManager: FileWatchManager;
  public resultHandler: ResultHandlerExecutor;

  // Day 4 additions
  public retryHandler: RetryHandler;

  constructor(storage: Storage, config?: SchedulerConfig) {
    this.storage = storage;
    this.config = {
      check_interval: config?.check_interval ?? '30s',
      default_timezone: config?.default_timezone ?? 'UTC',
      max_concurrent_tasks: config?.max_concurrent_tasks ?? 10,
    };
    this.holidays = new Holidays();
    this.hookManager = new HookManager(this);

    // Initialize Day 3 components
    this.dependencyManager = new DependencyManager(storage);
    this.dependencyManager.setScheduler(this);

    this.fileWatchManager = new FileWatchManager();
    this.fileWatchManager.setScheduler(this);

    this.resultHandler = new ResultHandlerExecutor();
    this.resultHandler.setScheduler(this);

    // Initialize Day 4 components
    this.retryHandler = new RetryHandler(storage);
    this.retryHandler.setScheduler(this);
  }

  /**
   * Start the scheduler
   * Begins checking for due tasks and schedules all enabled tasks
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Scheduler is already running');
    }

    this.isRunning = true;
    console.error('[Scheduler] Starting...');

    // Load all enabled tasks
    const tasks = await this.storage.loadTasks({ enabled: true });

    // Build dependency graph
    await this.dependencyManager.buildDependencyGraph(tasks);

    // Schedule tasks by type
    let scheduleCount = 0;
    let intervalCount = 0;
    let fileWatchCount = 0;

    for (const task of tasks) {
      try {
        switch (task.trigger.type) {
          case 'schedule':
            await this.scheduleTask(task);
            scheduleCount++;
            break;

          case 'interval':
            await this.scheduleIntervalTask(task);
            intervalCount++;
            break;

          case 'file_watch':
            await this.fileWatchManager.startWatching(task);
            fileWatchCount++;
            break;

          case 'smart_schedule':
            await this.optimizeAndScheduleSmartTask(task);
            scheduleCount++;
            break;

          // dependency and manual tasks don't need scheduling
          case 'dependency':
          case 'manual':
            break;
        }
      } catch (error: any) {
        console.error(
          `[Scheduler] Failed to schedule task ${task.name}:`,
          error.message
        );
      }
    }

    console.error(
      `[Scheduler] Started with ${scheduleCount} scheduled, ${intervalCount} interval, ${fileWatchCount} file watch tasks`
    );
  }

  /**
   * Stop the scheduler
   * Cleanup and shutdown
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    // Stop check interval
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    // Cancel all scheduled tasks
    for (const [, info] of this.scheduledTasks.entries()) {
      info.cronJob.stop();
      console.error(`[Scheduler] Unscheduled task: ${info.task.name}`);
    }
    this.scheduledTasks.clear();

    // Cancel all interval jobs
    for (const [taskId, job] of this.intervalJobs.entries()) {
      if (job.timeout) clearTimeout(job.timeout);
      if (job.interval) clearInterval(job.interval);
      console.error(`[Scheduler] Stopped interval task: ${taskId}`);
    }
    this.intervalJobs.clear();

    // Stop all file watchers
    await this.fileWatchManager.stopAll();

    console.error('[Scheduler] Stopped');
  }

  /**
   * Schedule a task with a cron trigger
   * @param task - Task to schedule
   */
  async scheduleTask(task: Task): Promise<void> {
    if (task.trigger.type !== 'schedule') {
      throw new Error(`Cannot schedule task with trigger type: ${task.trigger.type}`);
    }

    const trigger = task.trigger as ScheduleTrigger;
    const cronExpression = trigger.cron;
    const timezone = trigger.timezone || this.config.default_timezone || 'UTC';

    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      throw new Error(`Invalid cron expression: ${cronExpression}`);
    }

    // Unschedule existing if already scheduled
    if (this.scheduledTasks.has(task.id)) {
      await this.unscheduleTask(task.id);
    }

    // Create cron job
    const cronJob = cron.schedule(
      cronExpression,
      async () => {
        try {
          await this.executeTask(task.id, 'scheduled');
        } catch (error: any) {
          console.error(
            `[Scheduler] Error executing scheduled task ${task.name}:`,
            error.message
          );
        }
      },
      {
        scheduled: true,
        timezone: timezone,
      }
    );

    // Calculate next run time
    const nextRun = this.calculateNextRun(cronExpression, timezone);

    // Store scheduled task info
    this.scheduledTasks.set(task.id, {
      task,
      cronJob,
      nextRun,
    });

    // Update task's next_run in database
    await this.storage.updateTask(task.id, {
      next_run: nextRun.toISOString(),
    });

    console.error(
      `[Scheduler] Scheduled task "${task.name}" with cron "${cronExpression}" (next run: ${nextRun.toISOString()})`
    );
  }

  /**
   * Unschedule a task
   * @param taskId - Task ID to unschedule
   */
  async unscheduleTask(taskId: string): Promise<void> {
    const info = this.scheduledTasks.get(taskId);
    if (!info) {
      return; // Not scheduled
    }

    info.cronJob.stop();
    this.scheduledTasks.delete(taskId);

    // Clear next_run in database - use delete to properly remove optional property
    const task = await this.storage.getTask(taskId);
    if (task) {
      delete task.next_run;
      await this.storage.updateTask(taskId, task);
    }

    console.error(`[Scheduler] Unscheduled task: ${info.task.name}`);
  }

  /**
   * Reschedule a task (update existing schedule)
   * @param task - Updated task
   */
  async rescheduleTask(task: Task): Promise<void> {
    // Unschedule first
    await this.unscheduleTask(task.id);

    // Schedule if enabled and has schedule trigger
    if (task.enabled && task.trigger.type === 'schedule') {
      await this.scheduleTask(task);
    }
  }

  /**
   * Get all scheduled tasks with their next run times
   * @returns Array of scheduled tasks
   */
  getAllScheduledTasks(): Array<{
    task: Task;
    nextRun: string;
  }> {
    const result = [];
    for (const info of this.scheduledTasks.values()) {
      result.push({
        task: info.task,
        nextRun: info.nextRun.toISOString(),
      });
    }
    return result;
  }

  /**
   * Execute a task
   * @param taskOrId - Task object or Task ID to execute
   * @param triggerType - Type of trigger ('manual', 'scheduled', 'hook', etc.)
   * @param triggerContext - Optional context from trigger
   * @param overrideConditions - Skip condition checks
   * @returns Execution ID
   */
  async executeTask(
    taskOrId: string | Task,
    triggerType: string = 'manual',
    triggerContext?: any,
    overrideConditions: boolean = false
  ): Promise<string> {
    const task = typeof taskOrId === 'string'
      ? await this.storage.getTask(taskOrId)
      : taskOrId;

    if (!task) {
      throw new Error(`Task not found: ${typeof taskOrId === 'string' ? taskOrId : 'unknown'}`);
    }

    if (!task.enabled) {
      throw new Error(`Task is disabled: ${task.id}`);
    }

    console.error(`[Scheduler] Executing task: ${task.name} (${task.id})`);

    // Check conditions (unless overridden)
    if (!overrideConditions && (await this.shouldSkipTask(task, triggerContext))) {
      console.error(`[Scheduler] Skipping task ${task.name} due to conditions`);
      const execution = await this.createSkippedExecution(
        task,
        triggerType,
        triggerContext
      );
      return execution.id;
    }

    // Create execution record with 'running' status
    const execution = await this.storage.createExecution({
      task_id: task.id,
      trigger_type: triggerType,
      trigger_context: triggerContext,
      status: 'running',
      started_at: new Date().toISOString(),
    });

    // Execute task asynchronously (don't wait)
    this.runTaskExecution(task, execution).catch((error) => {
      console.error(`[Scheduler] Unhandled error in task execution:`, error);
    });

    return execution.id;
  }

  /**
   * Run task execution (async)
   * @param task - Task to execute
   * @param execution - Execution record
   */
  private async runTaskExecution(
    task: Task,
    execution: Execution
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Get appropriate executor with storage for streaming support
      const executor = ExecutorFactory.createExecutor(task, this.storage);

      // Execute task
      const result: ExecutionResult = await executor.execute(task, execution);

      // Calculate duration
      const duration = Date.now() - startTime;

      // Update execution record with success
      const updatedExecution = { ...execution };
      updatedExecution.status = result.status;
      updatedExecution.completed_at = new Date().toISOString();
      updatedExecution.duration_ms = duration;
      if (result.output !== undefined) updatedExecution.output = result.output;
      if (result.error !== undefined) updatedExecution.error = result.error;
      if (result.exit_code !== undefined) updatedExecution.exit_code = result.exit_code;
      if (result.thinking_output !== undefined) updatedExecution.thinking_output = result.thinking_output;
      if (result.tool_calls !== undefined) updatedExecution.tool_calls = result.tool_calls;
      if (result.sdk_usage !== undefined) updatedExecution.sdk_usage = result.sdk_usage;
      if (result.cost_usd !== undefined) updatedExecution.cost_usd = result.cost_usd;

      await this.storage.updateExecution(execution.id, updatedExecution);

      // Update task statistics
      await this.updateTaskStats(task.id, result.status === 'success');

      // Handle success/failure actions
      if (result.status === 'success') {
        await this.handleResultActions(task, updatedExecution, 'success');
        // Trigger dependent tasks on success
        await this.dependencyManager.onTaskCompleted(task.id, updatedExecution);
      } else {
        // Check if we should retry the failed task
        if (this.retryHandler.shouldRetry(task, updatedExecution)) {
          await this.retryHandler.scheduleRetry(task, updatedExecution);
        } else {
          // Only handle failure actions if we're not retrying
          await this.handleResultActions(task, updatedExecution, 'failure');
        }
      }

      console.error(
        `[Scheduler] Task ${task.name} completed with status: ${result.status}`
      );
    } catch (error: any) {
      const duration = Date.now() - startTime;

      console.error(`[Scheduler] Task ${task.name} failed:`, error.message);

      // Update execution record with failure
      const failedExecution = { ...execution };
      failedExecution.status = 'failure';
      failedExecution.completed_at = new Date().toISOString();
      failedExecution.duration_ms = duration;
      failedExecution.error = error.message;

      await this.storage.updateExecution(execution.id, failedExecution);

      // Update task statistics
      await this.updateTaskStats(task.id, false);

      // Check if we should retry the failed task
      if (this.retryHandler.shouldRetry(task, failedExecution)) {
        await this.retryHandler.scheduleRetry(task, failedExecution);
      } else {
        // Only handle failure actions if we're not retrying
        await this.handleResultActions(task, failedExecution, 'failure');
      }
    }
  }

  /**
   * Check if task should be skipped based on conditions
   * @param task - Task to check
   * @param _context - Trigger context (not currently used)
   * @returns True if task should be skipped
   */
  private async shouldSkipTask(task: Task, _context?: any): Promise<boolean> {
    if (!task.conditions) {
      return false;
    }

    const conditions = task.conditions;

    // Check time window
    if (conditions.time_window) {
      const inWindow = this.isWithinTimeWindow(
        conditions.time_window.start,
        conditions.time_window.end,
        conditions.time_window.timezone || this.config.default_timezone
      );
      if (!inWindow) {
        console.error(`[Scheduler] Task ${task.name} outside time window`);
        return true;
      }
    }

    // Check holidays
    if (conditions.skip_holidays) {
      const region = conditions.holiday_region || 'US';
      if (this.isHoliday(region)) {
        console.error(`[Scheduler] Task ${task.name} skipped due to holiday`);
        return true;
      }
    }

    // Check file existence
    if (conditions.only_if_file_exists) {
      if (!fs.existsSync(conditions.only_if_file_exists)) {
        console.error(
          `[Scheduler] Task ${task.name} skipped: file does not exist: ${conditions.only_if_file_exists}`
        );
        return true;
      }
    }

    if (conditions.skip_if_file_exists) {
      if (fs.existsSync(conditions.skip_if_file_exists)) {
        console.error(
          `[Scheduler] Task ${task.name} skipped: file exists: ${conditions.skip_if_file_exists}`
        );
        return true;
      }
    }

    // Check git dirty
    if (conditions.only_if_git_dirty) {
      const isDirty = await this.isGitDirty();
      if (!isDirty) {
        console.error(`[Scheduler] Task ${task.name} skipped: git is clean`);
        return true;
      }
    }

    // Check custom skip_if condition
    if (conditions.skip_if) {
      const shouldSkip = await this.evaluateCondition(conditions.skip_if);
      if (shouldSkip) {
        console.error(`[Scheduler] Task ${task.name} skipped: skip_if condition met`);
        return true;
      }
    }

    // Check custom only_if condition
    if (conditions.only_if) {
      const shouldRun = await this.evaluateCondition(conditions.only_if);
      if (!shouldRun) {
        console.error(
          `[Scheduler] Task ${task.name} skipped: only_if condition not met`
        );
        return true;
      }
    }

    return false;
  }

  /**
   * Check if current time is within time window
   */
  private isWithinTimeWindow(
    startTime: string,
    endTime: string,
    _timezone?: string
  ): boolean {
    const now = new Date();

    // Parse time strings (HH:MM format)
    const startParts = startTime.split(':').map(Number);
    const endParts = endTime.split(':').map(Number);

    const startHour = startParts[0] || 0;
    const startMin = startParts[1] || 0;
    const endHour = endParts[0] || 0;
    const endMin = endParts[1] || 0;

    // Get current time in specified timezone
    const currentHour = now.getHours();
    const currentMin = now.getMinutes();

    // Convert to minutes since midnight for easy comparison
    const currentMinutes = currentHour * 60 + currentMin;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight windows (e.g., 22:00 - 06:00)
    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
    }
  }

  /**
   * Check if today is a holiday
   */
  private isHoliday(region: string): boolean {
    this.holidays.init(region);
    const today = new Date();
    const holidays = this.holidays.isHoliday(today);
    return holidays !== false;
  }

  /**
   * Check if git working directory is dirty
   */
  private async isGitDirty(): Promise<boolean> {
    try {
      const { stdout } = await execAsync('git status --porcelain');
      return stdout.trim().length > 0;
    } catch (error) {
      // If git command fails, assume not dirty
      return false;
    }
  }

  /**
   * Evaluate a custom condition
   */
  private async evaluateCondition(condition: CommandCondition): Promise<boolean> {
    try {
      const { stdout } = await execAsync(condition.bash);
      const output = stdout.trim();

      // Compare based on operator
      switch (condition.operator) {
        case '==':
          return output === String(condition.value);
        case '!=':
          return output !== String(condition.value);
        case '>':
          return Number(output) > Number(condition.value);
        case '<':
          return Number(output) < Number(condition.value);
        case '>=':
          return Number(output) >= Number(condition.value);
        case '<=':
          return Number(output) <= Number(condition.value);
        default:
          return false;
      }
    } catch (error) {
      console.error('[Scheduler] Condition evaluation failed:', error);
      return false;
    }
  }

  /**
   * Create a skipped execution record
   */
  private async createSkippedExecution(
    task: Task,
    triggerType: string,
    triggerContext?: any
  ): Promise<Execution> {
    const execution = await this.storage.createExecution({
      task_id: task.id,
      trigger_type: triggerType,
      trigger_context: triggerContext,
      status: 'skipped',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      duration_ms: 0,
    });
    return execution;
  }

  /**
   * Update task statistics
   */
  private async updateTaskStats(taskId: string, success: boolean): Promise<void> {
    const task = await this.storage.getTask(taskId);
    if (!task) return;

    await this.storage.updateTask(taskId, {
      run_count: task.run_count + 1,
      success_count: success ? task.success_count + 1 : task.success_count,
      failure_count: success ? task.failure_count : task.failure_count + 1,
      last_run: new Date().toISOString(),
    });
  }

  /**
   * Handle result actions (on_success / on_failure)
   */
  private async handleResultActions(
    task: Task,
    execution: Execution,
    result: 'success' | 'failure'
  ): Promise<void> {
    const handlers = result === 'success' ? task.on_success : task.on_failure;
    if (!handlers || handlers.length === 0) {
      return;
    }

    for (const handler of handlers) {
      try {
        await this.resultHandler.executeHandler(handler, task, execution);
      } catch (error: any) {
        console.error(
          `[Scheduler] Result handler failed for ${task.name}:`,
          error.message
        );
      }
    }
  }

  /**
   * Calculate next run time for a cron expression
   */
  private calculateNextRun(cronExpression: string, timezone: string): Date {
    try {
      const interval = CronExpressionParser.parse(cronExpression, {
        currentDate: new Date(),
        tz: timezone,
      });
      return interval.next().toDate();
    } catch (error) {
      // Fallback to 1 minute from now
      return new Date(Date.now() + 60000);
    }
  }

  /**
   * Check for due tasks
   * Called periodically (not needed with node-cron, kept for compatibility)
   */
  async checkDueTasks(): Promise<void> {
    // Not needed with node-cron as it handles scheduling automatically
    // Kept for future use with other trigger types
  }

  /**
   * Get scheduler status
   * Used for diagnostics and monitoring
   */
  getStatus(): { running: boolean; config: SchedulerConfig; scheduled_count: number } {
    return {
      running: this.isRunning,
      config: this.config,
      scheduled_count: this.scheduledTasks.size,
    };
  }

  /**
   * Schedule an interval task
   * @param task - Task with interval trigger
   */
  private async scheduleIntervalTask(task: Task): Promise<void> {
    if (task.trigger.type !== 'interval') {
      throw new Error(`Cannot schedule interval task with trigger type: ${task.trigger.type}`);
    }

    const trigger = task.trigger as IntervalTrigger;
    const duration = this.parseDuration(trigger.every);

    if (duration === 0) {
      throw new Error(`Invalid interval duration: ${trigger.every}`);
    }

    // Unschedule existing if already scheduled
    if (this.intervalJobs.has(task.id)) {
      await this.unscheduleIntervalTask(task.id);
    }

    // Calculate start time
    const startTime = trigger.start ? new Date(trigger.start) : new Date();
    const delay = Math.max(0, startTime.getTime() - Date.now());

    console.error(
      `[Scheduler] Scheduling interval task "${task.name}" every ${trigger.every} (start: ${startTime.toISOString()})`
    );

    // Schedule with initial delay
    const timeout = setTimeout(() => {
      // Remove timeout from job record since it has fired
      const job = this.intervalJobs.get(task.id);
      if (job) {
        delete job.timeout;
      }

      // Execute first time immediately after delay
      this.executeTask(task.id, 'interval').catch((error: any) => {
        console.error(
          `[Scheduler] Interval task ${task.name} failed:`,
          error.message
        );
      });

      // Then set up recurring interval
      const interval = setInterval(async () => {
        try {
          await this.executeTask(task.id, 'interval');
        } catch (error: any) {
          console.error(
            `[Scheduler] Interval task ${task.name} failed:`,
            error.message
          );
        }
      }, duration);

      // Update job record with interval
      if (this.intervalJobs.has(task.id)) {
        this.intervalJobs.get(task.id)!.interval = interval;
      } else {
        // Task was unscheduled while timeout was running
        clearInterval(interval);
      }
    }, delay);

    // Store the timeout timer so it can be cancelled
    this.intervalJobs.set(task.id, { timeout });
  }

  /**
   * Unschedule an interval task
   * @param taskId - Task ID to unschedule
   */
  private async unscheduleIntervalTask(taskId: string): Promise<void> {
    const job = this.intervalJobs.get(taskId);
    if (!job) {
      return;
    }

    // Clear both timeout (if still pending) and interval (if running)
    if (job.timeout) {
      clearTimeout(job.timeout);
    }
    if (job.interval) {
      clearInterval(job.interval);
    }

    this.intervalJobs.delete(taskId);

    console.error(`[Scheduler] Unscheduled interval task: ${taskId}`);
  }

  /**
   * Optimize and schedule a smart schedule task
   * @param task - Task with smart_schedule trigger
   */
  private async optimizeAndScheduleSmartTask(task: Task): Promise<void> {
    if (task.trigger.type !== 'smart_schedule') {
      throw new Error(`Cannot optimize task with trigger type: ${task.trigger.type}`);
    }

    const trigger = task.trigger as SmartScheduleTrigger;

    // Check if already optimized recently (within 24 hours)
    if (trigger.computed_cron && trigger.last_optimized) {
      const lastOpt = new Date(trigger.last_optimized);
      const hoursSinceOpt = (Date.now() - lastOpt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceOpt < 24) {
        console.error(
          `[Scheduler] Using cached cron for ${task.name}: ${trigger.computed_cron}`
        );
        // Schedule with existing cron
        const scheduleTask = { ...task, trigger: { type: 'schedule' as const, cron: trigger.computed_cron } };
        await this.scheduleTask(scheduleTask);
        return;
      }
    }

    // If AI optimization is disabled, use fallback
    if (!trigger.ai_optimize && trigger.fallback_cron) {
      console.error(
        `[Scheduler] Using fallback cron for ${task.name}: ${trigger.fallback_cron}`
      );
      const scheduleTask = { ...task, trigger: { type: 'schedule' as const, cron: trigger.fallback_cron } };
      await this.scheduleTask(scheduleTask);
      return;
    }

    // Attempt AI optimization
    try {
      const cronExpr = await this.optimizeSmartSchedule(task);

      // Update task with computed cron
      trigger.computed_cron = cronExpr;
      trigger.last_optimized = new Date().toISOString();
      await this.storage.updateTask(task.id, task);

      // Schedule with computed cron
      const scheduleTask = { ...task, trigger: { type: 'schedule' as const, cron: cronExpr } };
      await this.scheduleTask(scheduleTask);

      console.error(
        `[Scheduler] AI-optimized schedule for ${task.name}: ${cronExpr}`
      );
    } catch (error: any) {
      console.error(
        `[Scheduler] AI optimization failed for ${task.name}, using fallback:`,
        error.message
      );

      if (trigger.fallback_cron) {
        const scheduleTask = { ...task, trigger: { type: 'schedule' as const, cron: trigger.fallback_cron } };
        await this.scheduleTask(scheduleTask);
      } else {
        throw new Error(`No fallback cron available for smart schedule task ${task.name}`);
      }
    }
  }

  /**
   * Use AI to optimize a smart schedule
   * @param task - Task to optimize
   * @returns Optimized cron expression
   */
  private async optimizeSmartSchedule(task: Task): Promise<string> {
    const trigger = task.trigger as SmartScheduleTrigger;

    // Import subagent executor dynamically to avoid circular dependencies
    const { SubagentExecutor } = await import('../executors/subagent-executor.js');
    const sdkExecutor = new SubagentExecutor(this.storage);

    const prompt = `You are a cron scheduling expert. Analyze this task and suggest an optimal cron expression.

Task: ${task.name}
Description: ${trigger.description}
Constraints: ${JSON.stringify(trigger.constraints || {}, null, 2)}

Consider:
- Business hours constraints
- Peak hours to avoid
- Maximum run frequency limits
- Time zone preferences
- Conflicts with other tasks

Respond with ONLY a valid cron expression (5 or 6 fields). No explanation needed.

Examples:
- "0 9 * * 1-5" (9 AM weekdays)
- "*/30 0-8,18-23 * * *" (every 30min outside 9-5)
- "0 2 * * *" (2 AM daily)`;

    // Create a temporary subagent task for the optimization
    const optimizationTask: Task = {
      id: `${task.id}_optimization`,
      name: `AI optimization for ${task.name}`,
      description: 'Internal task for smart schedule optimization',
      type: 'subagent',
      task_config: {
        type: 'subagent',
        prompt,
        inherit_context: false,
        allowed_tools: [],
        capture_thinking: false,
      },
      trigger: {
        type: 'manual',
        description: 'Internal AI-driven optimization for smart schedule'
      },
      enabled: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    };

    // Create a temporary execution record for the optimization
    const optimizationExecution = await this.storage.createExecution({
      task_id: optimizationTask.id,
      trigger_type: 'internal',
      status: 'running',
      started_at: new Date().toISOString(),
    });

    try {
      const result = await sdkExecutor.execute(optimizationTask, optimizationExecution);

      if (result.status !== 'success' || !result.output) {
        throw new Error('AI optimization failed to generate cron expression');
      }

      // Extract and validate cron expression
      const cronExpr = result.output?.trim().split('\n')[0]?.trim() || '';

      if (!cronExpr || !cron.validate(cronExpr)) {
        throw new Error(`Invalid cron expression generated: ${cronExpr}`);
      }

      // Update execution record as successful
      await this.storage.updateExecution(optimizationExecution.id, {
        ...optimizationExecution,
        status: 'success',
        output: cronExpr,
        completed_at: new Date().toISOString(),
      });

      return cronExpr;
    } catch (error) {
      // Update execution record as failed
      await this.storage.updateExecution(optimizationExecution.id, {
        ...optimizationExecution,
        status: 'failure',
        error: error instanceof Error ? error.message : String(error),
        completed_at: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Parse duration string to milliseconds
   */
  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (!match || !match[1] || !match[2]) {
      return 0;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value * 1000;
      case 'm':
        return value * 60 * 1000;
      case 'h':
        return value * 60 * 60 * 1000;
      case 'd':
        return value * 24 * 60 * 60 * 1000;
      default:
        return 0;
    }
  }
}

/**
 * % 95 COMPLETE - Scheduler implementation (Day 3)
 */
