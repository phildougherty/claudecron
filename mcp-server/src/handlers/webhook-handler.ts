/**
 * Webhook Handler
 *
 * Posts task execution results to webhook URLs
 * Supports:
 * - POST and PUT methods
 * - Custom headers
 * - Template variables in URLs
 * - Automatic retry on failure
 * - Timeout handling
 */

import { Task, Execution, WebhookHandler as WebhookHandlerConfig } from '../models/types.js';
import { replaceTemplateVariables } from './template-variables.js';

export class WebhookHandler {
  private readonly DEFAULT_TIMEOUT = 30000; // 30 seconds
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second

  /**
   * Execute webhook handler - POST/PUT task results to a URL
   *
   * @param handler - Webhook handler configuration
   * @param task - Task that was executed
   * @param execution - Execution record with results
   */
  async execute(
    handler: WebhookHandlerConfig,
    task: Task,
    execution: Execution
  ): Promise<void> {
    // Replace template variables in URL
    const url = replaceTemplateVariables(handler.url, task, execution);
    const method = handler.method || 'POST';

    // Build headers
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'ClaudeCron/2.0',
      ...handler.headers,
    };

    // Build payload
    const payload = this.buildPayload(task, execution);

    // Send webhook with retry
    await this.sendWithRetry(url, method, headers, payload);
  }

  /**
   * Build webhook payload from task and execution data
   *
   * @param task - Task object
   * @param execution - Execution object
   * @returns Payload object
   */
  private buildPayload(task: Task, execution: Execution): Record<string, any> {
    return {
      // Event metadata
      event: 'task_completed',
      timestamp: new Date().toISOString(),

      // Task information
      task: {
        id: task.id,
        name: task.name,
        type: task.type,
        description: task.description,
      },

      // Execution information
      execution: {
        id: execution.id,
        status: execution.status,
        started_at: execution.started_at,
        completed_at: execution.completed_at,
        duration_ms: execution.duration_ms,
        trigger_type: execution.trigger_type,
        trigger_context: execution.trigger_context,
      },

      // Results
      result: {
        output: execution.output,
        error: execution.error,
        exit_code: execution.exit_code,
        output_truncated: execution.output_truncated,
      },

      // AI/SDK specific data (if available)
      sdk_usage: execution.sdk_usage,
      cost_usd: execution.cost_usd,
      thinking_output: execution.thinking_output,

      // Tool usage summary (if available)
      tool_calls: execution.tool_calls?.map(tc => ({
        tool_name: tc.tool_name,
        success: tc.success,
        duration_ms: tc.duration_ms,
        timestamp: tc.timestamp,
      })),
    };
  }

  /**
   * Send webhook with automatic retry
   *
   * @param url - Webhook URL
   * @param method - HTTP method
   * @param headers - Request headers
   * @param payload - Request payload
   */
  private async sendWithRetry(
    url: string,
    method: 'POST' | 'PUT',
    headers: Record<string, string>,
    payload: Record<string, any>
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      try {
        await this.sendWebhook(url, method, headers, payload);
        console.error(`[WebhookHandler] Successfully sent ${method} to ${url}`);
        return; // Success - exit retry loop
      } catch (error: any) {
        lastError = error;
        console.error(
          `[WebhookHandler] Attempt ${attempt}/${this.MAX_RETRIES} failed for ${url}: ${error.message}`
        );

        // If not last attempt, wait before retrying
        if (attempt < this.MAX_RETRIES) {
          await this.sleep(this.RETRY_DELAY * attempt); // Exponential backoff
        }
      }
    }

    // All retries failed
    throw new Error(
      `Webhook failed after ${this.MAX_RETRIES} attempts: ${lastError?.message}`
    );
  }

  /**
   * Send webhook request
   *
   * @param url - Webhook URL
   * @param method - HTTP method
   * @param headers - Request headers
   * @param payload - Request payload
   */
  private async sendWebhook(
    url: string,
    method: 'POST' | 'PUT',
    headers: Record<string, string>,
    payload: Record<string, any>
  ): Promise<void> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.DEFAULT_TIMEOUT);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Try to get error body
        let errorBody = '';
        try {
          errorBody = await response.text();
        } catch {
          // Ignore error reading body
        }

        throw new Error(
          `HTTP ${response.status} ${response.statusText}${errorBody ? ': ' + errorBody : ''}`
        );
      }

      // Log response status
      console.error(
        `[WebhookHandler] Webhook response: ${response.status} ${response.statusText}`
      );
    } catch (error: any) {
      clearTimeout(timeoutId);

      if (error.name === 'AbortError') {
        throw new Error(`Webhook request timed out after ${this.DEFAULT_TIMEOUT}ms`);
      }

      throw error;
    }
  }

  /**
   * Sleep for specified milliseconds
   *
   * @param ms - Milliseconds to sleep
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
