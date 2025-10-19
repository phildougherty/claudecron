/**
 * Storage Interface
 *
 * Defines the contract for task and execution storage
 * Based on CLAUDE_CRON.md specification lines 1717-1761
 *
 * % 0 COMPLETE - Storage interface
 */

import { Task, Execution, ExecutionStatus } from '../models/types.js';

/**
 * Task Filter Options
 */
export interface TaskFilter {
  enabled?: boolean;
  type?: string;
  trigger_type?: string;
  trigger_event?: string;
}

/**
 * Execution Filter Options
 */
export interface ExecutionFilter {
  task_id?: string;
  status?: ExecutionStatus;
  limit?: number;
  offset?: number;
  start_date?: string;
  end_date?: string;
}

/**
 * Task Statistics
 */
export interface TaskStats {
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  average_duration_ms: number;
  total_cost_usd: number;
}

/**
 * Storage Interface
 *
 * Provides persistence for tasks and executions
 * Implementations: SQLite (local), PostgreSQL (production)
 */
export interface Storage {
  /**
   * Task Operations
   */

  /**
   * Create a new task
   * @param task - Task data without id, created_at, updated_at
   * @returns Created task with generated ID and timestamps
   */
  createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task>;

  /**
   * Get a task by ID
   * @param id - Task ID
   * @returns Task or null if not found
   */
  getTask(id: string): Promise<Task | null>;

  /**
   * Update a task
   * @param id - Task ID
   * @param updates - Partial task updates
   * @returns Updated task
   */
  updateTask(id: string, updates: Partial<Task>): Promise<Task>;

  /**
   * Delete a task
   * @param id - Task ID
   */
  deleteTask(id: string): Promise<void>;

  /**
   * Load tasks with optional filtering
   * @param filter - Task filter options
   * @returns Array of tasks matching filter
   */
  loadTasks(filter?: TaskFilter): Promise<Task[]>;

  /**
   * Execution Operations
   */

  /**
   * Create a new execution record
   * @param execution - Execution data without id
   * @returns Created execution with generated ID
   */
  createExecution(execution: Omit<Execution, 'id'>): Promise<Execution>;

  /**
   * Get an execution by ID
   * @param id - Execution ID
   * @returns Execution or null if not found
   */
  getExecution(id: string): Promise<Execution | null>;

  /**
   * Update an execution
   * @param id - Execution ID
   * @param updates - Partial execution updates
   * @returns Updated execution
   */
  updateExecution(id: string, updates: Partial<Execution>): Promise<Execution>;

  /**
   * Load executions with optional filtering
   * @param filter - Execution filter options
   * @returns Array of executions matching filter
   */
  loadExecutions(filter?: ExecutionFilter): Promise<Execution[]>;

  /**
   * Statistics Operations
   */

  /**
   * Get statistics for a task
   * @param taskId - Task ID
   * @returns Task statistics
   */
  getTaskStats(taskId: string): Promise<TaskStats>;

  /**
   * Streaming Operations (for real-time execution updates)
   */

  /**
   * Append text to execution output in real-time
   * @param executionId - Execution ID
   * @param text - Text to append
   */
  appendExecutionOutput(executionId: string, text: string): Promise<void>;

  /**
   * Append thinking output in real-time
   * @param executionId - Execution ID
   * @param thinking - Thinking text to append
   */
  appendExecutionThinking(executionId: string, thinking: string): Promise<void>;

  /**
   * Get current execution progress (for monitoring)
   * @param executionId - Execution ID
   * @returns Current output, thinking, and status
   */
  getExecutionProgress(executionId: string): Promise<{
    output: string;
    thinking: string;
    status: string;
  }>;

  /**
   * Lifecycle Operations
   */

  /**
   * Close the storage connection
   * Should be called on shutdown
   */
  close(): Promise<void>;
}

/**
 * % 100 COMPLETE - Storage interface
 */
