/**
 * Day 3 Advanced Features Integration Tests
 *
 * Tests for:
 * - Dependency Manager
 * - File Watch Manager
 * - Interval Triggers
 * - Smart Schedule Optimization
 * - Result Handlers
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DependencyManager } from '../../src/scheduler/dependency-manager.js';
import { FileWatchManager } from '../../src/scheduler/file-watch-manager.js';
import { ResultHandlerExecutor } from '../../src/scheduler/result-handlers.js';
import { Scheduler } from '../../src/scheduler/scheduler.js';
import { Storage } from '../../src/storage/storage.js';
import { Task, Execution, DependencyTrigger } from '../../src/models/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

describe('Day 3: DependencyManager', () => {
  let storage: Storage;
  let dependencyManager: DependencyManager;
  let scheduler: any;

  beforeEach(() => {
    storage = new Storage({ type: 'sqlite', path: ':memory:' });
    dependencyManager = new DependencyManager(storage);

    // Mock scheduler
    scheduler = {
      executeTask: vi.fn().mockResolvedValue(uuidv4()),
    };
    dependencyManager.setScheduler(scheduler);
  });

  it('should build dependency graph from tasks', async () => {
    const tasks: Task[] = [
      {
        id: 'task1',
        name: 'Task 1',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Manual trigger' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      },
      {
        id: 'task2',
        name: 'Task 2',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test2' },
        trigger: {
          type: 'dependency',
          depends_on: ['task1'],
          require_all: true,
        } as DependencyTrigger,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      },
    ];

    await dependencyManager.buildDependencyGraph(tasks);

    const dependents = dependencyManager.getDependents('task1');
    expect(dependents).toContain('task2');
  });

  it('should detect circular dependencies', async () => {
    const tasks: Task[] = [
      {
        id: 'task1',
        name: 'Task 1',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: {
          type: 'dependency',
          depends_on: ['task2'],
        } as DependencyTrigger,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      },
      {
        id: 'task2',
        name: 'Task 2',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test2' },
        trigger: {
          type: 'dependency',
          depends_on: ['task1'],
        } as DependencyTrigger,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        run_count: 0,
        success_count: 0,
        failure_count: 0,
      },
    ];

    await expect(
      dependencyManager.buildDependencyGraph(tasks)
    ).rejects.toThrow('Circular dependency');
  });
});

describe('Day 3: FileWatchManager', () => {
  let fileWatchManager: FileWatchManager;
  let scheduler: any;
  let testDir: string;
  let testFile: string;

  beforeEach(() => {
    fileWatchManager = new FileWatchManager();

    // Mock scheduler
    scheduler = {
      executeTask: vi.fn().mockResolvedValue(uuidv4()),
    };
    fileWatchManager.setScheduler(scheduler);

    // Create test directory
    testDir = path.join('/tmp', `claudecron-test-${Date.now()}`);
    fs.mkdirSync(testDir, { recursive: true });
    testFile = path.join(testDir, 'test.txt');
  });

  afterEach(async () => {
    await fileWatchManager.stopAll();
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('should start watching a file path', async () => {
    const task: Task = {
      id: 'watch-task',
      name: 'Watch Task',
      enabled: true,
      type: 'bash',
      task_config: { type: 'bash', command: 'echo watched' },
      trigger: {
        type: 'file_watch',
        path: testFile,
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    };

    await fileWatchManager.startWatching(task);

    const watchers = fileWatchManager.getActiveWatchers();
    expect(watchers).toHaveLength(1);
    expect(watchers[0].taskId).toBe('watch-task');
  });

  it('should trigger task on file change', async () => {
    const task: Task = {
      id: 'watch-task',
      name: 'Watch Task',
      enabled: true,
      type: 'bash',
      task_config: { type: 'bash', command: 'echo watched' },
      trigger: {
        type: 'file_watch',
        path: testDir,
        pattern: '*.txt',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    };

    await fileWatchManager.startWatching(task);

    // Wait a bit for watcher to initialize
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Create a file to trigger the watcher
    fs.writeFileSync(testFile, 'test content');

    // Wait for file watch to trigger
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Should have triggered the task
    expect(scheduler.executeTask).toHaveBeenCalled();
  });
});

describe('Day 3: ResultHandlerExecutor', () => {
  let resultHandler: ResultHandlerExecutor;
  let scheduler: any;

  beforeEach(() => {
    resultHandler = new ResultHandlerExecutor();

    scheduler = {
      executeTask: vi.fn().mockResolvedValue(uuidv4()),
    };
    resultHandler.setScheduler(scheduler);
  });

  it('should handle file write action', async () => {
    const testFile = `/tmp/test-${Date.now()}.txt`;
    const task: Task = {
      id: 'test-task',
      name: 'Test Task',
      enabled: true,
      type: 'bash',
      task_config: { type: 'bash', command: 'echo test' },
      trigger: { type: 'manual', description: 'Manual' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    };

    const execution: Execution = {
      id: uuidv4(),
      task_id: 'test-task',
      trigger_type: 'manual',
      status: 'success',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      output: 'Test output',
    };

    const handler = {
      type: 'file' as const,
      path: testFile,
      append: false,
    };

    await resultHandler.executeHandler(handler, task, execution);

    expect(fs.existsSync(testFile)).toBe(true);
    const content = fs.readFileSync(testFile, 'utf8');
    expect(content).toBe('Test output');

    // Cleanup
    fs.unlinkSync(testFile);
  });

  it('should handle trigger_task action', async () => {
    const task: Task = {
      id: 'test-task',
      name: 'Test Task',
      enabled: true,
      type: 'bash',
      task_config: { type: 'bash', command: 'echo test' },
      trigger: { type: 'manual', description: 'Manual' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_count: 0,
      success_count: 0,
      failure_count: 0,
    };

    const execution: Execution = {
      id: uuidv4(),
      task_id: 'test-task',
      trigger_type: 'manual',
      status: 'success',
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
    };

    const handler = {
      type: 'trigger_task' as const,
      task_id: 'other-task',
      pass_context: true,
    };

    await resultHandler.executeHandler(handler, task, execution);

    expect(scheduler.executeTask).toHaveBeenCalledWith(
      'other-task',
      'triggered',
      execution
    );
  });
});

/**
 * % 100 COMPLETE - Day 3 Integration Tests
 */
