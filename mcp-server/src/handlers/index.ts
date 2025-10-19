/**
 * Result Handlers Index
 *
 * Exports all handler implementations and provides factory pattern
 * for creating handler instances
 */

export { FileHandler } from './file-handler.js';
export { NotifyHandler } from './notify-handler.js';
export { WebhookHandler } from './webhook-handler.js';
export { TriggerTaskHandler } from './trigger-task-handler.js';
export { RetryHandler } from './retry-handler.js';
export { replaceTemplateVariables, hasTemplateVariables, extractTemplateVariables } from './template-variables.js';

import { FileHandler } from './file-handler.js';
import { NotifyHandler } from './notify-handler.js';
import { WebhookHandler } from './webhook-handler.js';
import { TriggerTaskHandler } from './trigger-task-handler.js';
import { RetryHandler } from './retry-handler.js';

/**
 * Result Handler Factory
 *
 * Creates and manages handler instances with proper initialization
 */
export class ResultHandlerFactory {
  private fileHandler: FileHandler;
  private notifyHandler: NotifyHandler;
  private webhookHandler: WebhookHandler;
  private triggerTaskHandler: TriggerTaskHandler;
  private retryHandler: RetryHandler;

  constructor(scheduler?: any) {
    // Create handler instances
    this.fileHandler = new FileHandler();
    this.notifyHandler = new NotifyHandler();
    this.webhookHandler = new WebhookHandler();
    this.triggerTaskHandler = new TriggerTaskHandler();
    this.retryHandler = new RetryHandler();

    // Set scheduler reference for handlers that need it
    if (scheduler) {
      this.setScheduler(scheduler);
    }
  }

  /**
   * Set scheduler reference on handlers that need it
   *
   * @param scheduler - Scheduler instance
   */
  setScheduler(scheduler: any): void {
    this.triggerTaskHandler.setScheduler(scheduler);
    this.retryHandler.setScheduler(scheduler);
  }

  /**
   * Get file handler instance
   */
  getFileHandler(): FileHandler {
    return this.fileHandler;
  }

  /**
   * Get notify handler instance
   */
  getNotifyHandler(): NotifyHandler {
    return this.notifyHandler;
  }

  /**
   * Get webhook handler instance
   */
  getWebhookHandler(): WebhookHandler {
    return this.webhookHandler;
  }

  /**
   * Get trigger task handler instance
   */
  getTriggerTaskHandler(): TriggerTaskHandler {
    return this.triggerTaskHandler;
  }

  /**
   * Get retry handler instance
   */
  getRetryHandler(): RetryHandler {
    return this.retryHandler;
  }
}
