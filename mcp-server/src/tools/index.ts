/**
 * MCP Tools Registration
 *
 * Registers all ClaudeCron MCP tools with the server
 * Based on CLAUDE_CRON.md specification lines 1946-2145
 *
 * % 0 COMPLETE - MCP tools registration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { Scheduler } from '../scheduler/scheduler.js';
import { Storage } from '../storage/storage.js';
import { ToolAnalytics } from '../analytics/tool-analytics.js';

/**
 * Register all ClaudeCron MCP tools
 *
 * @param server - MCP server instance
 * @param scheduler - Scheduler instance
 * @param storage - Storage instance
 */
export async function registerTools(
  server: Server,
  scheduler: Scheduler,
  storage: Storage
): Promise<void> {
  // % 0 COMPLETE - registerTools

  /**
   * List Tools Handler
   */
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        // Task Management
        {
          name: 'claudecron_add_task',
          description: 'Create a new scheduled task',
          inputSchema: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Task name' },
              description: { type: 'string', description: 'Task description (optional)' },
              type: { type: 'string', description: 'Task type: bash, ai_prompt, slash_command, subagent, tool_call, sdk_query' },
              task_config: { type: 'object', description: 'Task-specific configuration' },
              trigger: { type: 'object', description: 'Trigger configuration (schedule, hook, etc.)' },
              enabled: { type: 'boolean', description: 'Whether task is enabled (default: true)' },
              options: { type: 'object', description: 'Execution options (optional)' },
              conditions: { type: 'object', description: 'Execution conditions (optional)' },
              on_success: { type: 'array', description: 'Success handlers (optional)' },
              on_failure: { type: 'array', description: 'Failure handlers (optional)' },
            },
            required: ['name', 'type', 'task_config', 'trigger'],
          },
        },
        {
          name: 'claudecron_list_tasks',
          description: 'List all scheduled tasks with optional filtering',
          inputSchema: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean', description: 'Filter by enabled status' },
              type: { type: 'string', description: 'Filter by task type' },
            },
          },
        },
        {
          name: 'claudecron_get_task',
          description: 'Get detailed information about a specific task',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Task ID' },
            },
            required: ['id'],
          },
        },
        {
          name: 'claudecron_update_task',
          description: 'Update an existing task',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Task ID' },
              updates: { type: 'object', description: 'Fields to update' },
            },
            required: ['id', 'updates'],
          },
        },
        {
          name: 'claudecron_delete_task',
          description: 'Delete a task permanently',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Task ID' },
            },
            required: ['id'],
          },
        },
        {
          name: 'claudecron_run_task',
          description: 'Manually execute a task immediately',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Task ID' },
              override_conditions: { type: 'boolean', description: 'Ignore task conditions (default: false)' },
            },
            required: ['id'],
          },
        },
        {
          name: 'claudecron_list_executions',
          description: 'List execution history for tasks',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'string', description: 'Filter by task ID' },
              status: { type: 'string', description: 'Filter by status' },
              limit: { type: 'number', description: 'Max results (default: 50)' },
            },
          },
        },
        {
          name: 'claudecron_get_execution',
          description: 'Get detailed information about a specific execution',
          inputSchema: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Execution ID' },
            },
            required: ['id'],
          },
        },
        {
          name: 'claudecron_get_execution_progress',
          description: 'Get real-time progress of a running execution (streaming output and thinking)',
          inputSchema: {
            type: 'object',
            properties: {
              execution_id: { type: 'string', description: 'Execution ID to monitor' },
            },
            required: ['execution_id'],
          },
        },
        {
          name: 'claudecron_trigger_hook',
          description: 'Manually trigger a hook event (for testing)',
          inputSchema: {
            type: 'object',
            properties: {
              event: {
                type: 'string',
                description: 'Hook event type',
                enum: [
                  'SessionStart',
                  'SessionEnd',
                  'PreToolUse',
                  'PostToolUse',
                  'UserPromptSubmit',
                  'Notification',
                  'Stop',
                  'SubagentStop',
                  'PreCompact'
                ]
              },
              context: {
                type: 'object',
                description: 'Hook context data (optional)',
              }
            },
            required: ['event'],
          },
        },
        {
          name: 'claudecron_get_tool_analytics',
          description: 'Get tool usage analytics and statistics',
          inputSchema: {
            type: 'object',
            properties: {
              task_id: { type: 'string', description: 'Filter by task ID (optional)' },
              start_date: { type: 'string', description: 'Start date (ISO 8601) (optional)' },
              end_date: { type: 'string', description: 'End date (ISO 8601) (optional)' },
              limit: { type: 'number', description: 'Limit results (default: 10)' },
              report_type: {
                type: 'string',
                description: 'Type of report: summary, most_used, slowest, failure_rate, all (default: summary)',
              },
            },
          },
        },
      ],
    };
  });

  /**
   * Call Tool Handler
   */
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        // Task Management Tools
        case 'claudecron_add_task':
          return await handleAddTask(args, storage, scheduler);

        case 'claudecron_list_tasks':
          return await handleListTasks(args, storage);

        case 'claudecron_get_task':
          return await handleGetTask(args, storage);

        case 'claudecron_update_task':
          return await handleUpdateTask(args, storage, scheduler);

        case 'claudecron_delete_task':
          return await handleDeleteTask(args, storage, scheduler);

        case 'claudecron_run_task':
          return await handleRunTask(args, storage, scheduler);

        case 'claudecron_list_executions':
          return await handleListExecutions(args, storage);

        case 'claudecron_get_execution':
          return await handleGetExecution(args, storage);

        case 'claudecron_get_execution_progress':
          return await handleGetExecutionProgress(args, storage);

        case 'claudecron_trigger_hook':
          return await handleTriggerHook(args, scheduler);

        case 'claudecron_get_tool_analytics':
          return await handleGetToolAnalytics(args, storage);

        default:
          return {
            content: [{
              type: 'text',
              text: `Unknown tool: ${name}`,
            }],
            isError: true,
          };
      }
    } catch (error: any) {
      return {
        content: [{
          type: 'text',
          text: `Error executing ${name}: ${error.message}`,
        }],
        isError: true,
      };
    }
  });

  console.error('[Tools] Registered 11 ClaudeCron tools');

  // % 100 COMPLETE - registerTools
}

