/**
 * Tool Analytics Module
 *
 * Provides analytics for tool usage across task executions
 * Based on Track 2 Day 3 requirements
 *
 * % 0 COMPLETE - Tool analytics implementation
 */

import { Storage } from '../storage/storage.js';

/**
 * Tool Usage Statistics
 */
export interface ToolUsageStats {
  tool_name: string;
  total_calls: number;
  successful_calls: number;
  failed_calls: number;
  avg_duration_ms: number;
  total_duration_ms: number;
  first_used: string;
  last_used: string;
}

/**
 * ToolAnalytics
 *
 * Analyzes tool usage patterns across task executions
 * Provides insights into most used tools, slowest tools, etc.
 */
export class ToolAnalytics {
  constructor(private storage: Storage) {}

  /**
   * Get tool usage statistics with optional filtering
   * @param taskId - Optional task ID to filter by
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Array of tool usage statistics
   */
  async getToolUsageStats(
    taskId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<ToolUsageStats[]> {
    // Query executions with filters
    const filter: any = {};
    if (taskId) filter.task_id = taskId;
    if (startDate) filter.start_date = startDate;
    if (endDate) filter.end_date = endDate;

    const executions = await this.storage.loadExecutions(filter);

    // Aggregate tool usage
    const stats = new Map<string, ToolUsageStats>();

    for (const execution of executions) {
      if (!execution.tool_calls) continue;

      for (const call of execution.tool_calls) {
        const existing = stats.get(call.tool_name) || {
          tool_name: call.tool_name,
          total_calls: 0,
          successful_calls: 0,
          failed_calls: 0,
          avg_duration_ms: 0,
          total_duration_ms: 0,
          first_used: call.timestamp,
          last_used: call.timestamp
        };

        existing.total_calls++;
        if (call.success) {
          existing.successful_calls++;
        } else {
          existing.failed_calls++;
        }

        if (call.duration_ms) {
          existing.total_duration_ms += call.duration_ms;
        }

        // Update first/last used timestamps
        if (call.timestamp < existing.first_used) {
          existing.first_used = call.timestamp;
        }
        if (call.timestamp > existing.last_used) {
          existing.last_used = call.timestamp;
        }

        stats.set(call.tool_name, existing);
      }
    }

    // Calculate averages
    for (const stat of stats.values()) {
      if (stat.total_calls > 0) {
        stat.avg_duration_ms = stat.total_duration_ms / stat.total_calls;
      }
    }

    return Array.from(stats.values());
  }

  /**
   * Get the most frequently used tools
   * @param limit - Number of tools to return (default: 10)
   * @param taskId - Optional task ID to filter by
   * @returns Array of tool usage stats sorted by total calls
   */
  async getMostUsedTools(limit: number = 10, taskId?: string): Promise<ToolUsageStats[]> {
    const stats = await this.getToolUsageStats(taskId);
    return stats
      .sort((a, b) => b.total_calls - a.total_calls)
      .slice(0, limit);
  }

  /**
   * Get the slowest tools by average duration
   * @param limit - Number of tools to return (default: 10)
   * @param taskId - Optional task ID to filter by
   * @returns Array of tool usage stats sorted by average duration
   */
  async getSlowestTools(limit: number = 10, taskId?: string): Promise<ToolUsageStats[]> {
    const stats = await this.getToolUsageStats(taskId);
    return stats
      .filter(s => s.avg_duration_ms > 0)
      .sort((a, b) => b.avg_duration_ms - a.avg_duration_ms)
      .slice(0, limit);
  }

  /**
   * Get tools with the highest failure rate
   * @param limit - Number of tools to return (default: 10)
   * @param taskId - Optional task ID to filter by
   * @returns Array of tool usage stats sorted by failure rate
   */
  async getToolsWithHighestFailureRate(limit: number = 10, taskId?: string): Promise<ToolUsageStats[]> {
    const stats = await this.getToolUsageStats(taskId);
    return stats
      .map(s => ({
        ...s,
        failure_rate: s.total_calls > 0 ? s.failed_calls / s.total_calls : 0
      }))
      .filter(s => s.total_calls > 0)
      .sort((a, b) => b.failure_rate - a.failure_rate)
      .slice(0, limit);
  }

  /**
   * Get overall tool usage summary
   * @param taskId - Optional task ID to filter by
   * @param startDate - Optional start date (ISO 8601)
   * @param endDate - Optional end date (ISO 8601)
   * @returns Summary of tool usage
   */
  async getToolUsageSummary(
    taskId?: string,
    startDate?: string,
    endDate?: string
  ): Promise<{
    total_tool_calls: number;
    unique_tools: number;
    most_used_tool: string | null;
    success_rate: number;
    avg_tool_duration_ms: number;
  }> {
    const stats = await this.getToolUsageStats(taskId, startDate, endDate);

    if (stats.length === 0) {
      return {
        total_tool_calls: 0,
        unique_tools: 0,
        most_used_tool: null,
        success_rate: 0,
        avg_tool_duration_ms: 0
      };
    }

    const totalCalls = stats.reduce((sum, s) => sum + s.total_calls, 0);
    const totalSuccessful = stats.reduce((sum, s) => sum + s.successful_calls, 0);
    const totalDuration = stats.reduce((sum, s) => sum + s.total_duration_ms, 0);

    const mostUsed = stats.reduce((prev, curr) =>
      curr.total_calls > prev.total_calls ? curr : prev
    );

    return {
      total_tool_calls: totalCalls,
      unique_tools: stats.length,
      most_used_tool: mostUsed.tool_name,
      success_rate: totalCalls > 0 ? (totalSuccessful / totalCalls) * 100 : 0,
      avg_tool_duration_ms: totalCalls > 0 ? totalDuration / totalCalls : 0
    };
  }

  /**
   * Get tool usage over time (aggregated by day)
   * @param toolName - Tool name to analyze
   * @param startDate - Start date (ISO 8601)
   * @param endDate - End date (ISO 8601)
   * @returns Array of daily usage statistics
   */
  async getToolUsageOverTime(
    toolName: string,
    startDate?: string,
    endDate?: string
  ): Promise<Array<{ date: string; calls: number; successes: number; failures: number }>> {
    const filter: any = {};
    if (startDate) filter.start_date = startDate;
    if (endDate) filter.end_date = endDate;

    const executions = await this.storage.loadExecutions(filter);

    const dailyStats = new Map<string, { calls: number; successes: number; failures: number }>();

    for (const execution of executions) {
      if (!execution.tool_calls) continue;

      const dateParts = execution.started_at.split('T');
      const date = dateParts[0] || execution.started_at; // Extract date part or use full timestamp

      for (const call of execution.tool_calls) {
        if (call.tool_name !== toolName) continue;

        const existing = dailyStats.get(date) || { calls: 0, successes: 0, failures: 0 };
        existing.calls++;
        if (call.success) {
          existing.successes++;
        } else {
          existing.failures++;
        }

        dailyStats.set(date, existing);
      }
    }

    return Array.from(dailyStats.entries())
      .map(([date, stats]) => ({ date, ...stats }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}

/**
 * % 100 COMPLETE - Tool analytics implementation
 */
