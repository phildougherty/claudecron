/**
 * Executor Factory
 *
 * Creates and manages task executors
 * Full implementation will be in Day 2-4 (Backend Agent + AI Agent)
 *
 * % 70 COMPLETE - Executor factory with SDK and Bash support
 */

import { Task } from '../models/types.js';
import { SDKExecutor } from './sdk-executor.js';
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
   * @param triggerContext - Context from trigger (hook data, etc.)
   * @returns Execution result
   */
  execute(task: Task, triggerContext?: any): Promise<ExecutionResult>;
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
 * This is a stub for Day 1 - full implementation in Day 2-4
 */
export class ExecutorFactory {
  /**
   * Create an executor for a task
   * @param task - Task to execute
   * @param storage - Optional storage instance for streaming support
   * @returns Appropriate executor instance
   */
  static createExecutor(task: Task, storage?: any): Executor {
    // % 70 COMPLETE - createExecutor with SDK and Bash support

    // Handle bash tasks
    if (task.type === 'bash') {
      return new BashExecutor();
    }

    // Handle AI prompt and SDK query tasks
    if (task.type === 'ai_prompt' || task.type === 'sdk_query') {
      return new SDKExecutor(storage);
    }

    // Handle subagent tasks (stub for Day 4)
    if (task.type === 'subagent') {
      return new SubagentExecutor();
    }

    // TODO Day 3: Implement SlashCommandExecutor
    // TODO Day 4: Implement ToolCallExecutor

    // For other types, return a stub executor
    return new StubExecutor(task.type);

    // % 70 COMPLETE - createExecutor with SDK and Bash support
  }
}

/**
 * Stub Executor
 *
 * Placeholder executor for Day 1
 * Returns success with stub data
 */
class StubExecutor implements Executor {
  private taskType: string;

  constructor(taskType: string) {
    this.taskType = taskType;
  }

  async execute(task: Task, _triggerContext?: any): Promise<ExecutionResult> {
    console.error(`[StubExecutor] Executing ${this.taskType} task: ${task.name}`);

    // Simulate execution delay
    await new Promise(resolve => setTimeout(resolve, 100));

    return {
      status: 'success',
      output: `Stub execution of ${this.taskType} task: ${task.name}`,
      duration_ms: 100,
    };
  }
}

/**
 * % 70 COMPLETE - Executor factory with SDK and Bash support
 */
