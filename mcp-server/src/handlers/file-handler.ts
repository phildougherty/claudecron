/**
 * File Handler
 *
 * Writes task execution results to files with support for:
 * - Append vs overwrite mode
 * - Multiple formats (text, json, markdown)
 * - Template variables in file paths
 * - Automatic directory creation
 */

import * as fs from 'fs';
import * as path from 'path';
import { Task, Execution, FileHandler as FileHandlerConfig } from '../models/types.js';
import { replaceTemplateVariables } from './template-variables.js';

export class FileHandler {
  /**
   * Execute file handler - write task output to a file
   *
   * @param handler - File handler configuration
   * @param task - Task that was executed
   * @param execution - Execution record with results
   */
  async execute(
    handler: FileHandlerConfig,
    task: Task,
    execution: Execution
  ): Promise<void> {
    // Replace template variables in file path
    const filePath = replaceTemplateVariables(handler.path, task, execution);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      console.error(`[FileHandler] Created directory: ${dir}`);
    }

    // Format output based on specified format
    const content = this.formatOutput(
      execution.output || '',
      handler.format || 'text',
      task,
      execution
    );

    // Write or append to file
    try {
      if (handler.append) {
        fs.appendFileSync(filePath, content + '\n');
        console.error(`[FileHandler] Appended to file: ${filePath}`);
      } else {
        fs.writeFileSync(filePath, content);
        console.error(`[FileHandler] Wrote to file: ${filePath}`);
      }
    } catch (error: any) {
      console.error(`[FileHandler] Failed to write file ${filePath}:`, error.message);
      throw error;
    }
  }

  /**
   * Format output based on specified format
   *
   * @param output - Raw task output
   * @param format - Output format (text, json, markdown)
   * @param task - Task object
   * @param execution - Execution object
   * @returns Formatted output string
   */
  private formatOutput(
    output: string,
    format: 'text' | 'json' | 'markdown',
    task: Task,
    execution: Execution
  ): string {
    switch (format) {
      case 'json':
        return this.formatAsJson(output, task, execution);

      case 'markdown':
        return this.formatAsMarkdown(output, task, execution);

      case 'text':
      default:
        return output;
    }
  }

  /**
   * Format output as JSON with metadata
   *
   * @param output - Raw task output
   * @param task - Task object
   * @param execution - Execution object
   * @returns JSON-formatted string
   */
  private formatAsJson(
    output: string,
    task: Task,
    execution: Execution
  ): string {
    const data = {
      task_id: task.id,
      task_name: task.name,
      task_type: task.type,
      execution_id: execution.id,
      status: execution.status,
      trigger_type: execution.trigger_type,
      started_at: execution.started_at,
      completed_at: execution.completed_at,
      duration_ms: execution.duration_ms,
      output: output,
      error: execution.error,
      exit_code: execution.exit_code,
      sdk_usage: execution.sdk_usage,
      cost_usd: execution.cost_usd,
      tool_calls: execution.tool_calls?.length || 0,
    };

    return JSON.stringify(data, null, 2);
  }

  /**
   * Format output as Markdown with metadata
   *
   * @param output - Raw task output
   * @param task - Task object
   * @param execution - Execution object
   * @returns Markdown-formatted string
   */
  private formatAsMarkdown(
    output: string,
    task: Task,
    execution: Execution
  ): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Task Execution: ${task.name}`);
    lines.push('');

    // Metadata
    lines.push('## Metadata');
    lines.push('');
    lines.push(`- **Task ID**: \`${task.id}\``);
    lines.push(`- **Task Type**: ${task.type}`);
    lines.push(`- **Execution ID**: \`${execution.id}\``);
    lines.push(`- **Status**: ${this.formatStatus(execution.status)}`);
    lines.push(`- **Trigger**: ${execution.trigger_type}`);
    lines.push(`- **Started**: ${execution.started_at}`);
    lines.push(`- **Completed**: ${execution.completed_at || 'N/A'}`);
    lines.push(`- **Duration**: ${execution.duration_ms || 0}ms`);

    if (execution.exit_code !== undefined) {
      lines.push(`- **Exit Code**: ${execution.exit_code}`);
    }

    if (execution.cost_usd) {
      lines.push(`- **Cost**: $${execution.cost_usd.toFixed(4)}`);
    }

    lines.push('');

    // Output section
    if (output) {
      lines.push('## Output');
      lines.push('');
      lines.push('```');
      lines.push(output);
      lines.push('```');
      lines.push('');
    }

    // Error section (if failed)
    if (execution.error) {
      lines.push('## Error');
      lines.push('');
      lines.push('```');
      lines.push(execution.error);
      lines.push('```');
      lines.push('');
    }

    // Tool calls summary
    if (execution.tool_calls && execution.tool_calls.length > 0) {
      lines.push('## Tool Calls');
      lines.push('');
      lines.push(`Total tools used: ${execution.tool_calls.length}`);
      lines.push('');

      for (const toolCall of execution.tool_calls) {
        lines.push(`- **${toolCall.tool_name}** - ${toolCall.success ? 'Success' : 'Failed'} (${toolCall.duration_ms || 0}ms)`);
      }

      lines.push('');
    }

    // SDK usage (if AI task)
    if (execution.sdk_usage) {
      lines.push('## SDK Usage');
      lines.push('');
      lines.push(`- **Input Tokens**: ${execution.sdk_usage.input_tokens}`);
      lines.push(`- **Output Tokens**: ${execution.sdk_usage.output_tokens}`);
      if (execution.sdk_usage.cache_creation_input_tokens) {
        lines.push(`- **Cache Creation**: ${execution.sdk_usage.cache_creation_input_tokens}`);
      }
      if (execution.sdk_usage.cache_read_input_tokens) {
        lines.push(`- **Cache Reads**: ${execution.sdk_usage.cache_read_input_tokens}`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format status with emoji for markdown
   *
   * @param status - Execution status
   * @returns Formatted status string
   */
  private formatStatus(status: string): string {
    switch (status) {
      case 'success':
        return 'Success';
      case 'failure':
        return 'Failed';
      case 'timeout':
        return 'Timeout';
      case 'cancelled':
        return 'Cancelled';
      case 'skipped':
        return 'Skipped';
      default:
        return status;
    }
  }
}
