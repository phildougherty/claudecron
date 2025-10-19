/**
 * Hook Manager
 *
 * Manages Claude Code lifecycle event hooks
 *
 * % 0 COMPLETE - Hook Manager implementation (Day 3)
 */

import { Task, HookEvent, HookTrigger } from '../models/types.js';
import { Scheduler } from './scheduler.js';

export interface HookContext {
  event: HookEvent;
  timestamp: string;

  // SessionStart context
  source?: 'startup' | 'resume' | 'new';
  session_id?: string;

  // Tool-related context
  tool_name?: string;
  tool_input?: any;
  tool_result?: any;
  file_path?: string;

  // Subagent context
  subagent_name?: string;
  subagent_result?: any;

  // Stop context
  reason?: string;

  // Enriched context
  git_branch?: string;
  git_dirty?: boolean;

  // Raw context
  raw?: any;
}

export class HookManager {
  private scheduler: Scheduler;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(scheduler: Scheduler) {
    this.scheduler = scheduler;
  }

  async handleHookEvent(
    event: HookEvent,
    context: HookContext
  ): Promise<void> {
    console.error(`[HookManager] Received event: ${event}`);

    // Enrich context
    const enrichedContext = await this.enrichContext(event, context);

    // Find matching tasks
    const tasks = await this.findMatchingTasks(event, enrichedContext);

    console.error(`[HookManager] Found ${tasks.length} matching tasks`);

    // Execute matching tasks
    for (const task of tasks) {
      await this.executeHookTask(task, event, enrichedContext);
    }
  }

  private async findMatchingTasks(
    event: HookEvent,
    context: HookContext
  ): Promise<Task[]> {
    // Load tasks with hook triggers
    const allTasks = await this.scheduler.storage.loadTasks({
      trigger_type: 'hook'
    });

    // Filter by event type and conditions
    return allTasks.filter(task => {
      const trigger = task.trigger as HookTrigger;

      // Must match event type
      if (trigger.event !== event) return false;

      // Check matcher (regex for tool names)
      if (trigger.matcher && context.tool_name) {
        const regex = new RegExp(trigger.matcher);
        if (!regex.test(context.tool_name)) return false;
      }

      // Check conditions
      if (trigger.conditions) {
        return this.checkConditions(trigger.conditions, context);
      }

      return true;
    });
  }

  private checkConditions(
    conditions: HookTrigger['conditions'],
    context: HookContext
  ): boolean {
    if (!conditions) return true;

    // Check source (SessionStart)
    if (conditions.source && context.source) {
      if (!conditions.source.includes(context.source)) {
        return false;
      }
    }

    // Check file pattern
    if (conditions.file_pattern && context.file_path) {
      const regex = new RegExp(conditions.file_pattern);
      if (!regex.test(context.file_path)) {
        return false;
      }
    }

    // Check tool names
    if (conditions.tool_names && context.tool_name) {
      if (!conditions.tool_names.includes(context.tool_name)) {
        return false;
      }
    }

    // Check subagent names
    if (conditions.subagent_names && context.subagent_name) {
      if (!conditions.subagent_names.includes(context.subagent_name)) {
        return false;
      }
    }

    return true;
  }

  private async executeHookTask(
    task: Task,
    event: HookEvent,
    context: HookContext
  ): Promise<void> {
    const trigger = task.trigger as HookTrigger;

    // Apply debouncing if configured
    if (trigger.debounce) {
      const debounceKey = `${task.id}-${event}`;
      const debounceMs = this.parseDuration(trigger.debounce);

      // Clear existing timer
      const existingTimer = this.debounceTimers.get(debounceKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      // Set new timer
      const timer = setTimeout(async () => {
        await this.scheduler.executeTask(task.id, 'hook', context);
        this.debounceTimers.delete(debounceKey);
      }, debounceMs);

      this.debounceTimers.set(debounceKey, timer);

      console.error(
        `[HookManager] Debouncing task ${task.name} for ${debounceMs}ms`
      );
    } else {
      // Execute immediately
      await this.scheduler.executeTask(task.id, 'hook', context);
    }
  }

  private async enrichContext(
    event: HookEvent,
    context: HookContext
  ): Promise<HookContext> {
    // Add enrichment based on event type
    const enriched = { ...context };

    // Add git information for file-related events
    if (context.file_path && (
      event === 'PostToolUse' || event === 'PreToolUse'
    )) {
      const gitBranch = await this.getCurrentGitBranch();
      if (gitBranch) {
        enriched.git_branch = gitBranch;
      }
      enriched.git_dirty = await this.isGitDirty();
    }

    // Add session information
    if (!enriched.session_id) {
      enriched.session_id = process.env.CLAUDE_SESSION_ID || 'unknown';
    }

    // Add timestamp if missing
    if (!enriched.timestamp) {
      enriched.timestamp = new Date().toISOString();
    }

    return enriched;
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(s|m|h)$/);
    if (!match || !match[1] || !match[2]) return 0;

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      default: return 0;
    }
  }

  private async getCurrentGitBranch(): Promise<string | undefined> {
    try {
      const { execSync } = await import('child_process');
      const branch = execSync('git rev-parse --abbrev-ref HEAD', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return branch;
    } catch {
      return undefined;
    }
  }

  private async isGitDirty(): Promise<boolean> {
    try {
      const { execSync } = await import('child_process');
      const status = execSync('git status --porcelain', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore']
      }).trim();
      return status.length > 0;
    } catch {
      return false;
    }
  }
}

/**
 * % 100 COMPLETE - Hook Manager implementation (Day 3)
 */
