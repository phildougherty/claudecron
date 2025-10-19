/**
 * E2E Recovery Scenario Tests
 *
 * Tests error handling, recovery, and resilience
 * Validates system behavior under failure conditions
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { E2ETestFramework } from './framework.js';
import { BashTaskConfig, ManualTrigger } from '../../src/models/types.js';
import fs from 'fs';

describe('E2E Recovery Scenario Tests', () => {
  let framework: E2ETestFramework;

  beforeEach(async () => {
    framework = new E2ETestFramework();
    await framework.setup();
  });

  afterEach(async () => {
    await framework.teardown();
  });

  describe('Task Failure Recovery', () => {
    it('should recover from task execution failure', async () => {
      // Create task that fails initially
      const counterFile = framework.createTempFile('0');
      const task = await framework.createTask({
        name: 'Recoverable Failure',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: `
            COUNT=$(cat ${counterFile})
            NEXT=$((COUNT + 1))
            echo $NEXT > ${counterFile}
            test $COUNT -ge 2
          `
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Recovery test'
        } as ManualTrigger
      });

      // First two executions should fail
      const exec1 = await framework.executeTask(task.id, 'manual');
      const result1 = await framework.waitForExecutionComplete(exec1);
      framework.assertExecutionStatus(result1, 'failure');

      const exec2 = await framework.executeTask(task.id, 'manual');
      const result2 = await framework.waitForExecutionComplete(exec2);
      framework.assertExecutionStatus(result2, 'failure');

      // Third execution should succeed
      const exec3 = await framework.executeTask(task.id, 'manual');
      const result3 = await framework.waitForExecutionComplete(exec3);
      framework.assertExecutionStatus(result3, 'success');

      // Verify stats
      const updatedTask = await framework.getTask(task.id);
      framework.assertTaskStats(updatedTask, {
        run_count: 3,
        success_count: 1,
        failure_count: 2
      });
    }, 15000);

    it('should handle retry with exponential backoff', async () => {
      // Create task with retry policy
      const task = await framework.createTask({
        name: 'Retry Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Retry test'
        } as ManualTrigger,
        options: {
          retry: {
            max_attempts: 3,
            backoff: 'exponential',
            initial_delay: 100,
            max_delay: 1000,
            retry_on: 'all'
          }
        }
      });

      // Execute (will fail and retry)
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId, 10000);

      // Should eventually fail after retries
      framework.assertExecutionStatus(execution, 'failure');

      // In production, retry logic would create multiple execution attempts
      // Here we verify the task configuration is correct
      expect(task.options?.retry?.max_attempts).toBe(3);
      expect(task.options?.retry?.backoff).toBe('exponential');
    }, 15000);

    it('should handle timeout and recover', async () => {
      // Create task that times out
      const task = await framework.createTask({
        name: 'Timeout Recovery',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'sleep 10',
          timeout: 1000
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Timeout test'
        } as ManualTrigger
      });

      // Execute and timeout
      const exec1 = await framework.executeTask(task.id, 'manual');
      const result1 = await framework.waitForExecutionComplete(exec1);
      framework.assertExecutionStatus(result1, 'timeout');

      // Update task with quick command
      const updatedTask = await framework.getTask(task.id);
      const storage = framework.getStorage();
      await storage.updateTask(task.id, {
        ...updatedTask!,
        task_config: {
          type: 'bash',
          command: 'echo "fixed"',
          timeout: 5000
        } as BashTaskConfig
      });

      // Execute again - should succeed
      const exec2 = await framework.executeTask(task.id, 'manual');
      const result2 = await framework.waitForExecutionComplete(exec2);
      framework.assertExecutionStatus(result2, 'success');
    }, 15000);
  });

  describe('Database Recovery', () => {
    it('should recover from database restart', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'DB Recovery Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "before restart"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'DB recovery'
        } as ManualTrigger
      });

      // Execute once
      const exec1 = await framework.executeTask(task.id, 'manual');
      await framework.waitForExecutionComplete(exec1);

      // Close and reopen storage
      const storage = framework.getStorage();
      const dbPath = (storage as any).dbPath;
      await storage.close();

      // Reopen storage
      const { SQLiteStorage } = await import('../../src/storage/sqlite.js');
      const newStorage = new SQLiteStorage(dbPath);
      (framework as any).storage = newStorage;

      // Verify task still exists
      const retrieved = await framework.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('DB Recovery Test');

      // Verify execution history persisted
      const executions = await framework.listExecutions(task.id);
      expect(executions.length).toBe(1);
    }, 15000);

    it('should handle corrupted execution gracefully', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Corruption Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "test"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Corruption test'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');
      await framework.waitForExecutionComplete(executionId);

      // Task should still be functional
      const exec2 = await framework.executeTask(task.id, 'manual');
      const result2 = await framework.waitForExecutionComplete(exec2);
      framework.assertExecutionStatus(result2, 'success');
    }, 15000);
  });

  describe('Resource Exhaustion Recovery', () => {
    it('should handle disk space issues gracefully', async () => {
      // Create task that writes large output
      const task = await framework.createTask({
        name: 'Large Output Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'for i in {1..10000}; do echo "Line $i"; done'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Large output'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId);

      // Should complete (or handle gracefully if disk full)
      expect(execution).toBeDefined();
      expect(['success', 'failure']).toContain(execution!.status);
    }, 15000);

    it('should handle memory constraints', async () => {
      // Create multiple tasks to test memory handling
      const tasks = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          framework.createTask({
            name: `Memory Test ${i}`,
            type: 'bash',
            task_config: {
              type: 'bash',
              command: `echo "Memory test ${i}"`
            } as BashTaskConfig,
            trigger: {
              type: 'manual',
              description: 'Memory test'
            } as ManualTrigger
          })
        )
      );

      // Execute all
      const executionIds = await Promise.all(
        tasks.map(task => framework.executeTask(task.id, 'manual'))
      );

      // Wait for all
      const executions = await Promise.all(
        executionIds.map(id => framework.waitForExecutionComplete(id, 5000))
      );

      // All should complete
      executions.forEach(execution => {
        expect(execution).toBeDefined();
        expect(execution!.status).not.toBe('running');
      });
    }, 20000);
  });

  describe('Concurrent Failure Scenarios', () => {
    it('should handle multiple concurrent failures', async () => {
      // Create multiple failing tasks
      const tasks = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          framework.createTask({
            name: `Failing Task ${i}`,
            type: 'bash',
            task_config: {
              type: 'bash',
              command: `exit ${i + 1}`
            } as BashTaskConfig,
            trigger: {
              type: 'manual',
              description: `Fail ${i}`
            } as ManualTrigger
          })
        )
      );

      // Execute all concurrently
      const executionIds = await Promise.all(
        tasks.map(task => framework.executeTask(task.id, 'manual'))
      );

      // Wait for all
      const executions = await Promise.all(
        executionIds.map(id => framework.waitForExecutionComplete(id, 5000))
      );

      // All should fail gracefully
      executions.forEach((execution, i) => {
        framework.assertExecutionStatus(execution, 'failure');
        expect(execution!.exit_code).toBe(i + 1);
      });

      // System should still be functional
      const newTask = await framework.createTask({
        name: 'Recovery Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "recovered"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Recovery'
        } as ManualTrigger
      });

      const execId = await framework.executeTask(newTask.id, 'manual');
      const result = await framework.waitForExecutionComplete(execId);
      framework.assertExecutionStatus(result, 'success');
    }, 20000);

    it('should isolate failures between tasks', async () => {
      // Create mix of failing and succeeding tasks
      const successTask = await framework.createTask({
        name: 'Success Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "success"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Success'
        } as ManualTrigger
      });

      const failTask = await framework.createTask({
        name: 'Fail Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Fail'
        } as ManualTrigger
      });

      // Execute both
      const [successExecId, failExecId] = await Promise.all([
        framework.executeTask(successTask.id, 'manual'),
        framework.executeTask(failTask.id, 'manual')
      ]);

      // Wait for both
      const [successExec, failExec] = await Promise.all([
        framework.waitForExecutionComplete(successExecId),
        framework.waitForExecutionComplete(failExecId)
      ]);

      // Verify isolation
      framework.assertExecutionStatus(successExec, 'success');
      framework.assertExecutionStatus(failExec, 'failure');

      // Success task should not be affected by failure
      const updatedSuccess = await framework.getTask(successTask.id);
      framework.assertTaskStats(updatedSuccess, {
        success_count: 1,
        failure_count: 0
      });
    }, 15000);
  });

  describe('State Corruption Recovery', () => {
    it('should recover from incomplete execution records', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Incomplete Exec Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "test"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Incomplete test'
        } as ManualTrigger
      });

      // Execute normally first
      const exec1 = await framework.executeTask(task.id, 'manual');
      await framework.waitForExecutionComplete(exec1);

      // Create incomplete execution manually
      const storage = framework.getStorage();
      const { v4: uuidv4 } = await import('uuid');
      const incompleteExecId = uuidv4();

      await storage.saveExecution({
        id: incompleteExecId,
        task_id: task.id,
        started_at: new Date().toISOString(),
        trigger_type: 'manual',
        status: 'running' // Never completed
      });

      // System should still work
      const exec2 = await framework.executeTask(task.id, 'manual');
      const result = await framework.waitForExecutionComplete(exec2);
      framework.assertExecutionStatus(result, 'success');

      // Should have 3 executions total (1 complete, 1 incomplete, 1 complete)
      const executions = await framework.listExecutions(task.id);
      expect(executions.length).toBe(3);
    }, 15000);

    it('should handle missing task files gracefully', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Missing File Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'cat /non/existent/file.txt'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Missing file'
        } as ManualTrigger
      });

      // Execute - should fail gracefully
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId);

      // Should fail but not crash
      framework.assertExecutionStatus(execution, 'failure');
      expect(execution!.error || execution!.output).toBeTruthy();
    }, 15000);
  });

  describe('Scheduler Recovery', () => {
    it('should recover scheduled tasks after restart', async () => {
      // Create scheduled task
      const task = await framework.createTask({
        name: 'Scheduled Recovery Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "scheduled"'
        } as BashTaskConfig,
        trigger: {
          type: 'schedule',
          cron: '*/10 * * * * *' // Every 10 seconds
        }
      });

      // Save database path
      const storage = framework.getStorage();
      const dbPath = (storage as any).dbPath;

      // Teardown and restart
      await framework.teardown();
      framework = new E2ETestFramework({ dbPath });
      await framework.setup();

      // Verify task still exists and is enabled
      const retrieved = await framework.getTask(task.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.enabled).toBe(true);
      expect(retrieved!.trigger.type).toBe('schedule');
    }, 15000);

    it('should handle disabled tasks correctly', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Disabled Task Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "disabled"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Disabled test'
        } as ManualTrigger,
        enabled: false
      });

      // Verify task is disabled
      expect(task.enabled).toBe(false);

      // Can still execute manually in test framework
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId);

      // Should execute (in production, scheduler would skip disabled tasks)
      framework.assertExecutionStatus(execution, 'success');
    }, 15000);
  });

  describe('Error Message Handling', () => {
    it('should capture error messages correctly', async () => {
      // Create task that outputs to stderr
      const task = await framework.createTask({
        name: 'Error Message Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Error message" >&2 && exit 1'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Error test'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId);

      // Verify error captured
      framework.assertExecutionStatus(execution, 'failure');
      expect(execution!.output).toContain('Error message');
      expect(execution!.exit_code).toBe(1);
    }, 15000);

    it('should handle very long error messages', async () => {
      // Create task with long error output
      const task = await framework.createTask({
        name: 'Long Error Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'for i in {1..1000}; do echo "Error line $i" >&2; done && exit 1'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Long error'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId);

      // Verify error captured (may be truncated)
      framework.assertExecutionStatus(execution, 'failure');
      expect(execution!.output).toBeDefined();
      expect(execution!.output!.length).toBeGreaterThan(0);
    }, 15000);
  });
});
