/**
 * Subagent Executor
 *
 * Execute prompts via Claude SDK
 * Prompts can come from config or from .claude/commands/ files
 */

import { query } from '@anthropic-ai/claude-agent-sdk';
import { Task, Execution, ToolCallRecord } from '../models/types.js';
import { Executor, ExecutionResult } from './factory.js';
import { Storage } from '../storage/storage.js';
import { replaceTemplateVariables } from '../handlers/template-variables.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Global MCP server cache
 */
let cachedMcpServers: Record<string, any> | null = null;
let mcpServerLoadPromise: Promise<Record<string, any>> | null = null;

/**
 * SubagentExecutor
 *
 * Execute any prompt via Claude SDK
 */
export class SubagentExecutor implements Executor {
  private storage: Storage | undefined;
  private toolCalls: ToolCallRecord[] = [];

  constructor(storage?: Storage | undefined) {
    this.storage = storage;
  }

  async execute(task: Task, execution: Execution): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.toolCalls = [];

    try {
      const config = task.task_config as any;

      // 1. Get the prompt - either from config or from file
      let prompt = config.prompt;

      // If prompt references a slash command file, load it
      if (config.command) {
        prompt = await this.loadSlashCommand(config.command, config.args);
      }

      if (!prompt) {
        throw new Error('Task configuration must include a prompt or command');
      }

      // 2. Apply template variables
      prompt = replaceTemplateVariables(prompt, task, execution);

      // 3. Build SDK options
      const options = await this.buildOptions(task, config);

      // 4. Execute
      return await this.executeSDKQuery(prompt, options, execution, config);

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      console.error(`[SubagentExecutor] Task failed: ${errorMessage}`);

      return {
        status: 'failure',
        error: errorMessage,
        duration_ms: duration
      };
    }
  }

  /**
   * Load command from .claude/commands/
   */
  private async loadSlashCommand(command: string, args?: string): Promise<string> {

    const commandName = command.startsWith('/') ? command.substring(1) : command;

    const possibleLocations = [
      path.join(process.cwd(), '.claude', 'commands', `${commandName}.md`),
      path.join(process.cwd(), '..', '.claude', 'commands', `${commandName}.md`),
      path.join(process.env.HOME || '~', '.claude', 'commands', `${commandName}.md`)
    ];

    for (const commandPath of possibleLocations) {
      if (fs.existsSync(commandPath)) {
        console.error(`[SubagentExecutor] Loading slash command from: ${commandPath}`);
        let content = fs.readFileSync(commandPath, 'utf-8');
        if (args) {
          content = `${content}\n\nArguments: ${args}`;
        }
        return content;
      }
    }

    throw new Error(`Slash command "/${commandName}" not found in .claude/commands/`);
  }

  /**
   * Build SDK options
   */
  private async buildOptions(task: Task, config: any): Promise<any> {
    const mcpServers = await this.loadMcpServers();

    const options: any = {
      // Permission mode
      permissionMode: task.options?.permission_mode || 'bypassPermissions',

      // Context loading - default to loading for most tasks
      settingSources: task.options?.setting_sources ||
        (config.inherit_context === false ? [] : ['project', 'user']),

      // Tool restrictions
      allowedTools: task.options?.allowed_tools || config.allowed_tools,

      // Additional config
      additionalDirectories: task.options?.additional_directories,
      maxTurns: 20,
      cwd: config.cwd,
      env: config.env,
      model: config.model,

      // MCP servers
      mcpServers: Object.keys(mcpServers).length > 0 ? mcpServers : undefined,

      // System prompt
      systemPrompt: {
        type: 'preset' as const,
        preset: 'claude_code' as const,
        append: config.additional_context
      }
    };

    // Allow full SDK option override
    if (config.sdk_options) {
      Object.assign(options, config.sdk_options);
    }

    // Extended thinking
    if (config.max_thinking_tokens) {
      options.maxThinkingTokens = config.max_thinking_tokens;
    }

    return options;
  }

  /**
   * Execute SDK query with streaming
   */
  private async executeSDKQuery(
    prompt: string,
    options: any,
    execution: Execution,
    config: any
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    let output = '';
    let thinkingOutput = '';
    let usage: any = undefined;
    let cost = 0;

    const streamOutput = config.stream_output || false;
    const captureThinking = config.capture_thinking || false;

    console.error(`[SubagentExecutor] Executing prompt (${prompt.length} chars)`);

    // Stream messages from SDK
    for await (const message of query({ prompt, options })) {
      if (message.type === 'assistant') {
        for (const block of message.message.content) {
          // Text
          if (block.type === 'text') {
            output += block.text;
            if (streamOutput && this.storage) {
              await this.storage.appendExecutionOutput(execution.id, block.text);
            }
          }

          // Thinking
          if (block.type === 'thinking' && captureThinking) {
            const thinkingText = (block as any).thinking;
            thinkingOutput += thinkingText + '\n\n';
            if (streamOutput && this.storage) {
              await this.storage.appendExecutionThinking(execution.id, thinkingText);
            }
          }

          // Tool use
          if (block.type === 'tool_use') {
            this.toolCalls.push({
              tool_name: block.name,
              tool_input: block.input,
              timestamp: new Date().toISOString(),
              success: false
            });

            if (streamOutput && this.storage) {
              const update = `\n[Tool: ${block.name}]\n`;
              await this.storage.appendExecutionOutput(execution.id, update);
            }
          }
        }
      }
      else if (message.type === 'result') {
        if (message.usage) {
          usage = {
            input_tokens: message.usage.input_tokens || 0,
            output_tokens: message.usage.output_tokens || 0,
            cache_creation_input_tokens: message.usage.cache_creation_input_tokens,
            cache_read_input_tokens: message.usage.cache_read_input_tokens
          };
        }

        cost = message.total_cost_usd || 0;

        if (message.subtype === 'success') {
          console.error(`[SubagentExecutor] Completed successfully`);
          if (message.result && typeof message.result === 'string') {
            output = message.result;
          }
        } else if (message.subtype === 'error_during_execution') {
          throw new Error('SDK execution error: Task failed during execution');
        } else if (message.subtype === 'error_max_turns') {
          throw new Error('Max turns exceeded');
        }
      }
    }

    // Build result
    const result: ExecutionResult = {
      status: 'success',
      output: output || 'Task completed',
      duration_ms: Date.now() - startTime
    };

    if (thinkingOutput) result.thinking_output = thinkingOutput;
    if (usage) result.sdk_usage = usage;
    if (cost > 0) result.cost_usd = cost;
    if (this.toolCalls.length > 0) result.tool_calls = this.toolCalls;

    return result;
  }

  /**
   * Load MCP servers from .mcp.json
   */
  private async loadMcpServers(): Promise<Record<string, any>> {
    if (cachedMcpServers) return cachedMcpServers;
    if (mcpServerLoadPromise) return mcpServerLoadPromise;

    mcpServerLoadPromise = (async () => {
      try {
        const mcpServers: Record<string, any> = {};
        const configLocations = [
          path.join(process.cwd(), '.mcp.json'),
          path.join(process.cwd(), '.claude', 'mcp.json'),
          path.join(process.cwd(), '..', '.mcp.json')
        ];

        for (const configPath of configLocations) {
          if (fs.existsSync(configPath)) {
            const configContent = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(configContent);

            if (config.mcpServers && typeof config.mcpServers === 'object') {
              Object.assign(mcpServers, config.mcpServers);
              console.error(`[SubagentExecutor] Loaded ${Object.keys(config.mcpServers).length} MCP server(s)`);
              break;
            }
          }
        }

        cachedMcpServers = mcpServers;
        mcpServerLoadPromise = null;
        return mcpServers;
      } catch (error) {
        console.error(`[SubagentExecutor] Error loading MCP servers: ${error}`);
        cachedMcpServers = {};
        mcpServerLoadPromise = null;
        return {};
      }
    })();

    return mcpServerLoadPromise;
  }
}
