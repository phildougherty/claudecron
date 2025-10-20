#!/usr/bin/env node
/**
 * ClaudeCron MCP Server
 *
 * Main entry point for the ClaudeCron MCP server
 * Based on CLAUDE_CRON.md specification lines 1150-1277
 *
 * % 0 COMPLETE - MCP server
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Scheduler } from './scheduler/scheduler.js';
import { StorageFactory } from './storage/factory.js';
import { Storage } from './storage/storage.js';
import { registerTools } from './tools/index.js';
import { ClaudeCronConfig } from './models/types.js';
import { HttpTransportManager } from './transport/http.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * ClaudeCron MCP Server
 *
 * Manages task scheduling and execution via MCP protocol
 */
export class ClaudeCronServer {
  private server: Server;
  private scheduler?: Scheduler;
  private storage?: Storage;
  private transport: 'stdio' | 'http';
  private httpTransportManager?: HttpTransportManager;
  private config?: ClaudeCronConfig;

  constructor(transport: 'stdio' | 'http' = 'stdio') {
    // % 0 COMPLETE - constructor

    this.transport = transport;
    this.server = new Server(
      {
        name: 'claudecron',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // % 100 COMPLETE - constructor
  }

  /**
   * Initialize the server
   * Loads configuration, creates storage, and registers tools
   */
  async initialize(configPath?: string): Promise<void> {
    // % 0 COMPLETE - initialize

    console.error('[ClaudeCron] Initializing...');

    // Load configuration
    this.config = await this.loadConfig(configPath);
    console.error(`[ClaudeCron] Using storage: ${this.config.storage.type} at ${this.config.storage.path || this.config.storage.url}`);

    // Initialize storage
    this.storage = await StorageFactory.create(this.config.storage);
    console.error('[ClaudeCron] Storage initialized');

    // Initialize scheduler
    this.scheduler = new Scheduler(this.storage, this.config.scheduler);
    console.error('[ClaudeCron] Scheduler initialized');

    // Register all MCP tools
    await registerTools(this.server, this.scheduler, this.storage);

    // Start scheduler
    await this.scheduler.start();

    // Initialize HTTP transport if needed
    if (this.transport === 'http') {
      this.httpTransportManager = new HttpTransportManager(this.server, this.config.http);
      console.error('[ClaudeCron] HTTP transport manager initialized');
    }

    console.error('[ClaudeCron] Initialization complete');

    // % 100 COMPLETE - initialize
  }

  /**
   * Start the server
   * Connects to transport and begins accepting requests
   */
  async start(): Promise<void> {
    // % 0 COMPLETE - start

    if (this.transport === 'http') {
      // HTTP transport for remote access
      if (!this.httpTransportManager) {
        throw new Error('HTTP transport manager not initialized. Call initialize() first.');
      }

      await this.httpTransportManager.start();
      console.error('[ClaudeCron] MCP Server started (HTTP)');
    } else {
      // STDIO transport for local process communication
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      console.error('[ClaudeCron] MCP Server started (STDIO)');
    }

    // % 100 COMPLETE - start
  }

  /**
   * Stop the server
   * Cleanup and shutdown
   */
  async stop(): Promise<void> {
    // % 0 COMPLETE - stop

    console.error('[ClaudeCron] Shutting down...');

    if (this.httpTransportManager) {
      await this.httpTransportManager.stop();
    }

    if (this.scheduler) {
      await this.scheduler.stop();
    }

    if (this.storage) {
      await this.storage.close();
    }

    await this.server.close();

    console.error('[ClaudeCron] Shutdown complete');

    // % 100 COMPLETE - stop
  }

  /**
   * Load configuration from file or use defaults
   * Priority: CLI arg > .claude/claudecron.json > ~/.claude/claudecron/config.json > defaults
   */
  private async loadConfig(configPath?: string): Promise<ClaudeCronConfig> {
    // % 0 COMPLETE - loadConfig

    const locations = [
      configPath,
      './.claude/claudecron.json',
      path.join(os.homedir(), '.claude/claudecron/config.json'),
      './claudecron.json', // Legacy location
    ].filter(Boolean) as string[];

    // Try to load from each location
    for (const location of locations) {
      try {
        if (fs.existsSync(location)) {
          const content = fs.readFileSync(location, 'utf-8');
          const config = JSON.parse(content) as ClaudeCronConfig;
          console.error(`[ClaudeCron] Loaded config from: ${location}`);
          return this.validateConfig(config);
        }
      } catch (error: any) {
        console.error(`[ClaudeCron] Warning: Failed to load config from ${location}: ${error.message}`);
      }
    }

    // Return default configuration
    console.error('[ClaudeCron] Using default configuration');
    return this.getDefaultConfig();

    // % 100 COMPLETE - loadConfig
  }

  /**
   * Get default configuration
   */
  private getDefaultConfig(): ClaudeCronConfig {
    return {
      storage: {
        type: 'sqlite',
        path: path.join(os.homedir(), '.claude/claudecron/tasks.db'),
      },
      scheduler: {
        check_interval: '30s',
        default_timezone: 'UTC',
        max_concurrent_tasks: 10,
      },
      transport: 'stdio',
    };
  }

  /**
   * Validate and normalize configuration
   */
  private validateConfig(config: ClaudeCronConfig): ClaudeCronConfig {
    // Ensure required fields
    if (!config.storage) {
      throw new Error('Configuration missing "storage" section');
    }

    if (!config.storage.type) {
      throw new Error('Configuration missing "storage.type"');
    }

    // Set defaults for optional fields
    return {
      ...config,
      scheduler: {
        check_interval: config.scheduler?.check_interval ?? '30s',
        default_timezone: config.scheduler?.default_timezone ?? 'UTC',
        max_concurrent_tasks: config.scheduler?.max_concurrent_tasks ?? 10,
      },
      transport: config.transport ?? 'stdio',
    };
  }
}

/**
 * Main Entry Point
 */
async function main() {
  // % 0 COMPLETE - main

  // Check if being called as CLI tool (with subcommand)
  const subcommand = process.argv[2];

  // Route to CLI handler if hook-event subcommand
  if (subcommand === 'hook-event') {
    // Remove 'hook-event' from argv so hook-event.ts gets correct args
    // Before: [node, server.js, hook-event, event_type, context]
    // After:  [node, server.js, event_type, context]
    process.argv.splice(2, 1);

    // Import and run hook-event CLI (it calls main() on import)
    await import('./cli/hook-event.js');
    return; // hook-event.js handles its own execution
  }

  // Otherwise, start MCP server
  // Determine transport from environment
  const transport = (process.env.CLAUDECRON_TRANSPORT as 'stdio' | 'http') || 'stdio';

  // Get config path from CLI args (if not a subcommand)
  const configPath = process.argv[2];

  // Create and start server
  const server = new ClaudeCronServer(transport);

  try {
    await server.initialize(configPath);
    await server.start();
  } catch (error: any) {
    console.error(`[ClaudeCron] Fatal error: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }

  // Handle shutdown signals
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // % 100 COMPLETE - main
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[ClaudeCron] Unhandled error:', error);
    process.exit(1);
  });
}

/**
 * % 100 COMPLETE - MCP server
 */
