/**
 * E2E Test Framework
 *
 * Provides infrastructure for end-to-end testing of ClaudeCron
 * Simulates full MCP server lifecycle with task creation, execution, and verification
 */

import { ClaudeCronServer } from '../../src/server.js';
import { SQLiteStorage } from '../../src/storage/sqlite.js';
import { Task, Execution, TriggerType, TaskConfig, ExecutionStatus } from '../../src/models/types.js';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface E2ETestConfig {
  dbPath?: string;
  configPath?: string;
  checkInterval?: string;
  timezone?: string;
}

export class E2ETestFramework {
  private server: ClaudeCronServer | null = null;
  private storage: SQLiteStorage | null = null;
  private dbPath: string;
  private configPath: string;
  private cleanupPaths: string[] = [];

  constructor(config: E2ETestConfig = {}) {
    // Create temp database path
    this.dbPath = config.dbPath || path.join(os.tmpdir(), `e2e-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.db`);

    // Create temp config path
    this.configPath = config.configPath || path.join(os.tmpdir(), `e2e-config-${Date.now()}.json`);

    this.cleanupPaths.push(this.dbPath, this.configPath);
  }

  /**
   * Setup the test environment
   * Creates database, config, and initializes server
   */
  async setup(): Promise<void> {
    // Create temp config
    const config = {
      storage: {
        type: 'sqlite',
        path: this.dbPath
      },
      scheduler: {
        check_interval: '1s',
        default_timezone: 'UTC'
      }
    };

    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));

    // Initialize storage directly for testing
    this.storage = new SQLiteStorage(this.dbPath);

    // Initialize server
    this.server = new ClaudeCronServer('stdio');
    await this.server.initialize(this.configPath);
  }

  /**
   * Teardown the test environment
   * Stops server and cleans up temporary files
   */
  async teardown(): Promise<void> {
    if (this.server) {
      try {
        await this.server.stop();
      } catch (error) {
        console.error('Error stopping server:', error);
      }
    }

    if (this.storage) {
      try {
        await this.storage.close();
      } catch (error) {
        console.error('Error closing storage:', error);
      }
    }

    // Clean up temporary files
    for (const filePath of this.cleanupPaths) {
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      } catch (error) {
        console.error(`Error removing ${filePath}:`, error);
      }
    }
  }

  /**
   * Get storage instance for direct database access
   */
  getStorage(): SQLiteStorage {
    if (!this.storage) {
      throw new Error('Storage not initialized. Call setup() first.');
    }
    return this.storage;
  }

  /**
   * Create a task
   */
  async createTask(taskData: {
    name: string;
    type: Task['type'];
    task_config: TaskConfig;
    trigger: TriggerType;
    enabled?: boolean;
    options?: Task['options'];
    conditions?: Task['conditions'];
    on_success?: Task['on_success'];
    on_failure?: Task['on_failure'];
  }): Promise<Task> {
    const storage = this.getStorage();

    return await storage.createTask({
      name: taskData.name,
      enabled: taskData.enabled ?? true,
      type: taskData.type,
      task_config: taskData.task_config,
      trigger: taskData.trigger,
      options: taskData.options,
      conditions: taskData.conditions,
      on_success: taskData.on_success,
      on_failure: taskData.on_failure,
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    });
  }

  /**
   * Execute a task manually
   */
  async executeTask(taskId: string, triggerType: string = 'manual'): Promise<string> {
    if (!this.server) {
      throw new Error('Server not initialized. Call setup() first.');
    }

    const storage = this.getStorage();
    const task = await storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Use scheduler to execute
    // Since we can't directly access scheduler from server, we'll use storage
    // In a real implementation, we'd use MCP tool calls
    const executionId = await this.simulateTaskExecution(task, triggerType);
    return executionId;
  }

  /**
   * Simulate task execution (internal helper)
   */
  private async simulateTaskExecution(task: Task, triggerType: string): Promise<string> {
    const storage = this.getStorage();
    const { v4: uuidv4 } = await import('uuid');

    const executionId = uuidv4();
    const now = new Date().toISOString();

    // Create execution record
    const execution: Execution = {
      id: executionId,
      task_id: task.id,
      started_at: now,
      trigger_type: triggerType,
      status: 'running'
    };

    await storage.saveExecution(execution);

    // Execute based on task type
    try {
      let result: any;
      if (task.type === 'bash' && task.task_config.type === 'bash') {
        result = await this.executeBashTask(task.task_config);
      } else {
        throw new Error(`Task type ${task.type} not supported in test framework`);
      }

      // Update execution with success
      execution.status = result.status;
      execution.output = result.output;
      execution.exit_code = result.exit_code;
      execution.completed_at = new Date().toISOString();
      execution.duration_ms = new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime();

      await storage.updateExecution(execution);

      // Update task stats
      await storage.updateTaskStats(task.id, execution.status === 'success');

      return executionId;
    } catch (error: any) {
      // Update execution with failure
      execution.status = 'failure';
      execution.error = error.message;
      execution.completed_at = new Date().toISOString();
      execution.duration_ms = new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime();

      await storage.updateExecution(execution);
      await storage.updateTaskStats(task.id, false);

      return executionId;
    }
  }

  /**
   * Execute bash command for testing
   */
  private async executeBashTask(config: any): Promise<{ status: ExecutionStatus; output: string; exit_code: number }> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      const { stdout, stderr } = await execAsync(config.command, {
        timeout: config.timeout || 30000,
        cwd: config.cwd || process.cwd(),
        env: { ...process.env, ...config.env }
      });

      return {
        status: 'success',
        output: stdout + stderr,
        exit_code: 0
      };
    } catch (error: any) {
      if (error.killed) {
        return {
          status: 'timeout',
          output: error.stdout + error.stderr,
          exit_code: error.code || -1
        };
      }

      return {
        status: 'failure',
        output: error.stdout + error.stderr,
        exit_code: error.code || 1
      };
    }
  }

  /**
   * Wait for a task execution to appear
   */
  async waitForExecution(taskId: string, timeout: number = 30000): Promise<Execution | null> {
    const storage = this.getStorage();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const executions = await storage.loadExecutions({ task_id: taskId });

      if (executions && executions.length > 0) {
        return executions[0];
      }

      await this.sleep(1000);
    }

    return null;
  }

  /**
   * Wait for execution to complete
   */
  async waitForExecutionComplete(executionId: string, timeout: number = 30000): Promise<Execution | null> {
    const storage = this.getStorage();
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const execution = await storage.getExecution(executionId);

      if (execution && execution.status !== 'running' && execution.status !== 'pending') {
        return execution;
      }

      await this.sleep(500);
    }

    return null;
  }

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    const storage = this.getStorage();
    return await storage.getTask(taskId);
  }

  /**
   * Get execution by ID
   */
  async getExecution(executionId: string): Promise<Execution | null> {
    const storage = this.getStorage();
    return await storage.getExecution(executionId);
  }

  /**
   * List executions for a task
   */
  async listExecutions(taskId: string): Promise<Execution[]> {
    const storage = this.getStorage();
    return await storage.loadExecutions({ task_id: taskId });
  }

  /**
   * Create a temporary file for testing
   */
  createTempFile(content: string = ''): string {
    const tempPath = path.join(os.tmpdir(), `test-file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}.txt`);
    fs.writeFileSync(tempPath, content);
    this.cleanupPaths.push(tempPath);
    return tempPath;
  }

  /**
   * Sleep helper
   */
  async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Assert execution status
   */
  assertExecutionStatus(execution: Execution | null, expectedStatus: ExecutionStatus): void {
    if (!execution) {
      throw new Error('Execution is null');
    }

    if (execution.status !== expectedStatus) {
      throw new Error(`Expected execution status to be ${expectedStatus}, but got ${execution.status}. Error: ${execution.error}`);
    }
  }

  /**
   * Assert task statistics
   */
  assertTaskStats(task: Task | null, expected: { run_count?: number; success_count?: number; failure_count?: number }): void {
    if (!task) {
      throw new Error('Task is null');
    }

    if (expected.run_count !== undefined && task.run_count !== expected.run_count) {
      throw new Error(`Expected run_count to be ${expected.run_count}, but got ${task.run_count}`);
    }

    if (expected.success_count !== undefined && task.success_count !== expected.success_count) {
      throw new Error(`Expected success_count to be ${expected.success_count}, but got ${task.success_count}`);
    }

    if (expected.failure_count !== undefined && task.failure_count !== expected.failure_count) {
      throw new Error(`Expected failure_count to be ${expected.failure_count}, but got ${task.failure_count}`);
    }
  }
}
