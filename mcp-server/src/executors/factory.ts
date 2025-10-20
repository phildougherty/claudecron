/**
 * Executor Factory
 *
 * Creates executors for different task types
 *
 * Two executor types:
 * - BashExecutor: Shell command execution
 * - SubagentExecutor: All Claude SDK-based tasks (ai_prompt, sdk_query, subagent, slash_command, tool_call)
 */

import { Task, Execution } from '../models/types.js';
import { BashExecutor } from './bash-executor.js';
import { SubagentExecutor } from './subagent-executor.js';

/**
 * Executor Interface
 *
 * Base interface for all task executors
 */
export interface Executor {
  /**
   * Execute a task
   * @param task - Task to execute
   * @param execution - Execution record with trigger context, status, etc.
   * @returns Execution result
   */
  execute(task: Task, execution: Execution): Promise<ExecutionResult>;
}

/**
 * Execution Result
 *
 * Result of task execution
 */
export interface ExecutionResult {
  status: 'success' | 'failure' | 'timeout' | 'cancelled';
  output?: string;
  error?: string;
  exit_code?: number;
  duration_ms: number;
  thinking_output?: string;
  tool_calls?: any[];
  tool_usage_summary?: {
    total_tools_used: number;
    unique_tools: string[];
    most_used_tool: string;
  };
  sdk_usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  cost_usd?: number;
}

/**
 * Executor Factory
 *
 * Creates appropriate executor for a task type
 */
export class ExecutorFactory {
  /**
   * Create an executor for a task
   * @param task - Task to execute
   * @param storage - Optional storage instance for streaming support
   * @returns Appropriate executor instance
   */
  static createExecutor(task: Task, storage?: any): Executor {
    if (task.type === 'bash') {
      return new BashExecutor();
    }

    if (task.type === 'subagent') {
      return new SubagentExecutor(storage);
    }

    throw new Error(
      `Unsupported task type: ${task.type}. ` +
      `Supported types: bash, subagent`
    );
  }
}
