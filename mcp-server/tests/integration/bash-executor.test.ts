/**
 * Bash Executor Integration Tests
 *
 * Tests the bash executor with real command execution
 */

import { describe, it, expect } from 'vitest';
import { BashExecutor } from '../../src/executors/bash-executor.js';
import { Task, BashTaskConfig } from '../../src/models/types.js';
import * as fs from 'fs';
import * as path from 'path';

describe('BashExecutor Integration Tests', () => {
  const executor = new BashExecutor();

  it('should execute a simple bash command successfully', async () => {
    const task: Task = {
      id: 'test-1',
      name: 'Echo Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "Hello, World!"',
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('success');
    expect(result.output).toContain('Hello, World!');
    expect(result.exit_code).toBe(0);
    expect(result.duration_ms).toBeGreaterThan(0);
  });

  it('should handle command with non-zero exit code', async () => {
    const task: Task = {
      id: 'test-2',
      name: 'Failing Command',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'exit 42',
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('failure');
    expect(result.exit_code).toBe(42);
    expect(result.error).toContain('exited with code 42');
  });

  it('should execute command with custom working directory', async () => {
    const task: Task = {
      id: 'test-3',
      name: 'CWD Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'pwd',
        cwd: '/tmp',
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('success');
    expect(result.output).toContain('/tmp');
  });

  it('should execute command with environment variables', async () => {
    const task: Task = {
      id: 'test-4',
      name: 'Env Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo $TEST_VAR',
        env: {
          TEST_VAR: 'custom_value',
        },
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('success');
    expect(result.output).toContain('custom_value');
  });

  it('should handle command timeout', async () => {
    const task: Task = {
      id: 'test-5',
      name: 'Timeout Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'sleep 10',
        timeout: 1000, // 1 second timeout
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('timeout');
    expect(result.error).toContain('timed out');
  }, 5000); // 5 second test timeout

  it('should capture both stdout and stderr', async () => {
    const task: Task = {
      id: 'test-6',
      name: 'Stderr Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "stdout message"; echo "stderr message" >&2',
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('success');
    expect(result.output).toContain('stdout message');
    expect(result.output).toContain('stderr message');
  });

  it('should execute multiline bash script', async () => {
    const task: Task = {
      id: 'test-7',
      name: 'Multiline Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: `
          NAME="ClaudeCron"
          echo "Hello, $NAME"
          echo "Goodbye, $NAME"
        `,
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('success');
    expect(result.output).toContain('Hello, ClaudeCron');
    expect(result.output).toContain('Goodbye, ClaudeCron');
  });

  it('should execute command that writes to file', async () => {
    const testFile = `/tmp/bash-executor-test-${Date.now()}.txt`;

    const task: Task = {
      id: 'test-8',
      name: 'File Write Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: `echo "test content" > ${testFile}`,
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('success');
    expect(fs.existsSync(testFile)).toBe(true);

    const content = fs.readFileSync(testFile, 'utf-8');
    expect(content).toContain('test content');

    // Cleanup
    fs.unlinkSync(testFile);
  });

  it('should use default timeout if not specified', async () => {
    const task: Task = {
      id: 'test-9',
      name: 'Default Timeout Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "test"',
        // No timeout specified, should use default 120s
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('success');
  });

  it('should handle command with pipe operators', async () => {
    const task: Task = {
      id: 'test-10',
      name: 'Pipe Test',
      enabled: true,
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "hello world" | tr "a-z" "A-Z"',
      } as BashTaskConfig,
      trigger: {
        type: 'manual',
        description: 'Test',
      },
      run_count: 0,
      success_count: 0,
      failure_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = await executor.execute(task);

    expect(result.status).toBe('success');
    expect(result.output).toContain('HELLO WORLD');
  });
});
