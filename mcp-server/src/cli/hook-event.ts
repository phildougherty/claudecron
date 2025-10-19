#!/usr/bin/env node

/**
 * ClaudeCron Hook Event CLI
 *
 * Processes hook events from Claude Code hooks
 * Usage: claudecron hook-event <event_type> <context_json>
 */

import { HookManager } from '../scheduler/hook-manager.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { StorageFactory } from '../storage/factory.js';
import * as readline from 'readline';

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,
    });

    rl.on('line', (line) => {
      data += line;
    });

    rl.on('close', () => {
      resolve(data);
    });
  });
}

async function main() {
  const eventType = process.argv[2];
  let contextJson = process.argv[3] || '{}';

  if (!eventType) {
    console.error('Usage: claudecron hook-event <event_type> <context_json>');
    console.error('       echo <context_json> | claudecron hook-event <event_type>');
    process.exit(1);
  }

  try {
    // Try to read from stdin if no context provided
    if (contextJson === '{}' && !process.stdin.isTTY) {
      const stdinData = await readStdin();
      if (stdinData.trim()) {
        contextJson = stdinData.trim();
      }
    }

    // Parse context
    const context = JSON.parse(contextJson);

    // Initialize storage and scheduler
    const storage = await StorageFactory.create({ type: 'sqlite' });
    const scheduler = new Scheduler(storage, {});

    // Create hook manager with scheduler access
    const hookManager = new HookManager(scheduler);

    // Handle event
    await hookManager.handleHookEvent(eventType as any, context);

    console.error(`[ClaudeCron] Hook event ${eventType} processed successfully`);
    process.exit(0);
  } catch (error: any) {
    console.error(`[ClaudeCron] Error processing hook event:`, error.message);
    if (process.env.CLAUDECRON_DEBUG === '1') {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
