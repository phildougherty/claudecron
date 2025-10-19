/**
 * Result Handler Executor
 *
 * Handles all result actions (on_success/on_failure handlers)
 *
 * % 100 COMPLETE - Result Handlers (Day 3)
 */

import {
  Task,
  Execution,
  ResultHandler,
  NotifyHandler as NotifyHandlerType,
  FileHandler as FileHandlerType,
  WebhookHandler as WebhookHandlerType,
  TriggerTaskHandler as TriggerTaskHandlerType,
  RetryHandler as RetryHandlerType,
} from '../models/types.js';
import { ResultHandlerFactory } from '../handlers/index.js';

export class ResultHandlerExecutor {
  private handlerFactory: ResultHandlerFactory;

  constructor() {
    this.handlerFactory = new ResultHandlerFactory();
  }

  /**
   * Set scheduler reference (to avoid circular dependency)
   */
  setScheduler(scheduler: any): void {
    this.handlerFactory.setScheduler(scheduler);
  }

  /**
   * Execute a result handler
   */
  async executeHandler(
    handler: ResultHandler,
    task: Task,
    execution: Execution
  ): Promise<void> {
    try {
      switch (handler.type) {
        case 'notify':
          await this.handlerFactory.getNotifyHandler().execute(
            handler as NotifyHandlerType,
            task,
            execution
          );
          break;

        case 'file':
          await this.handlerFactory.getFileHandler().execute(
            handler as FileHandlerType,
            task,
            execution
          );
          break;

        case 'webhook':
          await this.handlerFactory.getWebhookHandler().execute(
            handler as WebhookHandlerType,
            task,
            execution
          );
          break;

        case 'trigger_task':
          await this.handlerFactory.getTriggerTaskHandler().execute(
            handler as TriggerTaskHandlerType,
            task,
            execution
          );
          break;

        case 'retry':
          await this.handlerFactory.getRetryHandler().execute(
            handler as RetryHandlerType,
            task,
            execution
          );
          break;

        default:
          console.error(
            `[ResultHandler] Unknown handler type: ${(handler as any).type}`
          );
      }
    } catch (error: any) {
      console.error(
        `[ResultHandler] Handler failed for task ${task.name}:`,
        error.message
      );
      throw error;
    }
  }
}

/**
 * % 100 COMPLETE - Result Handlers (Day 3)
 */
