/**
 * Bash Executor Unit Tests
 *
 * Unit tests for bash executor with mocked dependencies
 * Tests command execution, error handling, and edge cases
 */

import { describe, it, expect } from 'vitest';
import { BashExecutor } from '../../../src/executors/bash-executor.js';
import { TestHelpers } from '../../fixtures/test-helpers.js';

describe('BashExecutor (Unit)', () => {
  const executor = new BashExecutor();

  describe('Basic Command Execution', () => {
    it('should execute simple command successfully', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "test"'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.exit_code).toBe(0);
      expect(result.output).toContain('test');
      expect(result.duration_ms).toBeGreaterThan(0);
    });

    it('should capture stdout', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "stdout output"'
        }
      });

      const result = await executor.execute(task);

      expect(result.output).toContain('stdout output');
    });

    it('should capture stderr', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "error message" >&2'
        }
      });

      const result = await executor.execute(task);

      expect(result.output).toContain('error message');
    });

    it('should combine stdout and stderr', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "stdout"; echo "stderr" >&2'
        }
      });

      const result = await executor.execute(task);

      expect(result.output).toContain('stdout');
      expect(result.output).toContain('stderr');
    });
  });

  describe('Error Handling', () => {
    it('should handle non-zero exit code', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 1'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('failure');
      expect(result.exit_code).toBe(1);
      expect(result.error).toContain('exited with code 1');
    });

    it('should handle custom exit codes', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'exit 42'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('failure');
      expect(result.exit_code).toBe(42);
    });

    it('should handle command not found', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'nonexistentcommand123456'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('failure');
      expect(result.exit_code).not.toBe(0);
    });

    it('should throw error for invalid task config type', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'ai_prompt', // Wrong type
          prompt: 'test'
        } as any
      });

      await expect(executor.execute(task)).rejects.toThrow('Invalid task config type');
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running command', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'sleep 10',
          timeout: 500 // 500ms timeout
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('timeout');
      expect(result.error).toContain('timed out');
      expect(result.duration_ms).toBeLessThan(10000);
    }, 10000); // Test timeout of 10s

    it('should use default timeout when not specified', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "test"'
          // No timeout specified, should use default 120s
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
    });

    it('should use task options timeout if specified', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'sleep 5'
        },
        options: {
          timeout: 500
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('timeout');
    }, 10000);
  });

  describe('Working Directory', () => {
    it('should execute in specified working directory', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'pwd',
          cwd: '/tmp'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toContain('/tmp');
    });

    it('should use current directory when not specified', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'pwd'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
    });
  });

  describe('Environment Variables', () => {
    it('should use custom environment variables', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo $CUSTOM_VAR',
          env: {
            CUSTOM_VAR: 'custom_value'
          }
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toContain('custom_value');
    });

    it('should inherit process environment', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo $PATH'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
    });

    it('should override process environment with custom vars', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo $TEST_OVERRIDE',
          env: {
            TEST_OVERRIDE: 'override_value'
          }
        }
      });

      const result = await executor.execute(task);

      expect(result.output).toContain('override_value');
    });
  });

  describe('Complex Commands', () => {
    it('should execute multiline script', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: `
            VAR1="hello"
            VAR2="world"
            echo "$VAR1 $VAR2"
          `
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toContain('hello world');
    });

    it('should execute commands with pipes', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "hello world" | grep "world"'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toContain('world');
    });

    it('should execute commands with redirects', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "test" > /dev/null; echo "done"'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toContain('done');
    });

    it('should execute commands with logical operators', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'true && echo "success"'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toContain('success');
    });

    it('should handle commands with special characters', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "test\'s quote"'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toContain("test's quote");
    });
  });

  describe('Performance', () => {
    it('should track execution duration', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'sleep 0.1'
        }
      });

      const result = await executor.execute(task);

      expect(result.duration_ms).toBeGreaterThan(50);
      expect(result.duration_ms).toBeLessThan(500);
    });

    it('should track duration for failed commands', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'sleep 0.1 && exit 1'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('failure');
      expect(result.duration_ms).toBeGreaterThan(50);
    });

    it('should track duration for timed out commands', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'sleep 10',
          timeout: 200
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('timeout');
      expect(result.duration_ms).toBeLessThan(10000);
    }, 10000);
  });

  describe('Edge Cases', () => {
    it('should handle empty command output', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'true' // No output
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toBe('');
    });

    it('should handle very long output', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'seq 1 1000 | while read i; do echo "line $i"; done'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output.length).toBeGreaterThan(1000);
    });

    it('should handle commands with newlines in output', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo -e "line1\\nline2\\nline3"'
        }
      });

      const result = await executor.execute(task);

      expect(result.status).toBe('success');
      expect(result.output).toContain('line1');
      expect(result.output).toContain('line2');
      expect(result.output).toContain('line3');
    });

    it('should trim output whitespace', async () => {
      const task = TestHelpers.createMockTask({
        type: 'bash',
        task_config: {
          type: 'bash',
          command: 'echo "  test  "'
        }
      });

      const result = await executor.execute(task);

      expect(result.output.trim()).toBe('test');
    });
  });
});
