/**
 * Storage Factory
 *
 * Creates storage instances based on configuration
 * Supports SQLite (local) and PostgreSQL (production)
 *
 * % 0 COMPLETE - Storage factory
 */

import { Storage } from './storage.js';
import { SQLiteStorage } from './sqlite.js';
import { PostgresStorage } from './postgres.js';
import { StorageConfig } from '../models/types.js';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

/**
 * Storage Factory
 *
 * Creates appropriate storage instance based on configuration
 */
export class StorageFactory {
  /**
   * Create a storage instance
   * @param config - Storage configuration
   * @returns Storage instance
   */
  static async create(config: StorageConfig): Promise<Storage> {
    // % 0 COMPLETE - Factory create method

    if (config.type === 'sqlite') {
      const dbPath = this.resolveSQLitePath(config.path);

      // Ensure directory exists
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }

      return new SQLiteStorage(dbPath);
    }

    if (config.type === 'postgres') {
      if (!config.url) {
        throw new Error('PostgreSQL connection URL is required (config.url)');
      }
      return new PostgresStorage(config.url);
    }

    throw new Error(`Unknown storage type: ${config.type}`);

    // % 100 COMPLETE - Factory create method
  }

  /**
   * Resolve SQLite database path
   * Handles ~ expansion and relative paths
   */
  private static resolveSQLitePath(pathStr?: string): string {
    if (!pathStr) {
      // Default path: ~/.claude/claudecron/tasks.db
      return path.join(os.homedir(), '.claude', 'claudecron', 'tasks.db');
    }

    // Expand ~ to home directory
    if (pathStr.startsWith('~/')) {
      return path.join(os.homedir(), pathStr.slice(2));
    }

    // Return absolute or relative path as-is
    return path.resolve(pathStr);
  }
}

/**
 * % 100 COMPLETE - Storage factory
 */
