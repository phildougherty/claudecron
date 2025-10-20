/**
 * Executor Factory Unit Tests
 *
 * Tests for executor factory creation logic
 */

import { describe, it, expect } from 'vitest';
import { ExecutorFactory } from '../../../src/executors/factory.js';
import { BashExecutor } from '../../../src/executors/bash-executor.js';
import { SDKExecutor } from '../../../src/executors/sdk-executor.js';
import { SlashCommandExecutor } from '../../../src/executors/slash-command-executor.js';
import { ToolCallExecutor } from '../../../src/executors/tool-call-executor.js';
import { SubagentExecutor } from '../../../src/executors/subagent-executor.js';
import { TestHelpers } from '../../fixtures/test-helpers.js';

describe('ExecutorFactory', () => {
  describe('Executor Creation', () => {
    it('should create BashExecutor for bash tasks', () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo test'
        }
      });

      const executor = ExecutorFactory.createExecutor(task);

      expect(executor).toBeInstanceOf(BashExecutor);
    });

    it('should create SDKExecutor for ai_prompt tasks', () => {
      const task = TestHelpers.createAIPromptTask();

      const executor = ExecutorFactory.createExecutor(task);

      expect(executor).toBeInstanceOf(SDKExecutor);
    });

    it('should create SDKExecutor for sdk_query tasks', () => {
      const task = TestHelpers.createMockTask({
        type: 'sdk_query',
        task_config: {
          type: 'sdk_query',
          prompt: 'Test query',
          sdk_options: {}
        }
      });

      const executor = ExecutorFactory.createExecutor(task);

      expect(executor).toBeInstanceOf(SDKExecutor);
    });

    it('should create SlashCommandExecutor for slash_command tasks', () => {
      const task = TestHelpers.createMockTask({
        type: 'slash_command',
        task_config: {
          type: 'slash_command',
          command: 'test'
        } as any
      });

      const executor = ExecutorFactory.createExecutor(task);

      expect(executor).toBeInstanceOf(SlashCommandExecutor);
    });

    it('should create ToolCallExecutor for tool_call tasks', () => {
      const task = TestHelpers.createMockTask({
        type: 'tool_call',
        task_config: {
          type: 'tool_call',
          tool_name: 'Bash',
          parameters: { command: 'echo test' }
        } as any
      });

      const executor = ExecutorFactory.createExecutor(task);

      expect(executor).toBeInstanceOf(ToolCallExecutor);
    });

    it('should throw error for unsupported task types', () => {
      const task = TestHelpers.createMockTask({
        type: 'unsupported_type' as any,
        task_config: {} as any
      });

      expect(() => ExecutorFactory.createExecutor(task)).toThrow(
        'Unsupported task type: unsupported_type'
      );
    });
  });

  describe('Executor Interface Compliance', () => {
    it('should return executors with execute method', () => {
      const bashTask = TestHelpers.createMockTask({
        type: 'bash',
        task_config: { type: 'bash', command: 'test' }
      });

      const executor = ExecutorFactory.createExecutor(bashTask);

      expect(executor).toHaveProperty('execute');
      expect(typeof executor.execute).toBe('function');
    });

    it('should create different executor instances for each call', () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: { type: 'bash', command: 'test' }
      });

      const executor1 = ExecutorFactory.createExecutor(task);
      const executor2 = ExecutorFactory.createExecutor(task);

      // Should create new instances
      expect(executor1).not.toBe(executor2);
    });
  });

  describe('Task Type Coverage', () => {
    const taskTypes = [
      'bash',
      'ai_prompt',
      'sdk_query',
      'slash_command',
      'subagent',
      'tool_call'
    ];

    taskTypes.forEach(type => {
      it(`should handle ${type} task type`, () => {
        const task = TestHelpers.createMockTask({
          type: type as any,
          task_config: { type } as any
        });

        expect(() => ExecutorFactory.createExecutor(task)).not.toThrow();
      });
    });
  });
});
