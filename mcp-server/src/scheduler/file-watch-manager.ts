/**
 * File Watch Manager
 *
 * Watches files and directories for changes and triggers tasks
 *
 * % 0 COMPLETE - File Watch Manager (Day 3)
 */

import chokidar, { FSWatcher } from 'chokidar';
import { Task, FileWatchTrigger } from '../models/types.js';
import * as path from 'path';

interface WatcherState {
  task: Task;
  watcher: FSWatcher;
  lastTriggered: number;
}

export class FileWatchManager {
  private watchers: Map<string, WatcherState> = new Map();
  private scheduler: any; // Will be set via setScheduler()

  constructor() {
    // Empty constructor
  }

  /**
   * Set scheduler reference (to avoid circular dependency)
   */
  setScheduler(scheduler: any): void {
    this.scheduler = scheduler;
  }

  /**
   * Start watching a task's file trigger
   */
  async startWatching(task: Task): Promise<void> {
    if (task.trigger.type !== 'file_watch') {
      throw new Error(`Task ${task.name} does not have file_watch trigger`);
    }

    const trigger = task.trigger as FileWatchTrigger;

    // Stop existing watcher if present
    if (this.watchers.has(task.id)) {
      await this.stopWatching(task.id);
    }

    console.error(
      `[FileWatchManager] Starting file watch for task ${task.name}: ${trigger.path}`
    );

    // Create watcher
    const watcher = chokidar.watch(trigger.path, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
      // Support glob patterns
      ignored: /(^|[\/\\])\../, // ignore dotfiles
    });

    // Handle events
    watcher.on('all', (event, filePath) => {
      this.handleFileEvent(task, trigger, event, filePath);
    });

    watcher.on('error', (error) => {
      console.error(
        `[FileWatchManager] Watcher error for task ${task.name}:`,
        error
      );
    });

    // Store watcher state
    this.watchers.set(task.id, {
      task,
      watcher,
      lastTriggered: 0,
    });

    console.error(
      `[FileWatchManager] File watch started for task ${task.name}`
    );
  }

  /**
   * Stop watching a task
   */
  async stopWatching(taskId: string): Promise<void> {
    const state = this.watchers.get(taskId);
    if (!state) {
      return;
    }

    console.error(
      `[FileWatchManager] Stopping file watch for task ${state.task.name}`
    );

    await state.watcher.close();
    this.watchers.delete(taskId);
  }

  /**
   * Stop all watchers
   */
  async stopAll(): Promise<void> {
    console.error(
      `[FileWatchManager] Stopping all file watchers (${this.watchers.size})`
    );

    const promises = Array.from(this.watchers.keys()).map(taskId =>
      this.stopWatching(taskId)
    );

    await Promise.all(promises);
  }

  /**
   * Handle file system event
   */
  private handleFileEvent(
    task: Task,
    trigger: FileWatchTrigger,
    event: string,
    filePath: string
  ): void {
    // Check if event matches pattern (if specified)
    if (trigger.pattern && !this.matchesPattern(filePath, trigger.pattern)) {
      return;
    }

    console.error(
      `[FileWatchManager] File event: ${event} on ${filePath} for task ${task.name}`
    );

    // Apply debouncing
    const state = this.watchers.get(task.id);
    if (!state) {
      return;
    }

    const debounceMs = this.parseDuration(trigger.debounce || '0s');
    const now = Date.now();

    if (state.lastTriggered !== 0 && now - state.lastTriggered < debounceMs) {
      console.error(
        `[FileWatchManager] Debouncing task ${task.name}, last triggered ${now - state.lastTriggered}ms ago`
      );
      return;
    }

    // Update last triggered time
    state.lastTriggered = now;

    // Execute task
    this.executeTask(task, event, filePath);
  }

  /**
   * Execute task in response to file event
   */
  private async executeTask(
    task: Task,
    event: string,
    filePath: string
  ): Promise<void> {
    try {
      console.error(
        `[FileWatchManager] Triggering task ${task.name} due to ${event} on ${filePath}`
      );

      await this.scheduler.executeTask(task.id, 'file_watch', {
        event,
        file_path: filePath,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error(
        `[FileWatchManager] Failed to execute task ${task.name}:`,
        error.message
      );
    }
  }

  /**
   * Check if file matches pattern
   */
  private matchesPattern(filePath: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const fileName = path.basename(filePath);

    // Simple pattern matching (supports * wildcard)
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(fileName);
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

  /**
   * Get all active watchers
   */
  getActiveWatchers(): Array<{ taskId: string; taskName: string; path: string }> {
    const result = [];
    for (const [taskId, state] of this.watchers.entries()) {
      const trigger = state.task.trigger as FileWatchTrigger;
      result.push({
        taskId,
        taskName: state.task.name,
        path: trigger.path,
      });
    }
    return result;
  }

  /**
   * Restart watching for a task (e.g., after task update)
   */
  async restartWatching(task: Task): Promise<void> {
    await this.stopWatching(task.id);
    await this.startWatching(task);
  }
}

/**
 * % 100 COMPLETE - File Watch Manager (Day 3)
 */
