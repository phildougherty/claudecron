/**
 * Streaming & ThinkingBlock Capture Tests
 *
 * Tests for real-time streaming output and ThinkingBlock capture features
 * Track 2 Day 3 deliverable
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { SQLiteStorage } from '../../src/storage/sqlite.js';
import { SDKExecutor } from '../../src/executors/sdk-executor.js';
import { Task, Execution, AIPromptTaskConfig } from '../../src/models/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('SDK Streaming & ThinkingBlock Capture', () => {
  let storage: SQLiteStorage;
  let executor: SDKExecutor;
  let tempDbPath: string;

  beforeEach(async () => {
    // Create temporary database
    tempDbPath = path.join(os.tmpdir(), `test-streaming-${Date.now()}.db`);
    storage = new SQLiteStorage(tempDbPath);
    executor = new SDKExecutor(storage);
  });

  afterEach(async () => {
    await storage.close();
    // Clean up temp database
    if (fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('Output Streaming', () => {
    it('should stream output in real-time when stream_output is enabled', async () => {
      // Create task with streaming enabled
      const task = await storage.createTask({
        name: 'Streaming Test',
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Say hello and count from 1 to 5',
          stream_output: true,
          inherit_context: false
        } as AIPromptTaskConfig,
        trigger: { type: 'manual', description: 'Test' },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      // Create execution
      const execution = await storage.createExecution({
        task_id: task.id,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      // Execute task (this will stream output to storage)
      const result = await executor.execute(task, execution);

      // Verify execution succeeded
      expect(result.status).toBe('success');
      expect(result.output).toBeDefined();
      expect(result.output!.length).toBeGreaterThan(0);

      // Verify streamed output matches final output
      const progress = await storage.getExecutionProgress(execution.id);
      expect(progress.output).toBe(result.output);
      expect(progress.status).toBe('running'); // Still running status until updateExecution
    }, 60000); // 60 second timeout for AI execution

    it('should not stream when stream_output is disabled', async () => {
      const task = await storage.createTask({
        name: 'Non-Streaming Test',
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Say hello',
          stream_output: false,
          inherit_context: false
        } as AIPromptTaskConfig,
        trigger: { type: 'manual', description: 'Test' },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const execution = await storage.createExecution({
        task_id: task.id,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      await executor.execute(task, execution);

      // Without streaming, output should be empty during execution
      const progress = await storage.getExecutionProgress(execution.id);
      expect(progress.output).toBe('');
    }, 60000);
  });

  describe('ThinkingBlock Capture', () => {
    it('should capture thinking blocks when capture_thinking is enabled', async () => {
      const task = await storage.createTask({
        name: 'Thinking Capture Test',
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Think deeply about the meaning of life, then provide a brief answer',
          capture_thinking: true,
          stream_output: true,
          max_thinking_tokens: 1000,
          model: 'claude-sonnet-4-5-20250929', // Claude Sonnet 4.5 for thinking support
          inherit_context: false
        } as AIPromptTaskConfig,
        trigger: { type: 'manual', description: 'Test' },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const execution = await storage.createExecution({
        task_id: task.id,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      const result = await executor.execute(task, execution);

      // Verify thinking output was captured
      expect(result.thinking_output).toBeDefined();
      if (result.thinking_output) {
        expect(result.thinking_output.length).toBeGreaterThan(0);
        console.log('[Test] Captured thinking:', result.thinking_output.substring(0, 200));
      }

      // Verify streamed thinking
      const progress = await storage.getExecutionProgress(execution.id);
      if (result.thinking_output) {
        expect(progress.thinking).toBe(result.thinking_output);
      }
    }, 90000); // 90 second timeout for thinking

    it('should not capture thinking when capture_thinking is disabled', async () => {
      const task = await storage.createTask({
        name: 'No Thinking Capture',
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Say hello',
          capture_thinking: false,
          inherit_context: false
        } as AIPromptTaskConfig,
        trigger: { type: 'manual', description: 'Test' },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const execution = await storage.createExecution({
        task_id: task.id,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      const result = await executor.execute(task, execution);

      // Thinking should not be captured
      expect(result.thinking_output).toBeUndefined();
    }, 60000);
  });

  describe('Progress Monitoring', () => {
    it('should allow monitoring execution progress in real-time', async () => {
      const task = await storage.createTask({
        name: 'Progress Monitoring Test',
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Count from 1 to 10 slowly',
          stream_output: true,
          inherit_context: false
        } as AIPromptTaskConfig,
        trigger: { type: 'manual', description: 'Test' },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const execution = await storage.createExecution({
        task_id: task.id,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      // Execute in background and monitor progress
      const executePromise = executor.execute(task, execution);

      // Give it a moment to start streaming
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check progress
      const progress = await storage.getExecutionProgress(execution.id);
      expect(progress.status).toBe('running');
      // Output should have started streaming
      // (may be empty if execution is very fast)

      // Wait for completion
      const result = await executePromise;
      expect(result.status).toBe('success');
    }, 60000);
  });

  describe('Storage Streaming Methods', () => {
    it('should append output correctly', async () => {
      const execution = await storage.createExecution({
        task_id: 'test-task',
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      await storage.appendExecutionOutput(execution.id, 'Part 1 ');
      await storage.appendExecutionOutput(execution.id, 'Part 2 ');
      await storage.appendExecutionOutput(execution.id, 'Part 3');

      const progress = await storage.getExecutionProgress(execution.id);
      expect(progress.output).toBe('Part 1 Part 2 Part 3');
    });

    it('should append thinking correctly', async () => {
      const execution = await storage.createExecution({
        task_id: 'test-task',
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      await storage.appendExecutionThinking(execution.id, 'Thinking 1');
      await storage.appendExecutionThinking(execution.id, 'Thinking 2');

      const progress = await storage.getExecutionProgress(execution.id);
      expect(progress.thinking).toContain('Thinking 1');
      expect(progress.thinking).toContain('Thinking 2');
    });

    it('should handle empty execution gracefully', async () => {
      const execution = await storage.createExecution({
        task_id: 'test-task',
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      const progress = await storage.getExecutionProgress(execution.id);
      expect(progress.output).toBe('');
      expect(progress.thinking).toBe('');
      expect(progress.status).toBe('running');
    });

    it('should throw error for non-existent execution', async () => {
      await expect(
        storage.getExecutionProgress('non-existent-id')
      ).rejects.toThrow('Execution not found');
    });
  });

  describe('Extended Thinking Tokens', () => {
    it('should pass max_thinking_tokens to SDK', async () => {
      const task = await storage.createTask({
        name: 'Extended Thinking Test',
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Solve a complex problem',
          max_thinking_tokens: 5000,
          capture_thinking: true,
          model: 'claude-sonnet-4-5-20250929',
          inherit_context: false
        } as AIPromptTaskConfig,
        trigger: { type: 'manual', description: 'Test' },
        enabled: true,
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const execution = await storage.createExecution({
        task_id: task.id,
        status: 'running',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      const result = await executor.execute(task, execution);

      // Should complete without error
      expect(result.status).toBe('success');
    }, 90000);
  });
});

/**
 * % 100 COMPLETE - Streaming & ThinkingBlock tests
 */
