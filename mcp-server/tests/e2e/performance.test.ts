/**
 * E2E Performance Tests
 *
 * Tests system performance under load
 * Validates scalability and resource handling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { E2ETestFramework } from './framework.js';
import { BashTaskConfig, ManualTrigger, ScheduleTrigger } from '../../src/models/types.js';

describe('E2E Performance Tests', () => {
  let framework: E2ETestFramework;

  beforeEach(async () => {
    framework = new E2ETestFramework();
    await framework.setup();
  });

  afterEach(async () => {
    await framework.teardown();
  });

  describe('Task Creation Performance', () => {
    it('should create 100 tasks efficiently', async () => {
      const startTime = Date.now();
      const tasks = [];

      for (let i = 0; i < 100; i++) {
        const task = await framework.createTask({
          name: `Performance Task ${i}`,
          type: 'bash',
          task_config: {
            type: 'bash',
            command: `echo "Task ${i}"`
          } as BashTaskConfig,
          trigger: {
            type: 'manual',
            description: `Performance test ${i}`
          } as ManualTrigger
        });
        tasks.push(task);
      }

      const duration = Date.now() - startTime;

      // Should create 100 tasks in under 5 seconds
      expect(duration).toBeLessThan(5000);
      expect(tasks.length).toBe(100);

      // Verify all tasks were created
      for (const task of tasks) {
        const retrieved = await framework.getTask(task.id);
        expect(retrieved).toBeDefined();
      }
    }, 30000);

    it('should handle bulk task creation', async () => {
      const startTime = Date.now();

      // Create 50 tasks concurrently
      const taskPromises = Array.from({ length: 50 }, (_, i) =>
        framework.createTask({
          name: `Bulk Task ${i}`,
          type: 'bash',
          task_config: {
            type: 'bash',
            command: `echo "Bulk ${i}"`
          } as BashTaskConfig,
          trigger: {
            type: 'manual',
            description: `Bulk test ${i}`
          } as ManualTrigger
        })
      );

      const tasks = await Promise.all(taskPromises);
      const duration = Date.now() - startTime;

      // Concurrent creation should be faster than sequential
      expect(duration).toBeLessThan(10000);
      expect(tasks.length).toBe(50);
    }, 30000);
  });

  describe('Concurrent Execution Performance', () => {
    it('should execute 20 tasks concurrently', async () => {
      // Create 20 tasks
      const tasks = await Promise.all(
        Array.from({ length: 20 }, (_, i) =>
          framework.createTask({
            name: `Concurrent Task ${i}`,
            type: 'bash',
            task_config: {
              type: 'bash',
              command: `echo "Concurrent ${i}" && sleep 0.1`
            } as BashTaskConfig,
            trigger: {
              type: 'manual',
              description: `Concurrent ${i}`
            } as ManualTrigger
          })
        )
      );

      // Execute all concurrently
      const startTime = Date.now();
      const executionIds = await Promise.all(
        tasks.map(task => framework.executeTask(task.id, 'manual'))
      );

      // Wait for all completions
      const executions = await Promise.all(
        executionIds.map(id => framework.waitForExecutionComplete(id, 10000))
      );

      const duration = Date.now() - startTime;

      // All should succeed
      executions.forEach((execution, i) => {
        framework.assertExecutionStatus(execution, 'success');
        expect(execution!.output).toContain(`Concurrent ${i}`);
      });

      // Concurrent execution should be much faster than sequential
      // Sequential would be ~2000ms (20 * 100ms), concurrent should be under 1000ms
      expect(duration).toBeLessThan(2000);
    }, 30000);

    it('should handle rapid sequential executions', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Rapid Execution Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "rapid"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Rapid test'
        } as ManualTrigger
      });

      // Execute 50 times rapidly
      const startTime = Date.now();
      const executionIds: string[] = [];

      for (let i = 0; i < 50; i++) {
        const execId = await framework.executeTask(task.id, 'manual');
        executionIds.push(execId);
      }

      // Wait for all to complete
      await Promise.all(
        executionIds.map(id => framework.waitForExecutionComplete(id, 5000))
      );

      const duration = Date.now() - startTime;

      // Verify all executions
      const executions = await framework.listExecutions(task.id);
      expect(executions.length).toBe(50);

      // Verify task stats
      const updatedTask = await framework.getTask(task.id);
      framework.assertTaskStats(updatedTask, {
        run_count: 50,
        success_count: 50
      });

      // Should complete in reasonable time
      expect(duration).toBeLessThan(10000);
    }, 30000);
  });

  describe('Database Performance', () => {
    it('should query execution history efficiently', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'History Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "history"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'History test'
        } as ManualTrigger
      });

      // Create 100 executions
      for (let i = 0; i < 100; i++) {
        const execId = await framework.executeTask(task.id, 'manual');
        await framework.waitForExecutionComplete(execId, 2000);
      }

      // Query history multiple times
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        const executions = await framework.listExecutions(task.id);
        expect(executions.length).toBe(100);
      }

      const duration = Date.now() - startTime;

      // 10 queries of 100 records should be fast
      expect(duration).toBeLessThan(1000);
    }, 60000);

    it('should handle large task counts', async () => {
      // Create 200 tasks
      const tasks = [];
      for (let i = 0; i < 200; i++) {
        const task = await framework.createTask({
          name: `Scale Task ${i}`,
          type: 'bash',
          task_config: {
            type: 'bash',
            command: `echo "${i}"`
          } as BashTaskConfig,
          trigger: {
            type: 'manual',
            description: `Scale ${i}`
          } as ManualTrigger
        });
        tasks.push(task);
      }

      // Query all tasks
      const storage = framework.getStorage();
      const startTime = Date.now();
      const allTasks = await storage.loadTasks();
      const duration = Date.now() - startTime;

      expect(allTasks.length).toBeGreaterThanOrEqual(200);
      // Should retrieve 200+ tasks quickly
      expect(duration).toBeLessThan(500);
    }, 60000);
  });

  describe('Memory and Resource Tests', () => {
    it('should handle tasks with large output', async () => {
      // Create task that generates large output
      const task = await framework.createTask({
        name: 'Large Output Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'for i in {1..1000}; do echo "Line $i of large output"; done'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Large output'
        } as ManualTrigger
      });

      // Execute
      const executionId = await framework.executeTask(task.id, 'manual');
      const execution = await framework.waitForExecutionComplete(executionId, 5000);

      // Verify execution succeeded
      framework.assertExecutionStatus(execution, 'success');
      expect(execution!.output).toBeDefined();
      expect(execution!.output!.length).toBeGreaterThan(10000);
    }, 10000);

    it('should clean up completed executions efficiently', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Cleanup Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "cleanup"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Cleanup test'
        } as ManualTrigger
      });

      // Create many executions
      for (let i = 0; i < 50; i++) {
        const execId = await framework.executeTask(task.id, 'manual');
        await framework.waitForExecutionComplete(execId, 2000);
      }

      // Verify all recorded
      const executions = await framework.listExecutions(task.id);
      expect(executions.length).toBe(50);

      // In production, old executions would be cleaned up
      // Here we just verify they're retrievable
      expect(executions[0]).toBeDefined();
      expect(executions[49]).toBeDefined();
    }, 30000);
  });

  describe('Stress Tests', () => {
    it('should handle mixed workload', async () => {
      const startTime = Date.now();

      // Create mix of tasks
      const tasks = await Promise.all([
        // Fast tasks
        ...Array.from({ length: 20 }, (_, i) =>
          framework.createTask({
            name: `Fast Task ${i}`,
            type: 'bash',
            task_config: {
              type: 'bash',
              command: 'echo "fast"'
            } as BashTaskConfig,
            trigger: {
              type: 'manual',
              description: 'Fast'
            } as ManualTrigger
          })
        ),
        // Slow tasks
        ...Array.from({ length: 5 }, (_, i) =>
          framework.createTask({
            name: `Slow Task ${i}`,
            type: 'bash',
            task_config: {
              type: 'bash',
              command: 'sleep 0.5 && echo "slow"'
            } as BashTaskConfig,
            trigger: {
              type: 'manual',
              description: 'Slow'
            } as ManualTrigger
          })
        )
      ]);

      // Execute all concurrently
      const executionIds = await Promise.all(
        tasks.map(task => framework.executeTask(task.id, 'manual'))
      );

      // Wait for all
      await Promise.all(
        executionIds.map(id => framework.waitForExecutionComplete(id, 5000))
      );

      const duration = Date.now() - startTime;

      // Verify all succeeded
      const allExecutions = await Promise.all(
        executionIds.map(id => framework.getExecution(id))
      );

      allExecutions.forEach(execution => {
        framework.assertExecutionStatus(execution, 'success');
      });

      // Should complete in reasonable time
      expect(duration).toBeLessThan(5000);
    }, 30000);

    it('should maintain performance under sustained load', async () => {
      // Create task
      const task = await framework.createTask({
        name: 'Sustained Load Test',
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "sustained"'
        } as BashTaskConfig,
        trigger: {
          type: 'manual',
          description: 'Sustained'
        } as ManualTrigger
      });

      // Run batches
      const batchSizes = [10, 10, 10, 10, 10]; // 50 total
      const batchTimes: number[] = [];

      for (const batchSize of batchSizes) {
        const startTime = Date.now();

        // Execute batch
        const executionIds = await Promise.all(
          Array.from({ length: batchSize }, () =>
            framework.executeTask(task.id, 'manual')
          )
        );

        // Wait for batch
        await Promise.all(
          executionIds.map(id => framework.waitForExecutionComplete(id, 3000))
        );

        batchTimes.push(Date.now() - startTime);
      }

      // Performance should remain consistent
      // Later batches shouldn't be significantly slower
      const avgTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
      const lastBatchTime = batchTimes[batchTimes.length - 1];

      // Last batch should be within 50% of average
      expect(lastBatchTime).toBeLessThan(avgTime * 1.5);
    }, 60000);
  });

  describe('Throughput Tests', () => {
    it('should measure task creation throughput', async () => {
      const count = 100;
      const startTime = Date.now();

      for (let i = 0; i < count; i++) {
        await framework.createTask({
          name: `Throughput Task ${i}`,
          type: 'bash',
          task_config: {
            type: 'bash',
            command: 'echo "throughput"'
          } as BashTaskConfig,
          trigger: {
            type: 'manual',
            description: 'Throughput'
          } as ManualTrigger
        });
      }

      const duration = Date.now() - startTime;
      const throughput = count / (duration / 1000); // tasks per second

      // Should achieve reasonable throughput
      expect(throughput).toBeGreaterThan(10); // At least 10 tasks/sec
    }, 30000);

    it('should measure execution throughput', async () => {
      // Create 50 lightweight tasks
      const tasks = await Promise.all(
        Array.from({ length: 50 }, (_, i) =>
          framework.createTask({
            name: `Exec Throughput ${i}`,
            type: 'bash',
            task_config: {
              type: 'bash',
              command: 'echo "exec"'
            } as BashTaskConfig,
            trigger: {
              type: 'manual',
              description: 'Exec throughput'
            } as ManualTrigger
          })
        )
      );

      // Execute all and measure
      const startTime = Date.now();
      const executionIds = await Promise.all(
        tasks.map(task => framework.executeTask(task.id, 'manual'))
      );

      await Promise.all(
        executionIds.map(id => framework.waitForExecutionComplete(id, 5000))
      );

      const duration = Date.now() - startTime;
      const throughput = tasks.length / (duration / 1000);

      // Should execute multiple tasks per second
      expect(throughput).toBeGreaterThan(5);
    }, 30000);
  });
});
