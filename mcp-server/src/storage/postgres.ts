/**
 * PostgreSQL Storage Implementation
 *
 * Implements the Storage interface using node-postgres (pg)
 * Production-ready storage backend with connection pooling
 *
 * % 0 COMPLETE - PostgreSQL storage
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { Task, Execution } from '../models/types.js';
import { Storage, TaskFilter, ExecutionFilter, TaskStats } from './storage.js';

/**
 * PostgreSQL Storage Implementation
 *
 * Provides persistent storage using PostgreSQL database
 * Suitable for production deployments with connection pooling
 */
export class PostgresStorage implements Storage {
  private pool: Pool;

  constructor(connectionUrl: string) {
    this.pool = new Pool({
      connectionString: connectionUrl,
      max: 20, // Maximum pool size
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('[PostgresStorage] Unexpected error on idle client', err);
    });

    this.initialize();
  }

  /**
   * Initialize database schema
   * Creates tables and indexes if they don't exist
   */
  private async initialize(): Promise<void> {
    // % 0 COMPLETE - Database initialization

    const client = await this.pool.connect();
    try {
      // Create tasks table
      await client.query(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          enabled BOOLEAN NOT NULL DEFAULT true,

          -- Task configuration (JSON)
          type TEXT NOT NULL,
          task_config JSONB NOT NULL,

          -- Trigger configuration (JSON)
          trigger JSONB NOT NULL,

          -- Options (JSON)
          options JSONB,
          conditions JSONB,
          on_success JSONB,
          on_failure JSONB,

          -- Metadata
          created_at TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL,
          last_run TIMESTAMPTZ,
          next_run TIMESTAMPTZ,

          -- Statistics
          run_count INTEGER NOT NULL DEFAULT 0,
          success_count INTEGER NOT NULL DEFAULT 0,
          failure_count INTEGER NOT NULL DEFAULT 0
        )
      `);

      // Create executions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY,
          task_id TEXT NOT NULL,

          -- Timing
          started_at TIMESTAMPTZ NOT NULL,
          completed_at TIMESTAMPTZ,
          duration_ms INTEGER,

          -- Trigger
          trigger_type TEXT NOT NULL,
          trigger_context JSONB,

          -- Status
          status TEXT NOT NULL,
          exit_code INTEGER,
          error TEXT,

          -- Output
          output TEXT,
          output_truncated BOOLEAN DEFAULT false,
          thinking_output TEXT,
          tool_calls JSONB,

          -- Metadata
          sdk_usage JSONB,
          cost_usd REAL,

          FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
      `);

      // Create indexes for performance
      await client.query(`
        CREATE INDEX IF NOT EXISTS idx_tasks_enabled ON tasks(enabled);
        CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run) WHERE enabled = true;
        CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);
        CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
        CREATE INDEX IF NOT EXISTS idx_executions_started_at ON executions(started_at);
        CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
      `);

      console.log('[PostgresStorage] Database schema initialized');
    } finally {
      client.release();
    }

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

    const query = `
      INSERT INTO tasks (
        id, name, description, enabled, type, task_config, trigger,
        options, conditions, on_success, on_failure,
        created_at, updated_at, last_run, next_run,
        run_count, success_count, failure_count
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18
      )
    `;

    const values = [
      fullTask.id,
      fullTask.name,
      fullTask.description ?? null,
      fullTask.enabled,
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
    ];

    await this.pool.query(query, values);

