/**
 * SDK Executor
 *
 * Executes AI prompt and SDK query tasks using Claude Agent SDK
 * Based on CLAUDE_CRON.md specification lines 1527-1702
 *
 * % 50 COMPLETE - SDK Executor with streaming and ThinkingBlock support
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { Task, Execution, AIPromptTaskConfig, SDKQueryTaskConfig, ToolCallRecord } from '../models/types.js';
import { Executor, ExecutionResult } from './factory.js';
import { Storage } from '../storage/storage.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global MCP server cache
 * Stores MCP servers loaded from .mcp.json configuration
 * Populated lazily on first task execution
 */
let cachedMcpServers: Record<string, any> | null = null;
let mcpServerLoadPromise: Promise<Record<string, any>> | null = null;

/**
 * SDKExecutor
 *
 * Executes AI prompts and SDK queries using the Claude Agent SDK
 * Handles context loading, tool restrictions, and permission modes
 * Supports streaming output and ThinkingBlock capture (Claude Sonnet 4.5+)
 * Automatically inherits MCP servers from parent Claude Code session
 */
export class SDKExecutor implements Executor {
  private storage: Storage | undefined;
  private toolCalls: ToolCallRecord[] = [];

  /**
   * Constructor
   * @param storage - Optional storage instance for streaming support
   */
  constructor(storage?: Storage | undefined) {
    this.storage = storage;
  }

  /**
   * Execute an AI prompt or SDK query task
   * @param task - Task to execute
   * @param execution - Execution record
   * @returns Execution result with output, usage, and cost
   */
  async execute(task: Task, execution: Execution): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Reset tool tracking for this execution
    this.toolCalls = [];

