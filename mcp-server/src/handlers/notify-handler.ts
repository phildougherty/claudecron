/**
 * Notify Handler
 *
 * Sends notifications about task execution results
 * Currently implements console logging, designed to be extensible for:
 * - Desktop notifications (node-notifier)
 * - Email notifications (nodemailer)
 * - Slack/Discord webhooks
 * - SMS notifications
 */

import { Task, Execution, NotifyHandler as NotifyHandlerConfig } from '../models/types.js';
import { replaceTemplateVariables } from './template-variables.js';

export class NotifyHandler {
  /**
   * Execute notify handler - send notification about task result
   *
   * @param handler - Notify handler configuration
   * @param task - Task that was executed
   * @param execution - Execution record with results
   */
  async execute(
    handler: NotifyHandlerConfig,
    task: Task,
    execution: Execution
  ): Promise<void> {
    // Replace template variables in message
    const message = replaceTemplateVariables(handler.message, task, execution);
    const urgency = handler.urgency || 'medium';

    // Log to console (primary implementation)
    this.logToConsole(message, urgency, task, execution);

    // Future extension points:
    // - Desktop notifications: Install node-notifier and implement sendDesktopNotification()
    // - Email notifications: Install nodemailer and implement sendEmailNotification()
    // - Chat notifications: Implement sendSlackNotification() or sendDiscordNotification()
    // See git history for example implementations
  }

  /**
   * Log notification to console (stderr)
   *
   * @param message - Notification message
   * @param urgency - Urgency level
   * @param task - Task object
   * @param execution - Execution object
   */
  private logToConsole(
    message: string,
    urgency: 'low' | 'medium' | 'high',
    task: Task,
    execution: Execution
  ): void {
    const prefix = this.getUrgencyPrefix(urgency);
    const timestamp = new Date().toISOString();

    // Format notification message
    const logMessage = [
      `[${timestamp}] ${prefix} NOTIFICATION [${urgency.toUpperCase()}]`,
      `Task: ${task.name} (${task.id})`,
      `Status: ${execution.status}`,
      `Message: ${message}`,
    ].join('\n  ');

    // Write to stderr so it appears in logs but doesn't interfere with stdout
    console.error(logMessage);
  }

  /**
   * Get prefix based on urgency level
   *
   * @param urgency - Urgency level
   * @returns Prefix string
   */
  private getUrgencyPrefix(urgency: 'low' | 'medium' | 'high'): string {
    switch (urgency) {
      case 'high':
        return '!!!';
      case 'low':
        return '-';
      case 'medium':
      default:
        return '!';
    }
  }
}