/**
 * Tool Handlers
 */

async function handleAddTask(args: any, storage: Storage, scheduler: Scheduler) {
  // % 100 COMPLETE - handleAddTask

  // Validate required fields
  if (!args.name || !args.type || !args.task_config || !args.trigger) {
    throw new Error('Missing required fields: name, type, task_config, trigger');
  }

  // Create task
  const task = await storage.createTask({
    name: args.name,
    description: args.description,
    enabled: args.enabled !== false,
    type: args.type,
    task_config: args.task_config,
    trigger: args.trigger,
    options: args.options,
    conditions: args.conditions,
    on_success: args.on_success,
    on_failure: args.on_failure,
    run_count: 0,
    success_count: 0,
    failure_count: 0,
  });

  // Schedule if enabled and cron-based
  if (task.enabled && task.trigger.type === 'schedule') {
    try {
      await scheduler.scheduleTask(task);
    } catch (error: any) {
      console.error(`[Tools] Failed to schedule task: ${error.message}`);
    }
  }

  return {
    content: [{
      type: 'text',
      text: `Task "${task.name}" created successfully!\n\nID: ${task.id}\nType: ${task.type}\nTrigger: ${task.trigger.type}\nEnabled: ${task.enabled}`,
    }],
  };

  // % 100 COMPLETE - handleAddTask
}

async function handleListTasks(args: any, storage: Storage) {
  // % 0 COMPLETE - handleListTasks

  const tasks = await storage.loadTasks({
    enabled: args.enabled,
    type: args.type,
  });

  if (tasks.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No tasks found.',
      }],
    };
  }

  const taskList = tasks.map(task => ({
    id: task.id,
    name: task.name,
    type: task.type,
    enabled: task.enabled,
    trigger: task.trigger.type,
    next_run: task.next_run || 'N/A',
    last_run: task.last_run || 'Never',
    runs: task.run_count,
    success_rate: task.run_count > 0
      ? `${((task.success_count / task.run_count) * 100).toFixed(1)}%`
      : 'N/A',
  }));

  return {
    content: [{
      type: 'text',
      text: `Found ${tasks.length} task(s):\n\n${JSON.stringify(taskList, null, 2)}`,
    }],
  };

  // % 100 COMPLETE - handleListTasks
}

async function handleGetTask(args: any, storage: Storage) {
  // % 0 COMPLETE - handleGetTask

  if (!args.id) {
    throw new Error('Missing required field: id');
  }

  const task = await storage.getTask(args.id);
  if (!task) {
    throw new Error(`Task not found: ${args.id}`);
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(task, null, 2),
    }],
  };

  // % 100 COMPLETE - handleGetTask
}

async function handleUpdateTask(args: any, storage: Storage, scheduler: Scheduler) {
  // % 100 COMPLETE - handleUpdateTask

  if (!args.id || !args.updates) {
    throw new Error('Missing required fields: id, updates');
  }

  const task = await storage.updateTask(args.id, args.updates);

  // Reschedule if trigger or enabled status changed
  if (args.updates.trigger || args.updates.enabled !== undefined) {
    try {
      await scheduler.rescheduleTask(task);
    } catch (error: any) {
      console.error(`[Tools] Failed to reschedule task: ${error.message}`);
    }
  }

  return {
    content: [{
      type: 'text',
      text: `Task "${task.name}" updated successfully!`,
    }],
  };

  // % 100 COMPLETE - handleUpdateTask
}

async function handleDeleteTask(args: any, storage: Storage, scheduler: Scheduler): Promise<any> {
  // % 100 COMPLETE - handleDeleteTask

  if (!args.id) {
    throw new Error('Missing required field: id');
  }

  const task = await storage.getTask(args.id);
  if (!task) {
    throw new Error(`Task not found: ${args.id}`);
  }

  // Unschedule before deleting
  try {
    await scheduler.unscheduleTask(args.id);
  } catch (error: any) {
    console.error(`[Tools] Failed to unschedule task: ${error.message}`);
  }

  await storage.deleteTask(args.id);

  return {
    content: [{
      type: 'text',
      text: `Task "${task.name}" deleted successfully.`,
    }],
  };

  // % 100 COMPLETE - handleDeleteTask
}

