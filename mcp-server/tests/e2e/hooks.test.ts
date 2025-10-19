/**
 * E2E Hook Integration Tests
 *
 * Tests hook-triggered task execution scenarios
 * Simulates Claude Code hook events and verifies task execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { E2ETestFramework } from './framework.js';
import { BashTaskConfig, HookTrigger } from '../../src/models/types.js';

describe('E2E Hook Integration Tests', () => {
  let framework: E2ETestFramework;

  beforeEach(async () => {
    framework = new E2ETestFramework();
    await framework.setup();
  });

  afterEach(async () => {
    await framework.teardown();
  });

  describe('SessionStart Hook', () => {
    it('should create task triggered by SessionStart event', async () => {
      // Create task triggered by session start
      const task = await framework.createTask({
        name: 'Session Start Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Session started"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'SessionStart',
          conditions: {
            source: ['startup', 'resume']
          }
        } as HookTrigger
      });

      expect(task.id).toBeDefined();
      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.event).toBe('SessionStart');
      }

      // Simulate hook trigger
      const executionId = await framework.executeTask(task.id, 'hook:SessionStart');
      const execution = await framework.waitForExecutionComplete(executionId);

      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toContain('Session started');
      expect(execution!.trigger_type).toBe('hook:SessionStart');
    }, 10000);

    it('should support debouncing for SessionStart hooks', async () => {
      // Create task with debounce
      const task = await framework.createTask({
        name: 'Debounced Session Start',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Debounced execution"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'SessionStart',
          debounce: '5s'
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.debounce).toBe('5s');
      }
    }, 10000);
  });

  describe('PostToolUse Hook', () => {
    it('should create task triggered after file edits', async () => {
      // Create task triggered after Write/Edit tools
      const task = await framework.createTask({
        name: 'Post Edit Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "File edited, running formatter"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          conditions: {
            tool_names: ['Write', 'Edit'],
            file_pattern: '*.ts'
          }
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.event).toBe('PostToolUse');
        expect(task.trigger.conditions?.tool_names).toContain('Write');
        expect(task.trigger.conditions?.file_pattern).toBe('*.ts');
      }

      // Simulate PostToolUse hook
      const executionId = await framework.executeTask(task.id, 'hook:PostToolUse');
      const execution = await framework.waitForExecutionComplete(executionId);

      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toContain('running formatter');
    }, 10000);

    it('should filter by file pattern in PostToolUse hook', async () => {
      // Create task for TypeScript files only
      const task = await framework.createTask({
        name: 'TypeScript Linter',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Linting TypeScript"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          conditions: {
            tool_names: ['Write', 'Edit'],
            file_pattern: '*.ts'
          },
          debounce: '2s'
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.conditions?.file_pattern).toBe('*.ts');
        expect(task.trigger.debounce).toBe('2s');
      }
    }, 10000);
  });

  describe('SubagentStop Hook', () => {
    it('should create task triggered when subagent completes', async () => {
      // Create task triggered by subagent completion
      const task = await framework.createTask({
        name: 'Subagent Completion Handler',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Subagent completed, processing results"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'SubagentStop',
          conditions: {
            subagent_names: ['test-agent', 'data-processor']
          }
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.event).toBe('SubagentStop');
        expect(task.trigger.conditions?.subagent_names).toContain('test-agent');
      }

      // Simulate SubagentStop hook
      const executionId = await framework.executeTask(task.id, 'hook:SubagentStop');
      const execution = await framework.waitForExecutionComplete(executionId);

      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toContain('processing results');
    }, 10000);
  });

  describe('PreToolUse Hook', () => {
    it('should create validation task before tool execution', async () => {
      // Create pre-execution validation task
      const task = await framework.createTask({
        name: 'Pre-Execution Validator',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Validating before execution"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'PreToolUse',
          conditions: {
            tool_names: ['Bash']
          }
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.event).toBe('PreToolUse');
      }

      // Simulate PreToolUse hook
      const executionId = await framework.executeTask(task.id, 'hook:PreToolUse');
      const execution = await framework.waitForExecutionComplete(executionId);

      framework.assertExecutionStatus(execution, 'success');
    }, 10000);
  });

  describe('Notification Hook', () => {
    it('should create task triggered by notifications', async () => {
      // Create notification handler task
      const task = await framework.createTask({
        name: 'Notification Handler',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Processing notification"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'Notification'
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.event).toBe('Notification');
      }

      // Simulate Notification hook
      const executionId = await framework.executeTask(task.id, 'hook:Notification');
      const execution = await framework.waitForExecutionComplete(executionId);

      framework.assertExecutionStatus(execution, 'success');
    }, 10000);
  });

  describe('SessionEnd Hook', () => {
    it('should create cleanup task for session end', async () => {
      // Create cleanup task
      const task = await framework.createTask({
        name: 'Session Cleanup',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Cleaning up session resources"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'SessionEnd'
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.event).toBe('SessionEnd');
      }

      // Simulate SessionEnd hook
      const executionId = await framework.executeTask(task.id, 'hook:SessionEnd');
      const execution = await framework.waitForExecutionComplete(executionId);

      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toContain('Cleaning up');
    }, 10000);
  });

  describe('Stop Hook', () => {
    it('should create task triggered when user stops execution', async () => {
      // Create stop handler task
      const task = await framework.createTask({
        name: 'Stop Handler',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Execution stopped by user"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'Stop'
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.event).toBe('Stop');
      }

      // Simulate Stop hook
      const executionId = await framework.executeTask(task.id, 'hook:Stop');
      const execution = await framework.waitForExecutionComplete(executionId);

      framework.assertExecutionStatus(execution, 'success');
    }, 10000);
  });

  describe('Hook Workflow Integration', () => {
    it('should handle multiple hook-triggered tasks in sequence', async () => {
      // Create multiple hook tasks
      const tasks = await Promise.all([
        framework.createTask({
          name: 'Pre-Tool Validator',
          type: 'bash',
          task_config: {
            type: 'bash',
            command: 'echo "Validating"'
          } as BashTaskConfig,
          trigger: {
            type: 'hook',
            event: 'PreToolUse'
          } as HookTrigger
        }),
        framework.createTask({
          name: 'Post-Tool Formatter',
          type: 'bash',
          task_config: {
            type: 'bash',
            command: 'echo "Formatting"'
          } as BashTaskConfig,
          trigger: {
            type: 'hook',
            event: 'PostToolUse'
          } as HookTrigger
        })
      ]);

      // Execute both
      const executions = await Promise.all(
        tasks.map((task, idx) =>
          framework.executeTask(
            task.id,
            idx === 0 ? 'hook:PreToolUse' : 'hook:PostToolUse'
          )
        )
      );

      // Wait for completions
      const results = await Promise.all(
        executions.map(id => framework.waitForExecutionComplete(id))
      );

      // Verify both succeeded
      results.forEach(execution => {
        framework.assertExecutionStatus(execution, 'success');
      });
    }, 15000);

    it('should support regex matching in hook triggers', async () => {
      // Create task with regex matcher
      const task = await framework.createTask({
        name: 'Pattern Matcher',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Pattern matched"'
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          matcher: '.*\\.test\\.ts$'
        } as HookTrigger
      });

      expect(task.trigger.type).toBe('hook');
      if (task.trigger.type === 'hook') {
        expect(task.trigger.matcher).toBe('.*\\.test\\.ts$');
      }
    }, 10000);

    it('should debounce rapid hook events', async () => {
      // Create debounced task
      const outputFile = framework.createTempFile('');
      const task = await framework.createTask({
        name: 'Debounced Hook Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: `echo "$(date +%s%3N)" >> ${outputFile}`
        } as BashTaskConfig,
        trigger: {
          type: 'hook',
          event: 'PostToolUse',
          debounce: '1s'
        } as HookTrigger
      });

      // Simulate rapid events
      const executionIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const execId = await framework.executeTask(task.id, 'hook:PostToolUse');
        executionIds.push(execId);
        await framework.sleep(200); // 200ms between events
      }

      // Wait for all to complete
      await framework.sleep(2000);

      // Due to debouncing, fewer executions should have occurred
      const executions = await framework.listExecutions(task.id);
      // With 1s debounce and 200ms intervals, we expect fewer than 5 executions
      expect(executions.length).toBeLessThan(5);
    }, 10000);
  });
});
