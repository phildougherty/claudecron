/**
 * E2E Workflow Tests
 *
 * Complete end-to-end workflow tests for ClaudeCron
 * Tests full task lifecycle from creation to execution
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { E2ETestFramework } from './framework.js';
import { BashTaskConfig, ScheduleTrigger, ManualTrigger, DependencyTrigger } from '../../src/models/types.js';

describe('E2E Workflow Tests', () => {
  let framework: E2ETestFramework;

  beforeEach(async () => {
    framework = new E2ETestFramework();
    await framework.setup();
  });

  afterEach(async () => {
    await framework.teardown();
  });

  describe('Basic Task Workflows', () => {
    it('should create, execute, and verify a bash task', async () => {
      // 1. Create task
      const task = await framework.createTask({
        name: 'E2E Echo Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "E2E test successful"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Manual test execution'
        } as ManualTrigger
      });

      expect(task.id).toBeDefined();
      expect(task.name).toBe('E2E Echo Test');
      expect(task.enabled).toBe(true);

      // 2. Execute task
      const executionId = await framework.executeTask(task.id, 'manual');

      // 3. Wait for completion
      const execution = await framework.waitForExecutionComplete(executionId, 5000);

      // 4. Verify execution results
      expect(execution).toBeDefined();
      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toContain('E2E test successful');
      expect(execution!.trigger_type).toBe('manual');
      expect(execution!.duration_ms).toBeGreaterThan(0);

      // 5. Verify task statistics updated
      const updatedTask = await framework.getTask(task.id);
      framework.assertTaskStats(updatedTask, {
        run_count: 1,
        success_count: 1,
        failure_count: 0
      });
    }, 10000);

    it('should handle task failure and update statistics', async () => {
      // Create failing task
      const task = await framework.createTask({
        name: 'Failing Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Test failure'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');

      // Wait for completion
      const execution = await framework.waitForExecutionComplete(executionId);

      // Verify failure
      framework.assertExecutionStatus(execution, 'failure');
      expect(execution!.exit_code).toBe(1);

      // Verify stats
      const updatedTask = await framework.getTask(task.id);
      framework.assertTaskStats(updatedTask, {
        run_count: 1,
        success_count: 0,
        failure_count: 1
      });
    }, 10000);

    it('should handle task timeout correctly', async () => {
      // Create task with short timeout
      const task = await framework.createTask({
        name: 'Timeout Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'sleep 10',
          timeout: 1000 // 1 second
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Timeout test'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');

      // Wait for timeout
      const execution = await framework.waitForExecutionComplete(executionId, 5000);

      // Verify timeout
      framework.assertExecutionStatus(execution, 'timeout');

      // Verify stats
      const updatedTask = await framework.getTask(task.id);
      framework.assertTaskStats(updatedTask, {
        run_count: 1,
        success_count: 0,
        failure_count: 1
      });
    }, 10000);

    it('should execute tasks with custom working directory', async () => {
      // Create task with custom cwd
      const task = await framework.createTask({
        name: 'CWD Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'pwd',
          cwd: '/tmp'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'CWD test'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');

      // Wait for completion
      const execution = await framework.waitForExecutionComplete(executionId);

      // Verify
      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toContain('/tmp');
    }, 10000);

    it('should execute tasks with environment variables', async () => {
      // Create task with env vars
      const task = await framework.createTask({
        name: 'Env Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo $TEST_VAR',
          env: {
            TEST_VAR: 'test_value'
          }
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Env test'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');

      // Wait for completion
      const execution = await framework.waitForExecutionComplete(executionId);

      // Verify
      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toContain('test_value');
    }, 10000);
  });

  describe('Multiple Execution Workflows', () => {
    it('should track statistics across multiple executions', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Multi-Execution Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "run"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Multiple runs'
        } as ManualTrigger
      });

      // Execute 3 times
      for (let i = 0; i < 3; i++) {
        const executionId = await framework.executeTask(task.id, 'manual');
        await framework.waitForExecutionComplete(executionId);
      }

      // Verify stats
      const updatedTask = await framework.getTask(task.id);
      framework.assertTaskStats(updatedTask, {
        run_count: 3,
        success_count: 3,
        failure_count: 0
      });

      // Verify all executions recorded
      const executions = await framework.listExecutions(task.id);
      expect(executions.length).toBe(3);
    }, 15000);

    it('should track mixed success and failure executions', async () => {
      // Create task that alternates success/failure
      const tempFile = framework.createTempFile('0');
      const task = await framework.createTask({
        name: 'Mixed Results Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: `
            COUNT=$(cat ${tempFile})
            NEXT=$((COUNT + 1))
            echo $NEXT > ${tempFile}
            test $((COUNT % 2)) -eq 0
          `
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Mixed results'
        } as ManualTrigger
      });

      // Execute 4 times (success, fail, success, fail)
      for (let i = 0; i < 4; i++) {
        const executionId = await framework.executeTask(task.id, 'manual');
        await framework.waitForExecutionComplete(executionId);
      }

      // Verify stats
      const updatedTask = await framework.getTask(task.id);
      framework.assertTaskStats(updatedTask, {
        run_count: 4,
        success_count: 2,
        failure_count: 2
      });
    }, 15000);
  });

  describe('Persistence Workflows', () => {
    it('should persist task data across framework restarts', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Persistence Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "persistent"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Test persistence'
        } as ManualTrigger
      });

      const taskId = task.id;

      // Execute once
      const executionId = await framework.executeTask(taskId, 'manual');
      await framework.waitForExecutionComplete(executionId);

      // Save database path
      const dbPath = (framework as any).dbPath;

      // Teardown
      await framework.teardown();

      // Setup new framework with same database
      framework = new E2ETestFramework({ dbPath });
      await framework.setup();

      // Verify task still exists
      const retrievedTask = await framework.getTask(taskId);
      expect(retrievedTask).toBeDefined();
      expect(retrievedTask!.name).toBe('Persistence Test');
      framework.assertTaskStats(retrievedTask, {
        run_count: 1,
        success_count: 1
      });

      // Verify execution history persisted
      const executions = await framework.listExecutions(taskId);
      expect(executions.length).toBe(1);
      expect(executions[0].status).toBe('success');
    }, 15000);
  });

  describe('Conditional Execution Workflows', () => {
    it('should skip task when file does not exist', async () => {
      const nonExistentFile = '/tmp/non-existent-file-' + Date.now();

      // Create task with file condition
      const task = await framework.createTask({
        name: 'Conditional Skip Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Should not run"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Conditional test'
        } as ManualTrigger,
        conditions: {
          only_if_file_exists: nonExistentFile
        }
      });

      // Execute - should be skipped
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId);

      // Verify skipped
      framework.assertExecutionStatus(execution, 'skipped');
    }, 10000);

    it('should execute task when file exists', async () => {
      const tempFile = framework.createTempFile('test content');

      // Create task with file condition
      const task = await framework.createTask({
        name: 'Conditional Execute Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "Should run"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Conditional test'
        } as ManualTrigger,
        conditions: {
          only_if_file_exists: tempFile
        }
      });

      // Execute - should run
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId);

      // Verify executed
      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toContain('Should run');
    }, 10000);
  });

  describe('Complex Workflow Scenarios', () => {
    it('should handle sequential task executions', async () => {
      // Create parent task
      const parentTask = await framework.createTask({
        name: 'Parent Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "parent completed"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Parent'
        } as ManualTrigger
      });

      // Execute parent
      const parentExecId = await framework.executeTask(parentTask.id, 'manual');
      const parentExec = await framework.waitForExecutionComplete(parentExecId);

      // Verify parent success
      framework.assertExecutionStatus(parentExec, 'success');

      // Create dependent task (would be triggered by dependency in real scenario)
      const childTask = await framework.createTask({
        name: 'Child Task',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "child completed"'
        } as BashTaskConfig,
        trigger: {
          type: 'dependency',
          depends_on: [parentTask.id],
          require_all: true
        } as DependencyTrigger
      });

      // Manually execute child (dependency trigger would do this automatically)
      const childExecId = await framework.executeTask(childTask.id, 'dependency');
      const childExec = await framework.waitForExecutionComplete(childExecId);

      // Verify child success
      framework.assertExecutionStatus(childExec, 'success');

      // Verify both tasks have correct stats
      const updatedParent = await framework.getTask(parentTask.id);
      const updatedChild = await framework.getTask(childTask.id);

      framework.assertTaskStats(updatedParent, {
        run_count: 1,
        success_count: 1
      });

      framework.assertTaskStats(updatedChild, {
        run_count: 1,
        success_count: 1
      });
    }, 15000);

    it('should handle concurrent task executions', async () => {
      // Create multiple tasks
      const tasks = await Promise.all([
        framework.createTask({
          name: 'Concurrent Task 1',
          type: 'bash',
          task_config: {
            type: 'bash',
            command: 'echo "task1" && sleep 0.5'
          } as BashTaskConfig,
          trigger: {
            type: 'manual',
            description: 'Concurrent 1'
          } as ManualTrigger
        }),
        framework.createTask({
          name: 'Concurrent Task 2',
          type: 'bash',
          task_config: {
            type: 'bash',
            command: 'echo "task2" && sleep 0.5'
          } as BashTaskConfig,
          trigger: {
            type: 'manual',
            description: 'Concurrent 2'
          } as ManualTrigger
        }),
        framework.createTask({
          name: 'Concurrent Task 3',
          type: 'bash',
          task_config: {
            type: 'bash',
            command: 'echo "task3" && sleep 0.5'
          } as BashTaskConfig,
          trigger: {
            type: 'manual',
            description: 'Concurrent 3'
          } as ManualTrigger
        })
      ]);

      // Execute all concurrently
      const startTime = Date.now();
      const executionIds = await Promise.all(
        tasks.map(task => framework.executeTask(task.id, 'manual'))
      );

      // Wait for all to complete
      const executions = await Promise.all(
        executionIds.map(id => framework.waitForExecutionComplete(id))
      );

      const totalTime = Date.now() - startTime;

      // Verify all succeeded
      executions.forEach(execution => {
        framework.assertExecutionStatus(execution, 'success');
      });

      // Concurrent execution should be faster than sequential
      // Sequential would take ~1500ms, concurrent should be less
      expect(totalTime).toBeLessThan(2000);
    }, 15000);
  });
});
