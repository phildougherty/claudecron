/**
 * Bash Executor
 *
 * Executes bash commands for bash-type tasks
 *
 * % 100 COMPLETE - Bash executor implementation (Day 2)
 */

import { spawn } from 'child_process';
import { Task, BashTaskConfig, Execution } from '../models/types.js';
import { Executor, ExecutionResult } from './factory.js';
import { replaceTemplateVariables } from '../handlers/template-variables.js';

/**
 * Bash Executor
 *
 * Executes shell commands with timeout, env, and cwd support
 */
export class BashExecutor implements Executor {
  /**
   * Execute a bash task
   * @param task - Task to execute
   * @param execution - Execution record with trigger context
   * @returns Execution result
   */
  async execute(task: Task, execution: Execution): Promise<ExecutionResult> {
    const config = task.task_config as BashTaskConfig;
    const startTime = Date.now();

    if (config.type !== 'bash') {
      throw new Error(`Invalid task config type: ${config.type}, expected 'bash'`);
    }

    // Get configuration
    let command = config.command;

    // Apply template variable replacement
    command = replaceTemplateVariables(command, task, execution);

    const cwd = config.cwd || process.cwd();

    // Build environment variables with hook context
    const env = {
      ...process.env,
      ...config.env,
      ...this.buildContextEnv(task, execution)
    };

    const timeout = config.timeout || task.options?.timeout || 120000; // Default 2 minutes

    console.error(`[BashExecutor] Executing: ${command}`);
    console.error(`[BashExecutor] CWD: ${cwd}`);
    console.error(`[BashExecutor] Timeout: ${timeout}ms`);

    try {
      const result = await this.executeCommand(command, {
        cwd,
        env,
        timeout,
      });

      const duration = Date.now() - startTime;

      if (result.exitCode === 0) {
        return {
          status: 'success',
          output: result.output,
          exit_code: result.exitCode,
          duration_ms: duration,
        };
      } else {
        return {
          status: 'failure',
          output: result.output,
          error: `Command exited with code ${result.exitCode}`,
          exit_code: result.exitCode,
          duration_ms: duration,
        };
      }
    } catch (error: any) {
      const duration = Date.now() - startTime;

      if (error.code === 'TIMEOUT') {
        return {
          status: 'timeout',
          error: `Command timed out after ${timeout}ms`,
          output: error.output || '',
          duration_ms: duration,
        };
      }

      return {
        status: 'failure',
        error: error.message,
        output: error.output || '',
        duration_ms: duration,
      };
    }
  }

  /**
   * Execute a shell command with spawn
   * @param command - Command to execute
   * @param options - Execution options
   * @returns Command result
   */
  private executeCommand(
    command: string,
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      timeout: number;
    }
  ): Promise<{ output: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const { cwd, env, timeout } = options;

      // Use shell to execute command
      const child = spawn(command, {
        cwd,
        env,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      // Set timeout
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000);
      }, timeout);

      // Collect stdout
      child.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr
      child.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle exit
      child.on('exit', (code, signal) => {
        clearTimeout(timer);

        if (timedOut) {
          const error: any = new Error('Command timed out');
          error.code = 'TIMEOUT';
          error.output = stdout + stderr;
          reject(error);
          return;
        }

        const output = (stdout + stderr).trim();
        const exitCode = code !== null ? code : (signal ? 1 : 0);

        resolve({
          output,
          exitCode,
        });
      });

      // Handle errors
      child.on('error', (error) => {
        clearTimeout(timer);
        const execError: any = new Error(`Failed to execute command: ${error.message}`);
        execError.output = stdout + stderr;
        reject(execError);
      });
    });
  }

  /**
   * Build environment variables from task and execution context
   * @param task - Task being executed
   * @param execution - Execution record with trigger context
   * @returns Environment variable object
   */
  private buildContextEnv(task: Task, execution: Execution): Record<string, string> {
    const env: Record<string, string> = {};

    // Add task metadata
    env.TASK_ID = task.id;
    env.TASK_NAME = task.name;
    env.TASK_TYPE = task.type;

    // Add execution metadata
    env.EXECUTION_ID = execution.id;
    env.TRIGGER_TYPE = execution.trigger_type;

    // Add trigger context variables if available
    if (execution.trigger_context) {
      const context = execution.trigger_context;

      // File path (from hooks or file watch)
      if (context.file_path) {
        env.FILE_PATH = context.file_path;
      }
      if (context.file) {
        env.FILE_PATH = context.file;
      }

      // Event type (from file watch)
      if (context.event) {
        env.EVENT = context.event;
      }

      // Timestamp
      if (context.timestamp) {
        env.TIMESTAMP = context.timestamp;
      }

      // Tool name (from PostToolUse hook)
      if (context.tool_name) {
        env.TOOL_NAME = context.tool_name;
      }

      // Add any other string/number fields from context
      for (const [key, value] of Object.entries(context)) {
        const envKey = key.toUpperCase();
        if (!env[envKey] && (typeof value === 'string' || typeof value === 'number')) {
          env[envKey] = String(value);
        }
      }
    }

    return env;
  }
}

/**
 * % 100 COMPLETE - Bash executor implementation (Day 2)
 */
