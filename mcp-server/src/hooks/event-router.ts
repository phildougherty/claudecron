/**
 * Hook Event Router
 *
 * Routes Claude Code hook events to the Hook Manager
 *
 * % 0 COMPLETE - Hook Event Router implementation
 */

import { HookEvent } from '../models/types.js';
import { HookManager, HookContext } from '../scheduler/hook-manager.js';

/**
 * Hook Event Router
 *
 * Parses and routes hook events from Claude Code to the Hook Manager
 */
export class HookEventRouter {
  private hookManager: HookManager;

  constructor(hookManager: HookManager) {
    this.hookManager = hookManager;
  }

  /**
   * Route a hook event to the appropriate handler
   *
   * @param eventType - Hook event type
   * @param eventData - Event data as JSON string
   */
  async routeEvent(eventType: string, eventData: string): Promise<void> {
    try {
      // Parse event data
      const context = JSON.parse(eventData) as HookContext;
      const event = eventType as HookEvent;

      // Validate event type
      if (!this.isValidHookEvent(event)) {
        console.error(`[HookEventRouter] Invalid hook event type: ${eventType}`);
        return;
      }

      // Ensure context has required fields
      context.event = event;
      if (!context.timestamp) {
        context.timestamp = new Date().toISOString();
      }

      // Route to hook manager
      await this.hookManager.handleHookEvent(event, context);
    } catch (error) {
      console.error(`[HookEventRouter] Error routing event:`, error);
    }
  }

  /**
   * Route a hook event with object context
   *
   * @param eventType - Hook event type
   * @param contextData - Event context as object
   */
  async routeEventObject(eventType: string, contextData: any): Promise<void> {
    try {
      const event = eventType as HookEvent;

      // Validate event type
      if (!this.isValidHookEvent(event)) {
        console.error(`[HookEventRouter] Invalid hook event type: ${eventType}`);
        return;
      }

      // Build context
      const context: HookContext = {
        event,
        timestamp: contextData.timestamp || new Date().toISOString(),
        ...contextData
      };

      // Route to hook manager
      await this.hookManager.handleHookEvent(event, context);
    } catch (error) {
      console.error(`[HookEventRouter] Error routing event:`, error);
    }
  }

  /**
   * Validate hook event type
   *
   * @param event - Event type to validate
   * @returns True if valid hook event
   */
  private isValidHookEvent(event: string): event is HookEvent {
    const validEvents: HookEvent[] = [
      'SessionStart',
      'SessionEnd',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Notification',
      'Stop',
      'SubagentStop',
      'PreCompact'
    ];
    return validEvents.includes(event as HookEvent);
  }
}

/**
 * % 100 COMPLETE - Hook Event Router implementation
 */