    // % 100 COMPLETE - createTask
    return fullTask;
  }

  async getTask(id: string): Promise<Task | null> {
    // % 0 COMPLETE - getTask

    const query = 'SELECT * FROM tasks WHERE id = $1';
    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    // % 100 COMPLETE - getTask
    return this.deserializeTask(result.rows[0]);
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

    const query = `
      UPDATE tasks SET
        name = $1, description = $2, enabled = $3, type = $4,
        task_config = $5, trigger = $6, options = $7, conditions = $8,
        on_success = $9, on_failure = $10, updated_at = $11, last_run = $12,
        next_run = $13, run_count = $14, success_count = $15, failure_count = $16
      WHERE id = $17
    `;

    const values = [
      updated.name,
      updated.description ?? null,
      updated.enabled,
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
    ];

    await this.pool.query(query, values);

    // % 100 COMPLETE - updateTask
    return updated;
  }

  async deleteTask(id: string): Promise<void> {
    // % 0 COMPLETE - deleteTask

    const query = 'DELETE FROM tasks WHERE id = $1';
    const result = await this.pool.query(query, [id]);

    if (result.rowCount === 0) {
      throw new Error(`Task not found: ${id}`);
    }

    // % 100 COMPLETE - deleteTask
  }

  async loadTasks(filter?: TaskFilter): Promise<Task[]> {
    // % 0 COMPLETE - loadTasks

    let query = 'SELECT * FROM tasks WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filter?.enabled !== undefined) {
      query += ` AND enabled = $${paramIndex}`;
      params.push(filter.enabled);
      paramIndex++;
    }

    if (filter?.type) {
      query += ` AND type = $${paramIndex}`;
      params.push(filter.type);
      paramIndex++;
    }

    if (filter?.trigger_type) {
      query += ` AND trigger->>'type' = $${paramIndex}`;
      params.push(filter.trigger_type);
      paramIndex++;
    }

    if (filter?.trigger_event) {
      query += ` AND trigger->>'event' = $${paramIndex}`;
      params.push(filter.trigger_event);
      paramIndex++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await this.pool.query(query, params);

    // % 100 COMPLETE - loadTasks
    return result.rows.map(row => this.deserializeTask(row));
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

    const query = `
      INSERT INTO executions (
        id, task_id, started_at, completed_at, duration_ms,
        trigger_type, trigger_context, status, exit_code, error,
        output, output_truncated, thinking_output, tool_calls,
        sdk_usage, cost_usd
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14,
        $15, $16
      )
    `;

    const values = [
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
      fullExecution.output_truncated ?? false,
      fullExecution.thinking_output ?? null,
      fullExecution.tool_calls ? JSON.stringify(fullExecution.tool_calls) : null,
      fullExecution.sdk_usage ? JSON.stringify(fullExecution.sdk_usage) : null,
      fullExecution.cost_usd ?? null
    ];

    await this.pool.query(query, values);

    // % 100 COMPLETE - createExecution
    return fullExecution;
  }

  async getExecution(id: string): Promise<Execution | null> {
    // % 0 COMPLETE - getExecution

    const query = 'SELECT * FROM executions WHERE id = $1';
    const result = await this.pool.query(query, [id]);

    if (result.rows.length === 0) {
      return null;
    }

    // % 100 COMPLETE - getExecution
    return this.deserializeExecution(result.rows[0]);
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

    const query = `
      UPDATE executions SET
        completed_at = $1, duration_ms = $2, status = $3, exit_code = $4,
        error = $5, output = $6, output_truncated = $7, thinking_output = $8,
        tool_calls = $9, sdk_usage = $10, cost_usd = $11
      WHERE id = $12
    `;

    const values = [
      updated.completed_at ?? null,
      updated.duration_ms ?? null,
      updated.status,
      updated.exit_code ?? null,
      updated.error ?? null,
      updated.output ?? null,
      updated.output_truncated ?? false,
      updated.thinking_output ?? null,
      updated.tool_calls ? JSON.stringify(updated.tool_calls) : null,
      updated.sdk_usage ? JSON.stringify(updated.sdk_usage) : null,
      updated.cost_usd ?? null,
      id
    ];

    await this.pool.query(query, values);

    // % 100 COMPLETE - updateExecution
    return updated;
  }

  async loadExecutions(filter?: ExecutionFilter): Promise<Execution[]> {
    // % 0 COMPLETE - loadExecutions

    let query = 'SELECT * FROM executions WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filter?.task_id) {
      query += ` AND task_id = $${paramIndex}`;
      params.push(filter.task_id);
      paramIndex++;
    }

    if (filter?.status) {
      query += ` AND status = $${paramIndex}`;
      params.push(filter.status);
      paramIndex++;
    }

    if (filter?.start_date) {
      query += ` AND started_at >= $${paramIndex}`;
      params.push(filter.start_date);
      paramIndex++;
    }

    if (filter?.end_date) {
      query += ` AND started_at <= $${paramIndex}`;
      params.push(filter.end_date);
      paramIndex++;
    }

    query += ' ORDER BY started_at DESC';

    if (filter?.limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(filter.limit);
      paramIndex++;
    }

    if (filter?.offset) {
      query += ` OFFSET $${paramIndex}`;
      params.push(filter.offset);
      paramIndex++;
    }

    const result = await this.pool.query(query, params);

    // % 100 COMPLETE - loadExecutions
    return result.rows.map(row => this.deserializeExecution(row));
  }

  /**
   * Statistics Operations
   */

  async getTaskStats(taskId: string): Promise<TaskStats> {
    // % 0 COMPLETE - getTaskStats

    const query = `
      SELECT
        COUNT(*) as total_runs,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful_runs,
        SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) as failed_runs,
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE 0 END) as average_duration_ms,
        SUM(CASE WHEN cost_usd IS NOT NULL THEN cost_usd ELSE 0 END) as total_cost_usd
      FROM executions
      WHERE task_id = $1
    `;

    const result = await this.pool.query(query, [taskId]);
    const row = result.rows[0];

    // % 100 COMPLETE - getTaskStats
    return {
      total_runs: parseInt(row.total_runs) || 0,
      successful_runs: parseInt(row.successful_runs) || 0,
      failed_runs: parseInt(row.failed_runs) || 0,
      average_duration_ms: parseFloat(row.average_duration_ms) || 0,
      total_cost_usd: parseFloat(row.total_cost_usd) || 0,
    };
  }

  /**
   * Streaming Operations
   */

  async appendExecutionOutput(executionId: string, text: string): Promise<void> {
    // % 0 COMPLETE - appendExecutionOutput

    const query = `
      UPDATE executions
      SET output = COALESCE(output, '') || $1
      WHERE id = $2
    `;
    await this.pool.query(query, [text, executionId]);

    // % 100 COMPLETE - appendExecutionOutput
  }

  async appendExecutionThinking(executionId: string, thinking: string): Promise<void> {
    // % 0 COMPLETE - appendExecutionThinking

    const query = `
      UPDATE executions
      SET thinking_output = COALESCE(thinking_output, '') || $1
      WHERE id = $2
    `;
    await this.pool.query(query, [thinking + '\n\n', executionId]);

    // % 100 COMPLETE - appendExecutionThinking
  }

  async getExecutionProgress(executionId: string): Promise<{
    output: string;
    thinking: string;
    status: string;
  }> {
    // % 0 COMPLETE - getExecutionProgress

    const query = `
      SELECT output, thinking_output, status
      FROM executions
      WHERE id = $1
    `;
    const result = await this.pool.query(query, [executionId]);

    if (result.rows.length === 0) {
      throw new Error(`Execution not found: ${executionId}`);
    }

    const row = result.rows[0];

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
    await this.pool.end();
    console.log('[PostgresStorage] Connection pool closed');
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
      enabled: row.enabled,
      type: row.type,
      task_config: typeof row.task_config === 'string' ? JSON.parse(row.task_config) : row.task_config,
      trigger: typeof row.trigger === 'string' ? JSON.parse(row.trigger) : row.trigger,
      options: row.options ? (typeof row.options === 'string' ? JSON.parse(row.options) : row.options) : undefined,
      conditions: row.conditions ? (typeof row.conditions === 'string' ? JSON.parse(row.conditions) : row.conditions) : undefined,
      on_success: row.on_success ? (typeof row.on_success === 'string' ? JSON.parse(row.on_success) : row.on_success) : undefined,
      on_failure: row.on_failure ? (typeof row.on_failure === 'string' ? JSON.parse(row.on_failure) : row.on_failure) : undefined,
      created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
      updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      last_run: row.last_run ? (row.last_run instanceof Date ? row.last_run.toISOString() : row.last_run) : undefined,
      next_run: row.next_run ? (row.next_run instanceof Date ? row.next_run.toISOString() : row.next_run) : undefined,
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
      started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
      completed_at: row.completed_at ? (row.completed_at instanceof Date ? row.completed_at.toISOString() : row.completed_at) : undefined,
      duration_ms: row.duration_ms,
      trigger_type: row.trigger_type,
      trigger_context: row.trigger_context ? (typeof row.trigger_context === 'string' ? JSON.parse(row.trigger_context) : row.trigger_context) : undefined,
      status: row.status,
      exit_code: row.exit_code,
      error: row.error,
      output: row.output,
      output_truncated: row.output_truncated,
      thinking_output: row.thinking_output,
      tool_calls: row.tool_calls ? (typeof row.tool_calls === 'string' ? JSON.parse(row.tool_calls) : row.tool_calls) : undefined,
      sdk_usage: row.sdk_usage ? (typeof row.sdk_usage === 'string' ? JSON.parse(row.sdk_usage) : row.sdk_usage) : undefined,
      cost_usd: row.cost_usd,
    };
  }
}

/**
 * % 100 COMPLETE - PostgreSQL storage
 */
