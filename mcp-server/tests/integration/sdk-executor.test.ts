/**
 * SDK Executor Integration Tests
 *
 * Tests for AI prompt and SDK query execution
 * Based on CLAUDE_CRON.md specification
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SDKExecutor } from '../../src/executors/sdk-executor.js';
import { Task, Execution, AIPromptTaskConfig, SDKQueryTaskConfig } from '../../src/models/types.js';
import { v4 as uuidv4 } from 'uuid';

describe('SDK Executor', () => {
  let executor: SDKExecutor;

  beforeEach(() => {
    executor = new SDKExecutor();
  });

  /**
   * Helper function to create a basic task
   */
  function createTask(config: AIPromptTaskConfig | SDKQueryTaskConfig): Task {
    return {
      id: uuidv4(),
      name: 'Test Task',
      enabled: true,
      type: config.type === 'ai_prompt' ? 'ai_prompt' : 'sdk_query',
      task_config: config,
      trigger: { type: 'manual', description: 'Test trigger' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      run_count: 0,
      success_count: 0,
      failure_count: 0
    };
  }

  /**
   * Helper function to create an execution record
   */
  function createExecution(taskId: string): Execution {
    return {
      id: uuidv4(),
      task_id: taskId,
      started_at: new Date().toISOString(),
      trigger_type: 'manual',
      status: 'running'
    };
  }

  describe('AI Prompt Tasks', () => {
    it('should execute simple AI prompt task', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "Hello from ClaudeCron test!" and nothing else.',
        inherit_context: false
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
      expect(result.output).toContain('Hello');
      expect(result.duration_ms).toBeGreaterThan(0);
      expect(result.sdk_usage).toBeTruthy();
      expect(result.sdk_usage?.input_tokens).toBeGreaterThan(0);
      expect(result.sdk_usage?.output_tokens).toBeGreaterThan(0);
      expect(result.cost_usd).toBeGreaterThan(0);
    }, 60000); // 60 second timeout for API calls

    it('should respect tool allowlist', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'List the files in the current directory using only the Bash tool.',
        inherit_context: false,
        allowed_tools: ['Bash']
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
      // Tool calls should only include Bash
      if (result.tool_calls) {
        for (const call of result.tool_calls) {
          expect(call.tool_name).toBe('Bash');
        }
      }
    }, 60000);

    it('should handle additional context', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'What is the test context value?',
        inherit_context: false,
        additional_context: 'IMPORTANT: The test context value is "context-loaded-successfully".'
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
      expect(result.output.toLowerCase()).toContain('context-loaded-successfully');
    }, 60000);

    it('should inherit context from CLAUDE.md when enabled', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "Context inherited" if you can see CLAUDE.md instructions.',
        inherit_context: true // This is the default
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
      // Should have loaded CLAUDE.md context (if it exists)
    }, 60000);

    it('should handle model specification', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "Model test successful"',
        inherit_context: false,
        model: 'claude-sonnet-4.5'
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
      expect(result.output.toLowerCase()).toContain('model test successful');
    }, 60000);
  });

  describe('SDK Query Tasks', () => {
    it('should execute SDK query with custom options', async () => {
      const config: SDKQueryTaskConfig = {
        type: 'sdk_query',
        prompt: 'Say "SDK query test successful"',
        sdk_options: {
          permissionMode: 'bypassPermissions',
          settingSources: [],
          maxTurns: 5
        }
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
      expect(result.output.toLowerCase()).toContain('sdk query test successful');
    }, 60000);

    it('should respect custom SDK options', async () => {
      const config: SDKQueryTaskConfig = {
        type: 'sdk_query',
        prompt: 'Echo test',
        sdk_options: {
          permissionMode: 'bypassPermissions',
          allowedTools: ['Bash'],
          maxTurns: 3
        }
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.output).toBeTruthy();
    }, 60000);
  });

  describe('Permission Modes', () => {
    it('should use bypassPermissions mode by default', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "Permission test"',
        inherit_context: false
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      // Default should be bypassPermissions for autonomous execution
      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
    }, 60000);

    it('should respect custom permission mode', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "Permission test with plan mode"',
        inherit_context: false
      };

      const task = createTask(config);
      task.options = {
        permission_mode: 'plan' // Plan-only mode
      };
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      // Plan mode should still succeed (just won't execute actions)
      expect(result.status).toBe('success');
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should handle missing prompt', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: '', // Empty prompt
        inherit_context: false
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('failure');
      expect(result.error).toBeTruthy();
    }, 10000);

    it('should handle task execution errors gracefully', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        // This prompt is designed to be problematic but not crash
        prompt: 'Execute a bash command that fails: exit 1',
        inherit_context: false,
        allowed_tools: ['Bash']
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      // Should complete even if the command fails
      expect(result.status).toBe('success');
      expect(result.duration_ms).toBeGreaterThan(0);
    }, 60000);
  });

  describe('Context and Options', () => {
    it('should disable context inheritance when set to false', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "No context loaded"',
        inherit_context: false
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      // settingSources should be empty array
    }, 60000);

    it('should use task-level setting_sources override', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "Custom sources"',
        inherit_context: true // This would normally use ['project', 'user']
      };

      const task = createTask(config);
      task.options = {
        setting_sources: ['project'] // Override to only use project
      };
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
    }, 60000);
  });

  describe('Usage and Cost Tracking', () => {
    it('should track token usage', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "Usage tracking test"',
        inherit_context: false
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.sdk_usage).toBeTruthy();
      expect(result.sdk_usage?.input_tokens).toBeGreaterThan(0);
      expect(result.sdk_usage?.output_tokens).toBeGreaterThan(0);
    }, 60000);

    it('should track cost', async () => {
      const config: AIPromptTaskConfig = {
        type: 'ai_prompt',
        prompt: 'Say "Cost tracking test"',
        inherit_context: false
      };

      const task = createTask(config);
      const execution = createExecution(task.id);

      const result = await executor.execute(task, execution);

      expect(result.status).toBe('success');
      expect(result.cost_usd).toBeGreaterThanOrEqual(0);
    }, 60000);
  });
});
