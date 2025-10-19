/**
 * MCP Tools Unit Tests
 *
 * Tests for MCP tools registration and handlers
 * Uses mocked MCP server and storage
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerTools } from '../../../src/tools/index.js';
import { Scheduler } from '../../../src/scheduler/scheduler.js';
import { MockStorage, TestHelpers } from '../../fixtures/test-helpers.js';

// Mock MCP Server
class MockMCPServer {
  private toolsHandler: any = null;
  private callHandler: any = null;

  setRequestHandler(schema: any, handler: any) {
    if (schema.method === 'tools/list') {
      this.toolsHandler = handler;
    } else if (schema.method === 'tools/call') {
      this.callHandler = handler;
    }
  }

  async listTools() {
    if (!this.toolsHandler) throw new Error('No tools handler registered');
    return await this.toolsHandler();
  }

  async callTool(name: string, args: any) {
    if (!this.callHandler) throw new Error('No call handler registered');
    return await this.callHandler({ params: { name, arguments: args } });
  }
}

// Mock schemas
const ListToolsRequestSchema = { method: 'tools/list' };
const CallToolRequestSchema = { method: 'tools/call' };

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  ListToolsRequestSchema: { method: 'tools/list' },
  CallToolRequestSchema: { method: 'tools/call' }
}));

describe('MCP Tools', () => {
  let server: MockMCPServer;
  let storage: MockStorage;
  let scheduler: Scheduler;

  beforeEach(async () => {
    server = new MockMCPServer();
    storage = new MockStorage();
    scheduler = new Scheduler(storage);

    await registerTools(server as any, scheduler, storage);
  });

  describe('Tool Registration', () => {
    it('should register all ClaudeCron tools', async () => {
      const response = await server.listTools();

      expect(response.tools).toHaveLength(8);

      const toolNames = response.tools.map((t: any) => t.name);
      expect(toolNames).toContain('claudecron_add_task');
      expect(toolNames).toContain('claudecron_list_tasks');
      expect(toolNames).toContain('claudecron_get_task');
      expect(toolNames).toContain('claudecron_update_task');
      expect(toolNames).toContain('claudecron_delete_task');
      expect(toolNames).toContain('claudecron_run_task');
      expect(toolNames).toContain('claudecron_list_executions');
      expect(toolNames).toContain('claudecron_get_execution');
    });

    it('should register tools with proper schemas', async () => {
      const response = await server.listTools();
      const addTask = response.tools.find((t: any) => t.name === 'claudecron_add_task');

      expect(addTask).toBeDefined();
      expect(addTask.description).toBeTruthy();
      expect(addTask.inputSchema).toBeDefined();
      expect(addTask.inputSchema.properties).toBeDefined();
      expect(addTask.inputSchema.required).toContain('name');
      expect(addTask.inputSchema.required).toContain('type');
      expect(addTask.inputSchema.required).toContain('task_config');
      expect(addTask.inputSchema.required).toContain('trigger');
    });
  });

  describe('claudecron_add_task', () => {
    it('should create a new task', async () => {
      const response = await server.callTool('claudecron_add_task', {
        name: 'Test Task',
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Test' }
      });

      expect(response.content[0].text).toContain('created successfully');
      expect(response.content[0].text).toContain('Test Task');

      const tasks = await storage.loadTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].name).toBe('Test Task');
    });

    it('should create task with optional fields', async () => {
      const response = await server.callTool('claudecron_add_task', {
        name: 'Complex Task',
        description: 'A complex task',
        type: 'ai_prompt',
        task_config: {
          type: 'ai_prompt',
          prompt: 'Test',
          allowed_tools: ['Read', 'Write']
        },
        trigger: { type: 'schedule', cron: '0 * * * *' },
        options: { permission_mode: 'bypassPermissions' },
        conditions: { skip_holidays: true }
      });

      expect(response.content[0].text).toContain('created successfully');

      const tasks = await storage.loadTasks();
      expect(tasks[0].description).toBe('A complex task');
      expect(tasks[0].options).toBeDefined();
      expect(tasks[0].conditions).toBeDefined();
    });

    it('should return error for missing required fields', async () => {
      const response = await server.callTool('claudecron_add_task', {
        name: 'Incomplete Task'
        // Missing type, task_config, trigger
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Missing required fields');
    });

    it('should enable task by default', async () => {
      await server.callTool('claudecron_add_task', {
        name: 'Default Enabled',
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' }
      });

      const tasks = await storage.loadTasks();
      expect(tasks[0].enabled).toBe(true);
    });

    it('should respect enabled: false', async () => {
      await server.callTool('claudecron_add_task', {
        name: 'Disabled Task',
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        enabled: false
      });

      const tasks = await storage.loadTasks();
      expect(tasks[0].enabled).toBe(false);
    });
  });

  describe('claudecron_list_tasks', () => {
    beforeEach(async () => {
      await storage.createTask({
        name: 'Enabled Bash',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 5,
        success_count: 4,
        failure_count: 1
      });

      await storage.createTask({
        name: 'Disabled AI',
        enabled: false,
        type: 'ai_prompt',
        task_config: { type: 'ai_prompt', prompt: 'test' },
        trigger: { type: 'schedule', cron: '0 * * * *' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });
    });

    it('should list all tasks', async () => {
      const response = await server.callTool('claudecron_list_tasks', {});

      expect(response.content[0].text).toContain('Found 2 task(s)');
      expect(response.content[0].text).toContain('Enabled Bash');
      expect(response.content[0].text).toContain('Disabled AI');
    });

    it('should filter by enabled status', async () => {
      const response = await server.callTool('claudecron_list_tasks', {
        enabled: true
      });

      expect(response.content[0].text).toContain('Found 1 task(s)');
      expect(response.content[0].text).toContain('Enabled Bash');
      expect(response.content[0].text).not.toContain('Disabled AI');
    });

    it('should filter by type', async () => {
      const response = await server.callTool('claudecron_list_tasks', {
        type: 'bash'
      });

      expect(response.content[0].text).toContain('Found 1 task(s)');
      expect(response.content[0].text).toContain('Enabled Bash');
    });

    it('should return message when no tasks found', async () => {
      storage.clear();

      const response = await server.callTool('claudecron_list_tasks', {});

      expect(response.content[0].text).toBe('No tasks found.');
    });

    it('should include task statistics', async () => {
      const response = await server.callTool('claudecron_list_tasks', {});

      expect(response.content[0].text).toContain('runs');
      expect(response.content[0].text).toContain('success_rate');
    });
  });

  describe('claudecron_get_task', () => {
    it('should get task by id', async () => {
      const task = await storage.createTask({
        name: 'Get Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const response = await server.callTool('claudecron_get_task', {
        id: task.id
      });

      expect(response.content[0].text).toContain('Get Test');
      expect(response.content[0].text).toContain(task.id);
    });

    it('should return error for missing id', async () => {
      const response = await server.callTool('claudecron_get_task', {});

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Missing required field: id');
    });

    it('should return error for non-existent task', async () => {
      const response = await server.callTool('claudecron_get_task', {
        id: 'non-existent'
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Task not found');
    });
  });

  describe('claudecron_update_task', () => {
    it('should update task fields', async () => {
      const task = await storage.createTask({
        name: 'Original',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const response = await server.callTool('claudecron_update_task', {
        id: task.id,
        updates: {
          name: 'Updated',
          enabled: false
        }
      });

      expect(response.content[0].text).toContain('updated successfully');

      const updated = await storage.getTask(task.id);
      expect(updated?.name).toBe('Updated');
      expect(updated?.enabled).toBe(false);
    });

    it('should return error for missing fields', async () => {
      const response = await server.callTool('claudecron_update_task', {
        id: 'test-id'
        // Missing updates
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Missing required fields');
    });
  });

  describe('claudecron_delete_task', () => {
    it('should delete task', async () => {
      const task = await storage.createTask({
        name: 'To Delete',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const response = await server.callTool('claudecron_delete_task', {
        id: task.id
      });

      expect(response.content[0].text).toContain('deleted successfully');

      const deleted = await storage.getTask(task.id);
      expect(deleted).toBeNull();
    });

    it('should return error for non-existent task', async () => {
      const response = await server.callTool('claudecron_delete_task', {
        id: 'non-existent'
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Task not found');
    });
  });

  describe('claudecron_run_task', () => {
    it('should execute task manually', async () => {
      const task = await storage.createTask({
        name: 'Manual Run',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'echo test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const response = await server.callTool('claudecron_run_task', {
        id: task.id
      });

      expect(response.content[0].text).toContain('Task execution started');
      expect(response.content[0].text).toContain('Execution ID:');

      // Should have created execution
      const executions = await storage.loadExecutions({ task_id: task.id });
      expect(executions.length).toBeGreaterThan(0);
    });

    it('should support override_conditions flag', async () => {
      const task = await storage.createTask({
        name: 'Conditional',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        conditions: {
          only_if_file_exists: '/nonexistent'
        },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const response = await server.callTool('claudecron_run_task', {
        id: task.id,
        override_conditions: true
      });

      expect(response.content[0].text).toContain('Task execution started');
    });
  });

  describe('claudecron_list_executions', () => {
    let taskId: string;

    beforeEach(async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });
      taskId = task.id;

      await storage.createExecution({
        task_id: taskId,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date().toISOString()
      });

      await storage.createExecution({
        task_id: taskId,
        status: 'failure',
        trigger_type: 'scheduled',
        started_at: new Date().toISOString()
      });
    });

    it('should list all executions', async () => {
      const response = await server.callTool('claudecron_list_executions', {});

      expect(response.content[0].text).toContain('Found 2 execution(s)');
    });

    it('should filter by task_id', async () => {
      const response = await server.callTool('claudecron_list_executions', {
        task_id: taskId
      });

      expect(response.content[0].text).toContain('Found 2 execution(s)');
    });

    it('should filter by status', async () => {
      const response = await server.callTool('claudecron_list_executions', {
        status: 'success'
      });

      expect(response.content[0].text).toContain('Found 1 execution(s)');
    });

    it('should apply limit', async () => {
      const response = await server.callTool('claudecron_list_executions', {
        limit: 1
      });

      expect(response.content[0].text).toContain('Found 1 execution(s)');
    });

    it('should return message when no executions found', async () => {
      storage.clear();

      const response = await server.callTool('claudecron_list_executions', {});

      expect(response.content[0].text).toBe('No executions found.');
    });
  });

  describe('claudecron_get_execution', () => {
    it('should get execution by id', async () => {
      const task = await storage.createTask({
        name: 'Test',
        enabled: true,
        type: 'bash',
        task_config: { type: 'bash', command: 'test' },
        trigger: { type: 'manual', description: 'Test' },
        run_count: 0,
        success_count: 0,
        failure_count: 0
      });

      const execution = await storage.createExecution({
        task_id: task.id,
        status: 'success',
        trigger_type: 'manual',
        started_at: new Date().toISOString(),
        output: 'Test output'
      });

      const response = await server.callTool('claudecron_get_execution', {
        id: execution.id
      });

      expect(response.content[0].text).toContain(execution.id);
      expect(response.content[0].text).toContain('Test output');
    });

    it('should return error for missing id', async () => {
      const response = await server.callTool('claudecron_get_execution', {});

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Missing required field: id');
    });

    it('should return error for non-existent execution', async () => {
      const response = await server.callTool('claudecron_get_execution', {
        id: 'non-existent'
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Execution not found');
    });
  });

  describe('Error Handling', () => {
    it('should return error for unknown tool', async () => {
      const response = await server.callTool('unknown_tool', {});

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Unknown tool');
    });

    it('should handle tool execution errors gracefully', async () => {
      // Force an error by calling with invalid data
      const response = await server.callTool('claudecron_update_task', {
        id: 'non-existent',
        updates: { name: 'Test' }
      });

      expect(response.isError).toBe(true);
      expect(response.content[0].text).toContain('Error executing');
    });
  });
});
