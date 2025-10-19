/**
 * Storage Factory Unit Tests
 *
 * Tests for storage factory creation and path resolution
 */

import { describe, it, expect, afterEach } from 'vitest';
import { StorageFactory } from '../../../src/storage/factory.js';
import { SQLiteStorage } from '../../../src/storage/sqlite.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('StorageFactory', () => {
  const testPaths: string[] = [];

  afterEach(async () => {
    // Cleanup test databases
    for (const dbPath of testPaths) {
      if (fs.existsSync(dbPath)) {
        // Close any open connections first
        try {
          fs.unlinkSync(dbPath);
        } catch (error) {
          // Ignore errors on cleanup
        }
      }
    }
    testPaths.length = 0;
  });

  describe('SQLite Storage Creation', () => {
    it('should create SQLite storage with default path', async () => {
      const storage = await StorageFactory.create({ type: 'sqlite' });

      expect(storage).toBeInstanceOf(SQLiteStorage);

      const defaultPath = path.join(os.homedir(), '.claude', 'claudecron', 'tasks.db');
      expect(fs.existsSync(defaultPath)).toBe(true);

      testPaths.push(defaultPath);
      await storage.close();
    });

    it('should create SQLite storage with custom absolute path', async () => {
      const customPath = path.join('/tmp', `test-${Date.now()}.db`);
      const storage = await StorageFactory.create({
        type: 'sqlite',
        path: customPath
      });

      expect(storage).toBeInstanceOf(SQLiteStorage);
      expect(fs.existsSync(customPath)).toBe(true);

      testPaths.push(customPath);
      await storage.close();
    });

    it('should create SQLite storage with tilde path expansion', async () => {
      const relativePath = `~/test-claudecron-${Date.now()}.db`;
      const storage = await StorageFactory.create({
        type: 'sqlite',
        path: relativePath
      });

      const expectedPath = path.join(os.homedir(), relativePath.slice(2));
      expect(fs.existsSync(expectedPath)).toBe(true);

      testPaths.push(expectedPath);
      await storage.close();
    });

    it('should create SQLite storage with relative path', async () => {
      const relativePath = `./test-${Date.now()}.db`;
      const storage = await StorageFactory.create({
        type: 'sqlite',
        path: relativePath
      });

      const expectedPath = path.resolve(relativePath);
      expect(fs.existsSync(expectedPath)).toBe(true);

      testPaths.push(expectedPath);
      await storage.close();
    });

    it('should create parent directories if they do not exist', async () => {
      const nestedPath = path.join('/tmp', `test-${Date.now()}`, 'nested', 'path', 'db.sqlite');
      const storage = await StorageFactory.create({
        type: 'sqlite',
        path: nestedPath
      });

      expect(fs.existsSync(nestedPath)).toBe(true);
      expect(fs.existsSync(path.dirname(nestedPath))).toBe(true);

      testPaths.push(nestedPath);
      await storage.close();

      // Cleanup nested directories
      const topDir = path.join('/tmp', path.basename(path.dirname(path.dirname(path.dirname(nestedPath)))));
      if (fs.existsSync(topDir)) {
        fs.rmSync(topDir, { recursive: true });
      }
    });
  });

  describe('PostgreSQL Storage Creation', () => {
    it('should throw error for PostgreSQL (not yet implemented)', async () => {
      await expect(
        StorageFactory.create({
          type: 'postgres',
          url: 'postgresql://localhost/test'
        })
      ).rejects.toThrow('PostgreSQL storage not yet implemented');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unknown storage type', async () => {
      await expect(
        StorageFactory.create({ type: 'unknown' } as any)
      ).rejects.toThrow('Unknown storage type');
    });
  });

  describe('Path Resolution Edge Cases', () => {
    it('should handle paths with special characters', async () => {
      const specialPath = path.join('/tmp', `test-special-chars-${Date.now()}`, 'db-file.db');
      const storage = await StorageFactory.create({
        type: 'sqlite',
        path: specialPath
      });

      expect(fs.existsSync(specialPath)).toBe(true);

      testPaths.push(specialPath);
      await storage.close();

      // Cleanup parent dir
      const parentDir = path.dirname(specialPath);
      if (fs.existsSync(parentDir)) {
        fs.rmSync(parentDir, { recursive: true });
      }
    });

    it('should handle paths with spaces', async () => {
      const spacePath = path.join('/tmp', `test space ${Date.now()}`, 'db file.db');
      const storage = await StorageFactory.create({
        type: 'sqlite',
        path: spacePath
      });

      expect(fs.existsSync(spacePath)).toBe(true);

      testPaths.push(spacePath);
      await storage.close();

      // Cleanup parent dir
      const parentDir = path.dirname(spacePath);
      if (fs.existsSync(parentDir)) {
        fs.rmSync(parentDir, { recursive: true });
      }
    });
  });
});
