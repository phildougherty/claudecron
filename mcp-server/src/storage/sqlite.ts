/**
 * SQLite Storage Implementation
 *
 * Implements the Storage interface using better-sqlite3
 * Based on CLAUDE_CRON.md specification lines 1764-1937
 *
 * % 0 COMPLETE - SQLite storage
 */

import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { Task, Execution } from '../models/types.js';
import { Storage, TaskFilter, ExecutionFilter, TaskStats } from './storage.js';

/**
 * SQLite Storage Implementation
 *
 * Provides persistent storage using SQLite database
 * Suitable for local development and single-user scenarios
 */
export class SQLiteStorage implements Storage {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // Write-Ahead Logging for better concurrency
    this.initialize();
  }

  /**
   * Initialize database schema
   * Creates tables and indexes if they don't exist
   */
  private initialize(): void {
    // % 0 COMPLETE - Database initialization

    // Create tasks table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,

        -- Task configuration (JSON)
        type TEXT NOT NULL,
        task_config TEXT NOT NULL,

        -- Trigger configuration (JSON)
        trigger TEXT NOT NULL,

        -- Options (JSON)
        options TEXT,
        conditions TEXT,
        on_success TEXT,
        on_failure TEXT,

        -- Metadata
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_run TEXT,
        next_run TEXT,

        -- Statistics
        run_count INTEGER NOT NULL DEFAULT 0,
        success_count INTEGER NOT NULL DEFAULT 0,
        failure_count INTEGER NOT NULL DEFAULT 0
      );
    `);

    // Create executions table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS executions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,

        -- Timing
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,

        -- Trigger
        trigger_type TEXT NOT NULL,
        trigger_context TEXT,

        -- Status
        status TEXT NOT NULL,
        exit_code INTEGER,
        error TEXT,

        -- Output
        output TEXT,
        output_truncated INTEGER DEFAULT 0,
        thinking_output TEXT,
        tool_calls TEXT,

        -- Metadata
        sdk_usage TEXT,
        cost_usd REAL,

        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );
    `);

    // Create indexes for performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_tasks_enabled ON tasks(enabled);
      CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run) WHERE enabled = 1;
      CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
      CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
      CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at);
      CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
    `);

    // % 100 COMPLETE - Database initialization
  }

  /**
   * Task Operations
   */

  async createTask(task: Omit<Task, 'id' | 'created_at' | 'updated_at'>): Promise<Task> {
    // % 0 COMPLETE - createTask

    const id = uuidv4();
    const now = new Date().toISOString();

    const fullTask: Task = {
      ...task,
      id,
      created_at: now,
      updated_at: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO tasks (
        id, name, description, enabled, type, task_config, trigger,
        options, conditions, on_success, on_failure,
        created_at, updated_at, last_run, next_run,
        run_count, success_count, failure_count
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    stmt.run(
      fullTask.id,
      fullTask.name,
      fullTask.description ?? null,
      fullTask.enabled ? 1 : 0,
      fullTask.type,
      JSON.stringify(fullTask.task_config),
      JSON.stringify(fullTask.trigger),
      fullTask.options ? JSON.stringify(fullTask.options) : null,
      fullTask.conditions ? JSON.stringify(fullTask.conditions) : null,
      fullTask.on_success ? JSON.stringify(fullTask.on_success) : null,
      fullTask.on_failure ? JSON.stringify(fullTask.on_failure) : null,
      fullTask.created_at,
      fullTask.updated_at,
      fullTask.last_run ?? null,
      fullTask.next_run ?? null,
      fullTask.run_count,
      fullTask.success_count,
      fullTask.failure_count
    );

    // % 100 COMPLETE - createTask
    return fullTask;
  }

  async getTask(id: string): Promise<Task | null> {
    // % 0 COMPLETE - getTask

    const stmt = this.db.prepare('SELECT * FROM tasks WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    // % 100 COMPLETE - getTask
    return this.deserializeTask(row);
  }

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    // % 0 COMPLETE - updateTask

    const existing = await this.getTask(id);
    if (!existing) {
      throw new Error(`Task not found: ${id}`);
    }

    const updated: Task = {
      ...existing,
      ...updates,
      id, // Prevent ID change
      updated_at: new Date().toISOString(),
    };

    const stmt = this.db.prepare(`
      UPDATE tasks SET
        name = ?, description = ?, enabled = ?, type = ?,
        task_config = ?, trigger = ?, options = ?, conditions = ?,
        on_success = ?, on_failure = ?, updated_at = ?, last_run = ?,
        next_run = ?, run_count = ?, success_count = ?, failure_count = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.name,
      updated.description ?? null,
      updated.enabled ? 1 : 0,
      updated.type,
      JSON.stringify(updated.task_config),
      JSON.stringify(updated.trigger),
      updated.options ? JSON.stringify(updated.options) : null,
      updated.conditions ? JSON.stringify(updated.conditions) : null,
      updated.on_success ? JSON.stringify(updated.on_success) : null,
      updated.on_failure ? JSON.stringify(updated.on_failure) : null,
      updated.updated_at,
      updated.last_run ?? null,
      updated.next_run ?? null,
      updated.run_count,
      updated.success_count,
      updated.failure_count,
      id
    );

    // % 100 COMPLETE - updateTask
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    // % 0 COMPLETE - deleteTask

    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error(`Task not found: ${id}`);
    }

    // % 100 COMPLETE - deleteTask
  }

  async loadTasks(filter?: TaskFilter): Promise<Task[]> {
    // % 0 COMPLETE - loadTasks

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];

    if (filter?.enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(filter.enabled ? 1 : 0);
    }

    if (filter?.type) {
      query += ' AND type = ?';
      params.push(filter.type);
    }

    if (filter?.trigger_type) {
      query += ' AND json_extract(trigger, \'$.type\') = ?';
      params.push(filter.trigger_type);
    }

    if (filter?.trigger_event) {
      query += ' AND json_extract(trigger, \'$.event\') = ?';
      params.push(filter.trigger_event);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    // % 100 COMPLETE - loadTasks
    return rows.map(row => this.deserializeTask(row));
  }

  /**
   * Execution Operations
   */

  async createExecution(execution: Omit<Execution, 'id'>): Promise<Execution> {
    // % 0 COMPLETE - createExecution

    const id = uuidv4();
    const fullExecution: Execution = {
      ...execution,
      id,
    };

    const stmt = this.db.prepare(`
      INSERT INTO executions (
        id, task_id, started_at, completed_at, duration_ms,
        trigger_type, trigger_context, status, exit_code, error,
        output, output_truncated, thinking_output, tool_calls,
        sdk_usage, cost_usd
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      fullExecution.id,
      fullExecution.task_id,
      fullExecution.started_at,
      fullExecution.completed_at ?? null,
      fullExecution.duration_ms ?? null,
      fullExecution.trigger_type,
      fullExecution.trigger_context ? JSON.stringify(fullExecution.trigger_context) : null,
      fullExecution.status,
      fullExecution.exit_code ?? null,
      fullExecution.error ?? null,
      fullExecution.output ?? null,
      fullExecution.output_truncated ? 1 : 0,
      fullExecution.thinking_output ?? null,
      fullExecution.tool_calls ? JSON.stringify(fullExecution.tool_calls) : null,
      fullExecution.sdk_usage ? JSON.stringify(fullExecution.sdk_usage) : null,
      fullExecution.cost_usd ?? null
    );

    // % 100 COMPLETE - createExecution
    return fullExecution;
  }

  async getExecution(id: string): Promise<Execution | null> {
    // % 0 COMPLETE - getExecution

    const stmt = this.db.prepare('SELECT * FROM executions WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) {
      return null;
    }

    // % 100 COMPLETE - getExecution
    return this.deserializeExecution(row);
  }

  async updateExecution(id: string, updates: Partial<Execution>): Promise<Execution> {
    // % 0 COMPLETE - updateExecution

    const existing = await this.getExecution(id);
    if (!existing) {
      throw new Error(`Execution not found: ${id}`);
    }

    const updated: Execution = {
      ...existing,
      ...updates,
      id, // Prevent ID change
    };

    const stmt = this.db.prepare(`
      UPDATE executions SET
        completed_at = ?, duration_ms = ?, status = ?, exit_code = ?,
        error = ?, output = ?, output_truncated = ?, thinking_output = ?,
        tool_calls = ?, sdk_usage = ?, cost_usd = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.completed_at ?? null,
      updated.duration_ms ?? null,
      updated.status,
      updated.exit_code ?? null,
      updated.error ?? null,
      updated.output ?? null,
      updated.output_truncated ? 1 : 0,
      updated.thinking_output ?? null,
      updated.tool_calls ? JSON.stringify(updated.tool_calls) : null,
      updated.sdk_usage ? JSON.stringify(updated.sdk_usage) : null,
      updated.cost_usd ?? null,
      id
    );

    // % 100 COMPLETE - updateExecution
    return updated;
  }

  async loadExecutions(filter?: ExecutionFilter): Promise<Execution[]> {
    // % 0 COMPLETE - loadExecutions

    let query = 'SELECT * FROM executions WHERE 1=1';
    const params: any[] = [];

    if (filter?.task_id) {
      query += ' AND task_id = ?';
      params.push(filter.task_id);
    }

    if (filter?.status) {
      query += ' AND status = ?';
      params.push(filter.status);
    }

    if (filter?.start_date) {
      query += ' AND started_at >= ?';
      params.push(filter.start_date);
    }

    if (filter?.end_date) {
      query += ' AND started_at <= ?';
      params.push(filter.end_date);
    }

    query += ' ORDER BY started_at DESC';

    if (filter?.limit) {
      query += ' LIMIT ?';
      params.push(filter.limit);
    }

    if (filter?.offset) {
      query += ' OFFSET ?';
      params.push(filter.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params) as any[];

    // % 100 COMPLETE - loadExecutions
    return rows.map(row => this.deserializeExecution(row));
  }

  /**
   * Statistics Operations
   */

  async getTaskStats(taskId: string): Promise<TaskStats> {
    // % 0 COMPLETE - getTaskStats

    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failed_runs,
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE 0 END) as average_duration_ms,
        SUM(CASE WHEN cost_usd IS NOT NULL THEN cost_usd ELSE 0 END) as total_cost_usd
      FROM executions
      WHERE task_id = ?
    `);

    const row = stmt.get(taskId) as any;

    // % 100 COMPLETE - getTaskStats
    return {
      total_runs: row.total_runs || 0,
      successful_runs: row.successful_runs || 0,
      failed_runs: row.failed_runs || 0,
      average_duration_ms: row.average_duration_ms || 0,
      total_cost_usd: row.total_cost_usd || 0,
    };
  }

  /**
   * Streaming Operations
   */

  async appendExecutionOutput(executionId: string, text: string): Promise<void> {
    // % 0 COMPLETE - appendExecutionOutput

    const stmt = this.db.prepare(`
      UPDATE executions
      SET output = COALESCE(output, '') || ?
      WHERE id = ?
    `);
    stmt.run(text, executionId);

    // % 100 COMPLETE - appendExecutionOutput
  }

  async appendExecutionThinking(executionId: string, thinking: string): Promise<void> {
    // % 0 COMPLETE - appendExecutionThinking

    const stmt = this.db.prepare(`
      UPDATE executions
      SET thinking_output = COALESCE(thinking_output, '') || ?
      WHERE id = ?
    `);
    stmt.run(thinking + '\n\n', executionId);

    // % 100 COMPLETE - appendExecutionThinking
  }

  async getExecutionProgress(executionId: string): Promise<{
    output: string;
    thinking: string;
    status: string;
  }> {
    // % 0 COMPLETE - getExecutionProgress

    const stmt = this.db.prepare(`
      SELECT output, thinking_output, status
      FROM executions
      WHERE id = ?
    `);
    const row = stmt.get(executionId) as any;

    if (!row) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    return {
      output: row.output || '',
      thinking: row.thinking_output || '',
      status: row.status
    };

    // % 100 COMPLETE - getExecutionProgress
  }

  /**
   * Lifecycle Operations
   */

  async close(): Promise<void> {
    // % 0 COMPLETE - close
    this.db.close();
    // % 100 COMPLETE - close
  }

  /**
   * Private Helper Methods
   */

  /**
   * Deserialize a task row from database
   */
  private deserializeTask(row: any): Task {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      enabled: row.enabled === 1,
      type: row.type,
      task_config: JSON.parse(row.task_config),
      trigger: JSON.parse(row.trigger),
      options: row.options ? JSON.parse(row.options) : undefined,
      conditions: row.conditions ? JSON.parse(row.conditions) : undefined,
      on_success: row.on_success ? JSON.parse(row.on_success) : undefined,
      on_failure: row.on_failure ? JSON.parse(row.on_failure) : undefined,
      created_at: row.created_at,
      updated_at: row.updated_at,
      last_run: row.last_run,
      next_run: row.next_run,
      run_count: row.run_count,
      success_count: row.success_count,
      failure_count: row.failure_count,
    };
  }

  /**
   * Deserialize an execution row from database
   */
  private deserializeExecution(row: any): Execution {
    return {
      id: row.id,
      task_id: row.task_id,
      started_at: row.started_at,
      completed_at: row.completed_at,
      duration_ms: row.duration_ms,
      trigger_type: row.trigger_type,
      trigger_context: row.trigger_context ? JSON.parse(row.trigger_context) : undefined,
      status: row.status,
      exit_code: row.exit_code,
      error: row.error,
      output: row.output,
      output_truncated: row.output_truncated === 1,
      thinking_output: row.thinking_output,
      tool_calls: row.tool_calls ? JSON.parse(row.tool_calls) : undefined,
      sdk_usage: row.sdk_usage ? JSON.parse(row.sdk_usage) : undefined,
      cost_usd: row.cost_usd,
    };
  }
}

/**
 * % 100 COMPLETE - SQLite storage
 */
