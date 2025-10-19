/**
 * Dependency Manager
 *
 * Manages task dependencies and triggers dependent tasks
 *
 * % 0 COMPLETE - Dependency Manager (Day 3)
 */

import { Task, Execution, DependencyTrigger } from '../models/types.js';
import { Storage } from '../storage/storage.js';

interface DependencyState {
  taskId: string;
  completedDependencies: Set<string>;
  lastTriggered?: number;
}

export class DependencyManager {
  private storage: Storage;
  private dependencyGraph: Map<string, Set<string>>; // taskId -> dependentTaskIds
  private dependencyState: Map<string, DependencyState>; // taskId -> state
  private scheduler: any; // Will be set via setScheduler()

  constructor(storage: Storage) {
    this.storage = storage;
    this.dependencyGraph = new Map();
    this.dependencyState = new Map();
  }

  /**
   * Set scheduler reference (to avoid circular dependency)
   */
  setScheduler(scheduler: any): void {
    this.scheduler = scheduler;
  }

  /**
   * Build dependency graph from all tasks
   */
  async buildDependencyGraph(tasks: Task[]): Promise<void> {
    this.dependencyGraph.clear();
    this.dependencyState.clear();

    // Build reverse dependency graph (parent -> dependents)
    for (const task of tasks) {
      if (task.trigger.type === 'dependency') {
        const trigger = task.trigger as DependencyTrigger;

        // Validate dependencies exist
        for (const depId of trigger.depends_on) {
          const depTask = tasks.find(t => t.id === depId);
          if (!depTask) {
            console.error(
              `[DependencyManager] Warning: Task ${task.name} depends on non-existent task ${depId}`
            );
            continue;
          }

          // Add to dependency graph
          if (!this.dependencyGraph.has(depId)) {
            this.dependencyGraph.set(depId, new Set());
          }
          this.dependencyGraph.get(depId)!.add(task.id);
        }

        // Initialize state
        this.dependencyState.set(task.id, {
          taskId: task.id,
          completedDependencies: new Set(),
        });
      }
    }

    // Validate no circular dependencies
    for (const task of tasks) {
      if (task.trigger.type === 'dependency') {
        if (this.hasCircularDependency(task.id, new Set())) {
          throw new Error(
            `Circular dependency detected for task ${task.name} (${task.id})`
          );
        }
      }
    }

    console.error(
      `[DependencyManager] Built dependency graph with ${this.dependencyGraph.size} parent tasks`
    );
  }

  /**
   * Check for circular dependencies using DFS
   */
  private hasCircularDependency(taskId: string, visited: Set<string>): boolean {
    if (visited.has(taskId)) {
      return true;
    }

    visited.add(taskId);

    // Get dependents of this task
    const dependents = this.dependencyGraph.get(taskId);
    if (dependents) {
      for (const depId of dependents) {
        if (this.hasCircularDependency(depId, new Set(visited))) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Handle task completion - trigger dependent tasks
   */
  async onTaskCompleted(taskId: string, execution: Execution): Promise<void> {
    // Only trigger on successful completion
    if (execution.status !== 'success') {
      console.error(
        `[DependencyManager] Task ${taskId} did not complete successfully, not triggering dependents`
      );
      return;
    }

    // Get tasks that depend on this one
    const dependents = this.dependencyGraph.get(taskId);
    if (!dependents || dependents.size === 0) {
      return;
    }

    console.error(
      `[DependencyManager] Task ${taskId} completed, checking ${dependents.size} dependents`
    );

    // Check each dependent task
    for (const dependentId of dependents) {
      const task = await this.storage.getTask(dependentId);
      if (!task || !task.enabled) {
        continue;
      }

      const trigger = task.trigger as DependencyTrigger;
      const state = this.dependencyState.get(dependentId);
      if (!state) {
        continue;
      }

      // Mark this dependency as completed
      state.completedDependencies.add(taskId);

      // Check if requirements are met
      const shouldTrigger = trigger.require_all ?? true
        ? this.allDependenciesMet(trigger.depends_on, state.completedDependencies)
        : this.anyDependencyMet(trigger.depends_on, state.completedDependencies);

      if (shouldTrigger) {
        // Apply debouncing if configured
        const debounceMs = this.parseDuration(trigger.debounce || '0s');
        const now = Date.now();

        if (state.lastTriggered !== undefined && now - state.lastTriggered < debounceMs) {
          console.error(
            `[DependencyManager] Debouncing task ${task.name}, last triggered ${now - state.lastTriggered}ms ago`
          );
          continue;
        }

        // Trigger the dependent task
        console.error(
          `[DependencyManager] Triggering dependent task ${task.name} (${dependentId})`
        );

        try {
          await this.scheduler.executeTask(dependentId, 'dependency', {
            triggered_by: taskId,
            execution_id: execution.id,
          });

          // Update state
          state.lastTriggered = now;
          state.completedDependencies.clear();
        } catch (error: any) {
          console.error(
            `[DependencyManager] Failed to trigger dependent task ${task.name}:`,
            error.message
          );
        }
      }
    }
  }

  /**
   * Check if all dependencies are met
   */
  private allDependenciesMet(
    dependencies: string[],
    completed: Set<string>
  ): boolean {
    return dependencies.every(dep => completed.has(dep));
  }

  /**
   * Check if any dependency is met
   */
  private anyDependencyMet(
    dependencies: string[],
    completed: Set<string>
  ): boolean {
    return dependencies.some(dep => completed.has(dep));
  }

  /**
   * Get list of tasks that depend on a given task
   */
  getDependents(taskId: string): string[] {
    const dependents = this.dependencyGraph.get(taskId);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Validate a task's dependencies
   */
  async validateDependencies(task: Task): Promise<boolean> {
    if (task.trigger.type !== 'dependency') {
      return true;
    }

    const trigger = task.trigger as DependencyTrigger;

    // Check all dependencies exist
    for (const depId of trigger.depends_on) {
      const depTask = await this.storage.getTask(depId);
      if (!depTask) {
        console.error(
          `[DependencyManager] Task ${task.name} depends on non-existent task ${depId}`
        );
        return false;
      }
    }

    // Check for circular dependencies
    const allTasks = await this.storage.loadTasks({});
    await this.buildDependencyGraph(allTasks);

    if (this.hasCircularDependency(task.id, new Set())) {
      console.error(
        `[DependencyManager] Circular dependency detected for task ${task.name}`
      );
      return false;
    }

    return true;
  }

  /**
   * Get dependency graph for visualization
   */
  getDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    for (const [taskId, dependents] of this.dependencyGraph.entries()) {
      graph.set(taskId, Array.from(dependents));
    }
    return graph;
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
   * Reset dependency state (for testing)
   */
  resetState(): void {
    for (const state of this.dependencyState.values()) {
      state.completedDependencies.clear();
      delete state.lastTriggered;
    }
  }
}

/**
 * % 100 COMPLETE - Dependency Manager (Day 3)
 */
