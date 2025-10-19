/**
 * Bash Executor
 *
 * Executes bash commands for bash-type tasks
 *
 * % 100 COMPLETE - Bash executor implementation (Day 2)
 */

import { spawn } from 'child_process';
import { Task, BashTaskConfig } from '../models/types.js';
import { Executor, ExecutionResult } from './factory.js';

/**
 * Bash Executor
 *
 * Executes shell commands with timeout, env, and cwd support
 */
export class BashExecutor implements Executor {
  /**
   * Execute a bash task
   * @param task - Task to execute
   * @param _triggerContext - Context from trigger (not used for bash)
   * @returns Execution result
   */
  async execute(task: Task, _triggerContext?: any): Promise<ExecutionResult> {
    const config = task.task_config as BashTaskConfig;
    const startTime = Date.now();

    if (config.type !== 'bash') {
      throw new Error(`Invalid task config type: ${config.type}, expected 'bash'`);
    }

    // Get configuration
    const command = config.command;
    const cwd = config.cwd || process.cwd();
    const env = { ...process.env, ...config.env };
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
}

/**
 * % 100 COMPLETE - Bash executor implementation (Day 2)
 */