async function handleRunTask(args: any, _storage: Storage, scheduler: Scheduler) {
  // % 100 COMPLETE - handleRunTask

  if (!args.id) {
    throw new Error('Missing required field: id');
  }

  const overrideConditions = args.override_conditions || false;
  const executionId = await scheduler.executeTask(
    args.id,
    'manual',
    undefined,
    overrideConditions
  );

  return {
    content: [{
      type: 'text',
      text: `Task execution started.\n\nExecution ID: ${executionId}\n\nUse claudecron_get_execution to check the status and results.`,
    }],
  };

  // % 100 COMPLETE - handleRunTask
}

async function handleListExecutions(args: any, storage: Storage): Promise<any> {
  // % 0 COMPLETE - handleListExecutions

  const executions = await storage.loadExecutions({
    task_id: args.task_id,
    status: args.status,
    limit: args.limit || 50,
  });

  if (executions.length === 0) {
    return {
      content: [{
        type: 'text',
        text: 'No executions found.',
      }],
    };
  }

  const executionList = executions.map(exec => ({
    id: exec.id,
    task_id: exec.task_id,
    status: exec.status,
    started_at: exec.started_at,
    duration_ms: exec.duration_ms || 'N/A',
    trigger: exec.trigger_type,
  }));

  return {
    content: [{
      type: 'text',
      text: `Found ${executions.length} execution(s):\n\n${JSON.stringify(executionList, null, 2)}`,
    }],
  };

  // % 100 COMPLETE - handleListExecutions
}

async function handleGetExecution(args: any, storage: Storage): Promise<any> {
  // % 0 COMPLETE - handleGetExecution

  if (!args.id) {
    throw new Error('Missing required field: id');
  }

  const execution = await storage.getExecution(args.id);
  if (!execution) {
    throw new Error(`Execution not found: ${args.id}`);
  }

  return {
    content: [{
      type: 'text',
      text: JSON.stringify(execution, null, 2),
    }],
  };

  // % 100 COMPLETE - handleGetExecution
}

async function handleGetExecutionProgress(args: any, storage: Storage): Promise<any> {
  // % 0 COMPLETE - handleGetExecutionProgress

  if (!args.execution_id) {
    throw new Error('Missing required field: execution_id');
  }

  const progress = await storage.getExecutionProgress(args.execution_id);

  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        status: progress.status,
        output_length: progress.output.length,
        thinking_length: progress.thinking.length,
        latest_output: progress.output.slice(-500), // Last 500 chars
        latest_thinking: progress.thinking.slice(-500),
        full_output_available: progress.output.length > 500,
        full_thinking_available: progress.thinking.length > 500
      }, null, 2)
    }]
  };

  // % 100 COMPLETE - handleGetExecutionProgress
}

async function handleTriggerHook(args: any, scheduler: Scheduler): Promise<any> {
  // % 0 COMPLETE - handleTriggerHook

  if (!args.event) {
    throw new Error('Missing required field: event');
  }

  const hookManager = (scheduler as any).hookManager;
  if (!hookManager) {
    throw new Error('Hook manager not initialized');
  }

  const context = args.context || {};
  context.event = args.event;
  context.timestamp = new Date().toISOString();

  await hookManager.handleHookEvent(args.event, context);

  return {
    content: [{
      type: 'text',
      text: `Hook event "${args.event}" triggered successfully.\n\nContext: ${JSON.stringify(context, null, 2)}`,
    }],
  };

  // % 100 COMPLETE - handleTriggerHook
}

async function handleGetToolAnalytics(args: any, storage: Storage): Promise<any> {
  // % 0 COMPLETE - handleGetToolAnalytics

  const analytics = new ToolAnalytics(storage);
  const reportType = args.report_type || 'summary';
  const limit = args.limit || 10;

  try {
    let result: any = {};

    if (reportType === 'summary' || reportType === 'all') {
      const summary = await analytics.getToolUsageSummary(
        args.task_id,
        args.start_date,
        args.end_date
      );
      result.summary = summary;
    }

    if (reportType === 'most_used' || reportType === 'all') {
      const mostUsed = await analytics.getMostUsedTools(limit, args.task_id);
      result.most_used_tools = mostUsed;
    }

    if (reportType === 'slowest' || reportType === 'all') {
      const slowest = await analytics.getSlowestTools(limit, args.task_id);
      result.slowest_tools = slowest;
    }

    if (reportType === 'failure_rate' || reportType === 'all') {
      const highFailure = await analytics.getToolsWithHighestFailureRate(limit, args.task_id);
      result.high_failure_rate_tools = highFailure;
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(result, null, 2),
      }],
    };
  } catch (error: any) {
    throw new Error(`Failed to generate tool analytics: ${error.message}`);
  }

  // % 100 COMPLETE - handleGetToolAnalytics
}

/**
 * % 100 COMPLETE - MCP tools registration
 */
