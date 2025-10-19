/**
 * Test Helpers and Fixtures
 *
 * Provides mock implementations and test data generators
 * for comprehensive unit testing
 */

import { Task, Execution, TaskType, TriggerType, ExecutionStatus } from '../../src/models/types.js';
import { Storage, TaskFilter, ExecutionFilter, TaskStats } from '../../src/storage/storage.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Test Data Generators
 */
export class TestHelpers {
  /**
   * Create a mock task with sensible defaults
   */
  static createMockTask(overrides?: Partial<Task>): Task {
    return {
      id: uuidv4(),
      name: 'Test Task',
      description: 'A test task for unit testing',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "test"'
      },
      trigger: {
        type: 'manual',
        description: 'Test trigger'
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      ...overrides
    };
  }

  /**
   * Create a mock execution record
   */
  static createMockExecution(
    taskId: string,
    overrides?: Partial<Execution>
  ): Execution {
    return {
      id: uuidv4(),
      task_id: taskId,
      started_at: new Date().toISOString(),
      status: 'running',
      trigger_type: 'manual',
      ...overrides
    };
  }

  /**
   * Create a scheduled task with cron trigger
   */
  static createScheduledTask(cronExpression: string = '0 * * * *', overrides?: Partial<Task>): Task {
    return this.createMockTask({
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "scheduled task"'
      },
      trigger: {
        type: 'schedule',
        cron: cronExpression,
        timezone: 'UTC'
      },
      ...overrides
    });
  }

  /**
   * Create an AI prompt task
   */
  static createAIPromptTask(overrides?: Partial<Task>): Task {
    return this.createMockTask({
      type: 'ai_prompt',
      task_config: {
        type: 'ai_prompt',
        prompt: 'Test AI prompt',
        allowed_tools: ['Read', 'Write']
      },
      ...overrides
    });
  }

  /**
   * Create a task with conditions
   */
  static createConditionalTask(overrides?: Partial<Task>): Task {
    return this.createMockTask({
      conditions: {
        skip_holidays: true,
        holiday_region: 'US',
        time_window: {
          start: '09:00',
          end: '17:00',
          timezone: 'UTC'
        }
      },
      ...overrides
    });
  }

  /**
   * Sleep utility for async tests
   */
  static async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate multiple test tasks
   */
  static createMultipleTasks(count: number, overrideGenerator?: (index: number) => Partial<Task>): Task[] {
    return Array.from({ length: count }, (_, i) =>
      this.createMockTask(overrideGenerator ? overrideGenerator(i) : { name: `Test Task ${i + 1}` })
    );
  }

  /**
   * Generate multiple test executions
   */
  static createMultipleExecutions(taskId: string, count: number, statusPattern?: ExecutionStatus[]): Execution[] {
    return Array.from({ length: count }, (_, i) => {
      const status = statusPattern ? statusPattern[i % statusPattern.length] : 'success';
      const completed = status !== 'running';

      return this.createMockExecution(taskId, {
        status,
        started_at: new Date(Date.now() - (count - i) * 60000).toISOString(),
        completed_at: completed ? new Date(Date.now() - (count - i) * 60000 + 5000).toISOString() : undefined,
        duration_ms: completed ? 5000 : undefined
      });
    });
  }
}

/**
 * Mock Storage Implementation
 *
 * In-memory storage for unit tests that don't need real database
 */
export class MockStorage implements Storage {
  private tasks: Map<string, Task> = new Map();
  private executions: Map<string, Execution> = new Map();

  /**
   * Task Operations
   */

  async createTask(data: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    const task = TestHelpers.createMockTask(data as any);
    this.tasks.set(task.id, task);
    return task;
  }

  async getTask(id: string): Promise<Task | null> {
    return this.tasks.get(id) || null;
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const existing = this.tasks.get(id);
    if (!existing) {
      throw new Error(`Task not found: ${id}`);
    }

    const updated = {
      ...existing,
      ...updates,
      id, // Prevent ID change
      updated_at: new Date().toISOString()
    };

    this.tasks.set(id, updated);
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    if (!this.tasks.has(id)) {
      throw new Error(`Task not found: ${id}`);
    }

    this.tasks.delete(id);

    // Delete associated executions
    for (const [execId, exec] of this.executions.entries()) {
      if (exec.task_id === id) {
        this.executions.delete(execId);
      }
    }
  }