    try {
      // 1. Validate permission mode
      this.validatePermissionMode(task);

      // 2. Extract and validate config
      const config = task.task_config as AIPromptTaskConfig | SDKQueryTaskConfig;

      if (!config.prompt) {
        throw new Error('Task configuration must include a prompt');
      }

      // 3. Load MCP servers from configuration
      const mcpServers = await this.loadMcpServers();

      // 4. Check if streaming or thinking capture is enabled
      const streamOutput = config.type === 'ai_prompt' ? config.stream_output || false : false;
      const captureThinking = config.type === 'ai_prompt' ? config.capture_thinking || false : false;

      // 5. Build SDK options from task configuration
      const options = this.buildSDKOptions(task, config, mcpServers);

      // 6. Get the prompt
      const prompt = config.prompt;

      // 7. Execute with streaming support
      const result = await this.executeWithStreaming(
        prompt,
        options,
        execution,
        config,
        streamOutput,
        captureThinking
      );

      return result;

    } catch (error) {
      // Handle errors
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(`[SDKExecutor] Task failed: ${errorMessage}`);

      return {
        status: 'failure',
        error: errorMessage,
        duration_ms: duration
      };
    }
  }

  /**
   * Execute with streaming support
   * @param prompt - AI prompt
   * @param options - SDK options
   * @param execution - Execution record
   * @param config - Task configuration
   * @param streamOutput - Whether to stream output to storage
   * @param captureThinking - Whether to capture thinking blocks
   * @returns Execution result
   */
  private async executeWithStreaming(
    prompt: string,
    options: any,
    execution: Execution,
    config: AIPromptTaskConfig | SDKQueryTaskConfig,
    streamOutput: boolean,
    captureThinking: boolean
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    let output = '';
    let thinkingOutput = '';
    let usage: {
      input_tokens: number;
      output_tokens: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
    } | undefined = undefined;
    let cost = 0;

    console.error(`[SDKExecutor] Executing ${config.type} task`);
    console.error(`[SDKExecutor] Prompt: ${prompt.substring(0, 100)}...`);
    console.error(`[SDKExecutor] Streaming: ${streamOutput}, Thinking capture: ${captureThinking}`);
    console.error(`[SDKExecutor] Options:`, JSON.stringify(options, null, 2));

    // Stream messages from SDK
    for await (const message of query({ prompt, options })) {
      // Handle assistant messages
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          // Text blocks
          if (block.type === 'text') {
            output += block.text;

            // Stream to execution log in real-time
            if (streamOutput && this.storage) {
              await this.streamUpdate(execution, block.text);
            }
          }

          // Thinking blocks (Claude Sonnet 4.5+)
          if (block.type === 'thinking' && captureThinking) {
            const thinkingText = (block as any).thinking;
            thinkingOutput += thinkingText + '\n\n';

            const preview = thinkingText.substring(0, 100);
            console.error(`[Thinking]: ${preview}${thinkingText.length > 100 ? '...' : ''}`);

            if (streamOutput && this.storage) {
              await this.streamThinkingUpdate(execution, thinkingText);
            }
          }

          // Tool use tracking
          if (block.type === 'tool_use') {
            const toolCall: ToolCallRecord = {
              tool_name: block.name,
              tool_input: block.input,
              timestamp: new Date().toISOString(),
              success: false // Will be updated when result is received
            };

            this.toolCalls.push(toolCall);

            console.error(`[Tool]: ${block.name}`);

            if (streamOutput && this.storage) {
              await this.streamToolUpdate(execution, block.name, block.input);
            }
          }
        }
      }
      // Handle result
      else if (message.type === 'result') {
        // Capture usage and cost
        if (message.usage) {
          usage = {
            input_tokens: message.usage.input_tokens || 0,
            output_tokens: message.usage.output_tokens || 0,
            cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens
          };
        }

        cost = message.total_cost_usd || 0;

        // Handle different result subtypes
        if (message.subtype === 'success') {
          console.error(`[SDKExecutor] Task completed successfully`);
          if (message.result && typeof message.result === 'string') {
            output = message.result;
          }
        } else if (message.subtype === 'error_during_execution') {
          console.error(`[SDKExecutor] Error during execution`);
          throw new Error('SDK execution error: Task failed during execution');
        } else if (message.subtype === 'error_max_turns') {
          console.error(`[SDKExecutor] Max turns exceeded`);
          throw new Error('Max turns exceeded - task did not complete within allowed iterations');
        }
      }
    }

    // Build result
    const duration = Date.now() - startTime;

    const result: ExecutionResult = {
      status: 'success',
      output: output || 'Task completed successfully',
      duration_ms: duration
    };

    // Add optional fields
    if (thinkingOutput) {
      result.thinking_output = thinkingOutput;
    }
    if (usage) {
      result.sdk_usage = usage;
    }
    if (cost > 0) {
      result.cost_usd = cost;
    }
    if (this.toolCalls.length > 0) {
      result.tool_calls = this.toolCalls;
    }

    return result;
  }

  /**
   * Stream output update to storage
   * @param execution - Execution record
   * @param text - Text to append
   */
  private async streamUpdate(execution: Execution, text: string): Promise<void> {
    if (!this.storage) return;

    try {
      await this.storage.appendExecutionOutput(execution.id, text);
      this.emitProgressEvent(execution.id, 'output', text);
    } catch (error) {
      console.error(`[SDKExecutor] Failed to stream output: ${error}`);
    }
  }

  /**
   * Stream thinking update to storage
   * @param execution - Execution record
   * @param thinking - Thinking text to append
   */
  private async streamThinkingUpdate(execution: Execution, thinking: string): Promise<void> {
    if (!this.storage) return;

    try {
      await this.storage.appendExecutionThinking(execution.id, thinking);
      this.emitProgressEvent(execution.id, 'thinking', thinking);
    } catch (error) {
      console.error(`[SDKExecutor] Failed to stream thinking: ${error}`);
    }
  }

  /**
   * Stream tool usage update to storage
   * @param execution - Execution record
   * @param toolName - Tool name
   * @param toolInput - Tool input
   */
  private async streamToolUpdate(
    execution: Execution,
    toolName: string,
    toolInput: any
  ): Promise<void> {
    if (!this.storage) return;

    try {
      const update = `\n[Tool: ${toolName}] ${JSON.stringify(toolInput)}\n`;
      await this.storage.appendExecutionOutput(execution.id, update);
      this.emitProgressEvent(execution.id, 'tool_use', { toolName, toolInput });
    } catch (error) {
      console.error(`[SDKExecutor] Failed to stream tool update: ${error}`);
    }
  }

  /**
   * Emit progress event (for future WebSocket/SSE support)
   * @param executionId - Execution ID
   * @param type - Event type
   * @param data - Event data
   */
  private emitProgressEvent(
    executionId: string,
    type: string,
    data: any
  ): void {
    // For future WebSocket/SSE support
    const preview = typeof data === 'string'
      ? data.substring(0, 50)
      : JSON.stringify(data).substring(0, 50);
    console.error(`[Progress:${executionId}] ${type}: ${preview}...`);
  }

  /**
   * Build SDK options from task configuration
   * @param task - Task being executed
   * @param config - Task configuration
   * @param mcpServers - MCP servers inherited from parent session
   * @returns SDK options object
   */
  private buildSDKOptions(task: Task, config: AIPromptTaskConfig | SDKQueryTaskConfig, mcpServers: Record<string, any>): any {
    // Start with base options common to all SDK tasks
    const baseOptions: any = {
      // Permission mode - default to bypassPermissions for autonomous execution
      permissionMode: task.options?.permission_mode || 'bypassPermissions',

      // Context sources (CLAUDE.md loading)
      // For ai_prompt with inherit_context=true (default), load project and user CLAUDE.md
      // For sdk_query, use custom setting_sources or none
      settingSources: task.options?.setting_sources || (
        config.type === 'ai_prompt' && config.inherit_context !== false
          ? ['project', 'user']
          : []
      ),

      // Tool restrictions
      allowedTools: task.options?.allowed_tools ||
                    (config.type === 'ai_prompt' ? config.allowed_tools : undefined),

      // Additional directories to include in context
      additionalDirectories: task.options?.additional_directories,

      // Max turns - limit AI iterations
      maxTurns: 20,

      // Working directory (for bash tasks primarily, but may be useful)
      cwd: (task.task_config as any).cwd,

      // Environment variables
      env: (task.task_config as any).env,

      // MCP servers inherited from parent Claude Code session
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined
    };

    // For sdk_query type, merge with custom SDK options
    if (config.type === 'sdk_query') {
      return { ...baseOptions, ...config.sdk_options };
    }

    // For ai_prompt type, handle model and additional context
    if (config.type === 'ai_prompt') {
      const aiOptions: any = {
        ...baseOptions,
        model: config.model
      };

      // Handle system prompt with additional context
      if (config.additional_context) {
        aiOptions.systemPrompt = {
          type: 'preset' as const,
          preset: 'claude_code' as const,
          append: config.additional_context
        };
      } else {
        aiOptions.systemPrompt = {
          type: 'preset' as const,
          preset: 'claude_code' as const
        };
      }

      // Handle extended thinking tokens (Claude Sonnet 4.5+)
      if (config.max_thinking_tokens) {
        aiOptions.maxThinkingTokens = config.max_thinking_tokens;
      }

      return aiOptions;
    }

    return baseOptions;
  }

  /**
   * Validate permission mode for task execution
   * Warns if permission mode is inappropriate for trigger type
   */
  private validatePermissionMode(task: Task): void {
    const mode = task.options?.permission_mode || 'bypassPermissions';

    if (task.trigger.type === 'schedule' && mode === 'default') {
      console.warn(
        `[SDKExecutor] Task ${task.name} uses 'default' permission mode with scheduled trigger. ` +
        `This may block execution. Consider 'bypassPermissions' instead.`
      );
    }

    if (task.trigger.type === 'manual' && mode === 'bypassPermissions') {
      console.warn(
        `[SDKExecutor] Task ${task.name} uses 'bypassPermissions' for manual trigger. ` +
        `Consider 'default' or 'acceptEdits' for safety.`
      );
    }

    console.error(`[SDKExecutor] Permission mode: ${mode}`);
  }

  /**
   * Load MCP servers from .mcp.json configuration
   * Searches in project root and .claude directory
   * @returns MCP server configuration map
   */
  private async loadMcpServers(): Promise<Record<string, any>> {
    // If we already have cached servers, return them
    if (cachedMcpServers) {
      console.error('[SDKExecutor] Using cached MCP servers');
      return cachedMcpServers;
    }

    // If loading is already in progress, wait for it
    if (mcpServerLoadPromise) {
      console.error('[SDKExecutor] MCP server loading in progress, waiting...');
      return mcpServerLoadPromise;
    }

    // Start loading
    console.error('[SDKExecutor] Loading MCP servers from configuration...');

    mcpServerLoadPromise = (async () => {
      try {
        const mcpServers: Record<string, any> = {};

        // Try to find .mcp.json in various locations
        const configLocations = [
          path.join(process.cwd(), '.mcp.json'),
          path.join(process.cwd(), '.claude', 'mcp.json'),
          path.join(process.cwd(), '..', '.mcp.json')  // Check parent directory
        ];

        let configFound = false;

        for (const configPath of configLocations) {
          if (fs.existsSync(configPath)) {
            console.error(`[SDKExecutor] Found MCP config at: ${configPath}`);

            try {
              const configContent = fs.readFileSync(configPath, 'utf-8');
              const config = JSON.parse(configContent);

              if (config.mcpServers && typeof config.mcpServers === 'object') {
                Object.assign(mcpServers, config.mcpServers);
                console.error(`[SDKExecutor] Loaded ${Object.keys(config.mcpServers).length} MCP server(s):`);
                for (const serverName of Object.keys(config.mcpServers)) {
                  console.error(`[SDKExecutor] - ${serverName}`);
                }
                configFound = true;
                break;  // Use the first config file found
              }
            } catch (error) {
              console.error(`[SDKExecutor] Error parsing ${configPath}: ${error}`);
            }
          }
        }

        if (!configFound) {
          console.error('[SDKExecutor] No .mcp.json configuration found');
          console.error('[SDKExecutor] Create .mcp.json in project root to enable MCP servers');
          console.error('[SDKExecutor] Example: {"mcpServers": {"openrouter-gateway": {"command": "npx", "args": ["-y", "@punkpeye/mcp-server-openrouter-gateway@latest"]}}}');
        }

        // Cache the result
        cachedMcpServers = mcpServers;
        mcpServerLoadPromise = null;
        return mcpServers;

      } catch (error) {
        console.error(`[SDKExecutor] Error loading MCP servers: ${error}`);
        mcpServerLoadPromise = null;
        cachedMcpServers = {};
        return {};
      }
    })();

    return mcpServerLoadPromise;
  }
}

/**
 * % 100 COMPLETE - SDK Executor with streaming and ThinkingBlock support
 */
