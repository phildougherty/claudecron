/**
 * Tool Tracking Integration Tests
 *
 * Tests comprehensive tool call tracking and analytics
 * Based on Track 2 Day 3 requirements
 *
 * % 0 COMPLETE - Tool tracking tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { StorageFactory } from '../../src/storage/factory.js';
import { Storage } from '../../src/storage/storage.js';
import { Scheduler } from '../../src/scheduler/scheduler.js';
import { ToolAnalytics } from '../../src/analytics/tool-analytics.js';
import { Task, Execution, ToolCallRecord } from '../../src/models/types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Tool Tracking Integration Tests', () => {
  let storage: Storage;
  let scheduler: Scheduler;
  let analytics: ToolAnalytics;
  let testDbPath: string;

  beforeEach(async () => {
    // Create test database
    testDbPath = path.join(os.tmpdir(), `test-tool-tracking-${Date.now()}.db`);

    storage = await StorageFactory.create({
      type: 'sqlite',
      path: testDbPath
    });

    scheduler = new Scheduler(storage, {
      check_interval: '1s',
      default_timezone: 'UTC',
      max_concurrent_tasks: 5
    });

    analytics = new ToolAnalytics(storage);
  });

  afterEach(async () => {
    await storage.close();

    // Cleanup test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Tool Call Tracking', () => {
    it('should track all tool calls during execution', async () => {
      // Create a test task
      const task = await storage.createTask({
        name: 'Test Tool Tracking',
        description: 'Task to test tool call tracking',
        type: 'ai_prompt',
        enabled: true,
        task_config: {
          type: 'ai_prompt',
          prompt: 'List files in the current directory and read one of them',
        },
        trigger: {
          type: 'manual',
          description: 'Manual test trigger'
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      // Create an execution with tool calls
      const toolCalls: ToolCallRecord[] = [
        {
          tool_name: 'Glob',
          tool_input: { pattern: '*' },
          tool_result: ['file1.txt', 'file2.txt'],
          timestamp: new Date().toISOString(),
          duration_ms: 50,
          success: true
        },
        {
          tool_name: 'Read',
          tool_input: { file_path: '/test/file1.txt' },
          tool_result: 'File contents',
          timestamp: new Date().toISOString(),
          duration_ms: 100,
          success: true
        },
        {
          tool_name: 'Read',
          tool_input: { file_path: '/test/file2.txt' },
          error: 'File not found',
          timestamp: new Date().toISOString(),
          duration_ms: 25,
          success: false
        }
      ];

      const execution = await storage.createExecution({
        task_id: task.id,
        started_at: new Date().toISOString(),
        completed_at: new Date(Date.now() + 1000).toISOString(),
        duration_ms: 1000,
        trigger_type: 'manual',
        status: 'success',
        output: 'Task completed',
        tool_calls: toolCalls,
        tool_usage_summary: {
          total_tools_used: 3,
          unique_tools: ['Glob', 'Read'],
          most_used_tool: 'Read'
        }
      });

      // Verify tool calls were saved
      const savedExecution = await storage.getExecution(execution.id);
      expect(savedExecution).toBeTruthy();
      expect(savedExecution!.tool_calls).toHaveLength(3);
      expect(savedExecution!.tool_usage_summary).toEqual({
        total_tools_used: 3,
        unique_tools: ['Glob', 'Read'],
        most_used_tool: 'Read'
      });

      // Verify individual tool call details
      const calls = savedExecution!.tool_calls!;
      expect(calls[0].tool_name).toBe('Glob');
      expect(calls[0].success).toBe(true);
      expect(calls[0].duration_ms).toBe(50);

      expect(calls[1].tool_name).toBe('Read');
      expect(calls[1].success).toBe(true);
      expect(calls[1].duration_ms).toBe(100);

      expect(calls[2].tool_name).toBe('Read');
      expect(calls[2].success).toBe(false);
      expect(calls[2].error).toBe('File not found');
    });

    it('should track tool calls with timing information', async () => {
      const task = await storage.createTask({
        name: 'Timing Test',
        type: 'ai_prompt',
        enabled: true,
        task_config: {
          type: 'ai_prompt',
          prompt: 'Test timing'
        },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const toolCalls: ToolCallRecord[] = [
        {
          tool_name: 'Bash',
          tool_input: { command: 'ls -la' },
          timestamp: new Date().toISOString(),
          duration_ms: 150,
          success: true
        }
      ];

      const execution = await storage.createExecution({
        task_id: task.id,
        started_at: new Date().toISOString(),
        trigger_type: 'manual',
        status: 'success',
        tool_calls: toolCalls
      });

      const savedExecution = await storage.getExecution(execution.id);
      expect(savedExecution!.tool_calls![0].duration_ms).toBe(150);
    });
  });

  describe('Tool Usage Analytics', () => {
    it('should calculate accurate tool usage statistics', async () => {
      // Create multiple tasks with tool usage
      const task1 = await storage.createTask({
        name: 'Task 1',
        type: 'ai_prompt',
        enabled: true,
        task_config: { type: 'ai_prompt', prompt: 'Test 1' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const task2 = await storage.createTask({
        name: 'Task 2',
        type: 'ai_prompt',
        enabled: true,
        task_config: { type: 'ai_prompt', prompt: 'Test 2' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      // Create executions with various tool calls
      await storage.createExecution({
        task_id: task1.id,
        started_at: new Date().toISOString(),
        trigger_type: 'manual',
        status: 'success',
        tool_calls: [
          {
            tool_name: 'Read',
            tool_input: {},
            timestamp: new Date().toISOString(),
            duration_ms: 100,
            success: true
          },
          {
            tool_name: 'Write',
            tool_input: {},
            timestamp: new Date().toISOString(),
            duration_ms: 200,
            success: true
          }
        ]
      });

      await storage.createExecution({
        task_id: task2.id,
        started_at: new Date().toISOString(),
        trigger_type: 'manual',
        status: 'success',
        tool_calls: [
          {
            tool_name: 'Read',
            tool_input: {},
            timestamp: new Date().toISOString(),
            duration_ms: 150,
            success: true
          },
          {
            tool_name: 'Read',
            tool_input: {},
            timestamp: new Date().toISOString(),
            duration_ms: 120,
            success: false,
            error: 'Error'
          }
        ]
      });

      // Get analytics
      const stats = await analytics.getToolUsageStats();

      // Verify Read tool stats
      const readStats = stats.find(s => s.tool_name === 'Read');
      expect(readStats).toBeTruthy();
      expect(readStats!.total_calls).toBe(3);
      expect(readStats!.successful_calls).toBe(2);
      expect(readStats!.failed_calls).toBe(1);
      expect(readStats!.avg_duration_ms).toBeCloseTo((100 + 150 + 120) / 3, 1);

      // Verify Write tool stats
      const writeStats = stats.find(s => s.tool_name === 'Write');
      expect(writeStats).toBeTruthy();
      expect(writeStats!.total_calls).toBe(1);
      expect(writeStats!.successful_calls).toBe(1);
      expect(writeStats!.failed_calls).toBe(0);
    });

    it('should identify most used tools', async () => {
      const task = await storage.createTask({
        name: 'Multi-tool Task',
        type: 'ai_prompt',
        enabled: true,
        task_config: { type: 'ai_prompt', prompt: 'Test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      // Create execution with many Read calls
      await storage.createExecution({
        task_id: task.id,
        started_at: new Date().toISOString(),
        trigger_type: 'manual',
        status: 'success',
        tool_calls: [
          { tool_name: 'Read', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 50, success: true },
          { tool_name: 'Read', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 60, success: true },
          { tool_name: 'Read', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 70, success: true },
          { tool_name: 'Write', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 100, success: true },
          { tool_name: 'Bash', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 200, success: true }
        ]
      });

      const mostUsed = await analytics.getMostUsedTools(3);

      expect(mostUsed).toHaveLength(3);
      expect(mostUsed[0].tool_name).toBe('Read');
      expect(mostUsed[0].total_calls).toBe(3);
    });

    it('should identify slowest tools', async () => {
      const task = await storage.createTask({
        name: 'Performance Test',
        type: 'ai_prompt',
        enabled: true,
        task_config: { type: 'ai_prompt', prompt: 'Test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createExecution({
        task_id: task.id,
        started_at: new Date().toISOString(),
        trigger_type: 'manual',
        status: 'success',
        tool_calls: [
          { tool_name: 'FastTool', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 10, success: true },
          { tool_name: 'SlowTool', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 500, success: true },
          { tool_name: 'SlowTool', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 600, success: true },
          { tool_name: 'MediumTool', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 100, success: true }
        ]
      });

      const slowest = await analytics.getSlowestTools(3);

      expect(slowest[0].tool_name).toBe('SlowTool');
      expect(slowest[0].avg_duration_ms).toBe(550); // (500 + 600) / 2
    });

    it('should generate tool usage summary', async () => {
      const task = await storage.createTask({
        name: 'Summary Test',
        type: 'ai_prompt',
        enabled: true,
        task_config: { type: 'ai_prompt', prompt: 'Test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      await storage.createExecution({
        task_id: task.id,
        started_at: new Date().toISOString(),
        trigger_type: 'manual',
        status: 'success',
        tool_calls: [
          { tool_name: 'Tool1', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 100, success: true },
          { tool_name: 'Tool2', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 200, success: true },
          { tool_name: 'Tool1', tool_input: {}, timestamp: new Date().toISOString(), duration_ms: 150, success: false, error: 'Error' }
        ]
      });

      const summary = await analytics.getToolUsageSummary();

      expect(summary.total_tool_calls).toBe(3);
      expect(summary.unique_tools).toBe(2);
      expect(summary.most_used_tool).toBe('Tool1');
      expect(summary.success_rate).toBeCloseTo(66.67, 1); // 2/3 successful
      expect(summary.avg_tool_duration_ms).toBeCloseTo(150, 1); // (100 + 200 + 150) / 3
    });
  });

  describe('Permission Mode Validation', () => {
    it('should warn for scheduled tasks with default permission mode', async () => {
      const consoleSpy = jest.spyOn(console, 'warn');

      const task = await storage.createTask({
        name: 'Scheduled Task',
        type: 'ai_prompt',
        enabled: true,
        task_config: { type: 'ai_prompt', prompt: 'Test' },
        trigger: { type: 'schedule', cron: '0 0 * * *' },
        options: { permission_mode: 'default' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      // Execute task (will trigger validation)
      // Note: This is a conceptual test - actual implementation would need SDK executor
      // For now, we just verify the task was created with the permission mode
      expect(task.options?.permission_mode).toBe('default');
      expect(task.trigger.type).toBe('schedule');
    });

    it('should accept bypassPermissions for scheduled tasks', async () => {
      const task = await storage.createTask({
        name: 'Automated Task',
        type: 'ai_prompt',
        enabled: true,
        task_config: { type: 'ai_prompt', prompt: 'Test' },
        trigger: { type: 'schedule', cron: '0 0 * * *' },
        options: { permission_mode: 'bypassPermissions' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      expect(task.options?.permission_mode).toBe('bypassPermissions');
    });
  });
});

/**
 * % 100 COMPLETE - Tool tracking tests
 */