  async loadTasks(filter?: TaskFilter): Promise<Task[]> {
    let tasks = Array.from(this.tasks.values());

    if (filter?.enabled !== undefined) {
      tasks = tasks.filter(t => t.enabled === filter.enabled);
    }

    if (filter?.type) {
      tasks = tasks.filter(t => t.type === filter.type);
    }

    if (filter?.trigger_type) {
      tasks = tasks.filter(t => t.trigger.type === filter.trigger_type);
    }

    if (filter?.trigger_event) {
      tasks = tasks.filter(t =>
        t.trigger.type === 'hook' && (t.trigger as any).event === filter.trigger_event
      );
    }

    return tasks;
  }

  /**
   * Execution Operations
   */

  async createExecution(data: Omit<Execution, 'id'>): Promise<Execution> {
    const execution = TestHelpers.createMockExecution(data.task_id, data as any);
    this.executions.set(execution.id, execution);
    return execution;
  }

  async getExecution(id: string): Promise<Execution | null> {
    return this.executions.get(id) || null;
  }

  async updateExecution(id: string, updates: Partial<Execution>): Promise<Execution> {
    const existing = this.executions.get(id);
    if (!existing) {
      throw new Error(`Execution not found: ${id}`);
    }

    const updated = {
      ...existing,
      ...updates,
      id // Prevent ID change
    };

    this.executions.set(id, updated);
    return updated;
  }

  async loadExecutions(filter?: ExecutionFilter): Promise<Execution[]> {
    let executions = Array.from(this.executions.values());

    if (filter?.task_id) {
      executions = executions.filter(e => e.task_id === filter.task_id);
    }

    if (filter?.status) {
      executions = executions.filter(e => e.status === filter.status);
    }

    if (filter?.start_date) {
      executions = executions.filter(e => e.started_at >= filter.start_date!);
    }

    if (filter?.end_date) {
      executions = executions.filter(e => e.started_at <= filter.end_date!);
    }

    // Sort by started_at descending
    executions.sort((a, b) => b.started_at.localeCompare(a.started_at));

    if (filter?.limit) {
      executions = executions.slice(filter.offset || 0, (filter.offset || 0) + filter.limit);
    } else if (filter?.offset) {
      executions = executions.slice(filter.offset);
    }

    return executions;
  }

  /**
   * Statistics Operations
   */

  async getTaskStats(taskId: string): Promise<TaskStats> {
    const executions = await this.loadExecutions({ task_id: taskId });

    const totalRuns = executions.length;
    const successfulRuns = executions.filter(e => e.status === 'success').length;
    const failedRuns = executions.filter(e => e.status === 'failure').length;

    const durations = executions
      .filter(e => e.duration_ms !== undefined)
      .map(e => e.duration_ms!);

    const averageDuration = durations.length > 0
      ? durations.reduce((sum, d) => sum + d, 0) / durations.length
      : 0;

    const costs = executions
      .filter(e => e.cost_usd !== undefined)
      .map(e => e.cost_usd!);

    const totalCost = costs.length > 0
      ? costs.reduce((sum, c) => sum + c, 0)
      : 0;

    return {
      total_runs: totalRuns,
      successful_runs: successfulRuns,
      failed_runs: failedRuns,
      average_duration_ms: averageDuration,
      total_cost_usd: totalCost
    };
  }

  /**
   * Lifecycle Operations
   */

  async close(): Promise<void> {
    // No-op for mock storage
  }

  /**
   * Test Utilities
   */

  clear(): void {
    this.tasks.clear();
    this.executions.clear();
  }

  getTaskCount(): number {
    return this.tasks.size;
  }

  getExecutionCount(): number {
    return this.executions.size;
  }
}

/**
 * Spy/Mock utilities for testing
 */
export class TestSpy {
  private calls: any[][] = [];

  call(...args: any[]): void {
    this.calls.push(args);
  }

  getCallCount(): number {
    return this.calls.length;
  }

  getCall(index: number): any[] | undefined {
    return this.calls[index];
  }

  getLastCall(): any[] | undefined {
    return this.calls[this.calls.length - 1];
  }

  getAllCalls(): any[][] {
    return this.calls;
  }

  wasCalled(): boolean {
    return this.calls.length > 0;
  }

  wasCalledWith(...args: any[]): boolean {
    return this.calls.some(call =>
      call.length === args.length &&
      call.every((arg, i) => JSON.stringify(arg) === JSON.stringify(args[i]))
    );
  }

  reset(): void {
    this.calls = [];
  }
}
