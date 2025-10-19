/**
 * ClaudeCron Type Definitions
 *
 * Comprehensive type definitions for ClaudeCron MCP Server
 * Based on CLAUDE_CRON.md specification lines 488-977
 *
 * % 0 COMPLETE - Type definitions
 */

/**
 * Task Type Definitions
 */
export type TaskType =
  | 'bash'           // Execute shell commands
  | 'ai_prompt'      // Execute AI prompts with SDK
  | 'slash_command'  // Execute slash commands
  | 'subagent'       // Launch subagents
  | 'tool_call'      // Call specific MCP tools
  | 'sdk_query';     // Execute custom SDK query

/**
 * Trigger Type Definitions
 */
export type TriggerType =
  | ScheduleTrigger
  | HookTrigger
  | FileWatchTrigger
  | DependencyTrigger
  | IntervalTrigger
  | ManualTrigger
  | SmartScheduleTrigger;

export interface ScheduleTrigger {
  type: 'schedule';
  cron: string;              // Cron expression (supports seconds)
  timezone?: string;         // IANA timezone (default: UTC)
}

export interface HookTrigger {
  type: 'hook';
  event: HookEvent;          // SessionStart, PostToolUse, etc.
  matcher?: string;          // Optional regex for tool matching
  conditions?: {
    source?: string[];       // For SessionStart: startup, resume, new
    file_pattern?: string;   // For PostToolUse: *.ts, *.md, etc.
    tool_names?: string[];   // Specific tools to match (Write, Edit, etc.)
    subagent_names?: string[]; // For SubagentStop: specific subagents
  };
  debounce?: string;         // Debounce duration (e.g., "5s", "1m")
}

export interface FileWatchTrigger {
  type: 'file_watch';
  path: string;              // Path to watch (supports globs)
  pattern?: string;          // File pattern to match
  debounce?: string;         // Debounce duration (e.g., "5s")
}

export interface DependencyTrigger {
  type: 'dependency';
  depends_on: string[];      // Task IDs that must complete first
  require_all?: boolean;     // All or any (default: all)
  debounce?: string;         // Wait time after last dependency
}

export interface IntervalTrigger {
  type: 'interval';
  every: string;             // Duration string (e.g., "30m", "2h")
  start?: string;            // ISO 8601 datetime to start
}

export interface ManualTrigger {
  type: 'manual';
  description: string;       // Why this is manual-only
}

export interface SmartScheduleTrigger {
  type: 'smart_schedule';
  description: string;          // Natural language description
  constraints?: {
    business_hours_only?: boolean;
    timezone?: string;
    avoid_peak_hours?: boolean;  // Avoid 9-5 in specified timezone
    max_daily_runs?: number;
    max_weekly_runs?: number;
    avoid_conflicts_with?: string[];  // Task IDs to avoid overlapping
    preferred_time_windows?: string[];  // e.g., ["morning", "evening"]
  };
  ai_optimize?: boolean;         // Let Claude suggest optimal times
  fallback_cron?: string;        // Fallback if AI optimization fails
  computed_cron?: string;        // AI-computed cron expression
  last_optimized?: string;       // ISO timestamp of last optimization
}

/**
 * Hook Events (from Claude Code SDK)
 * All events available in Claude Code hooks system
 */
export type HookEvent =
  | 'SessionStart'      // Fired when Claude Code starts or resumes a session
  | 'SessionEnd'        // Fired when session ends (cleanup tasks)
  | 'PreToolUse'        // Before tool execution (validation, preparation)
  | 'PostToolUse'       // After tool execution (formatting, tests, file watching)
  | 'UserPromptSubmit'  // After user submits input (context loading)
  | 'Notification'      // System notifications
  | 'Stop'              // When user stops execution
  | 'SubagentStop'      // When subagent completes execution
  | 'PreCompact';       // Before context window compaction

/**
 * Task Definition
 */
export interface Task {
  // Identity
  id: string;                          // Unique task ID (UUID)
  name: string;                        // Human-readable name
  description?: string;                // Optional description
  enabled: boolean;                    // Whether task is active

  // Task Configuration
  type: TaskType;                      // Type of task to execute
  task_config: TaskConfig;             // Type-specific configuration

  // Trigger Configuration
  trigger: TriggerType;                // When to run

  // Execution Options
  options?: ExecutionOptions;          // SDK options, permissions, etc.

  // Conditions
  conditions?: TaskConditions;         // When to skip/run

  // Result Handling
  on_success?: ResultHandler[];        // What to do on success
  on_failure?: ResultHandler[];        // What to do on failure

  // Metadata
  created_at: string;                  // ISO 8601 timestamp
  updated_at: string;                  // ISO 8601 timestamp
  last_run?: string;                   // ISO 8601 timestamp
  next_run?: string;                   // ISO 8601 timestamp

  // Statistics
  run_count: number;                   // Total executions
  success_count: number;               // Successful executions
  failure_count: number;               // Failed executions
}

/**
 * Task Configuration (type-specific)
 */
export type TaskConfig =
  | BashTaskConfig
  | AIPromptTaskConfig
  | SlashCommandTaskConfig
  | SubagentTaskConfig
  | ToolCallTaskConfig
  | SDKQueryTaskConfig;

export interface BashTaskConfig {
  type: 'bash';
  command: string;                     // Shell command to execute
  cwd?: string;                        // Working directory
  env?: Record<string, string>;        // Environment variables
  timeout?: number;                    // Timeout in milliseconds
}

export interface AIPromptTaskConfig {
  type: 'ai_prompt';
  prompt: string;                      // AI prompt
  model?: string;                      // Override default model
  max_tokens?: number;                 // Token limit
  temperature?: number;                // Temperature setting
  inherit_context?: boolean;           // Load CLAUDE.md (default: true)
  allowed_tools?: string[];            // Allowed tool names
  additional_context?: string;         // Extra context to append
  capture_thinking?: boolean;          // Capture ThinkingBlock output (default: false)
  stream_output?: boolean;             // Enable streaming updates (default: false)
  max_thinking_tokens?: number;        // Token limit for thinking (Claude Sonnet 4.5)
}

export interface SlashCommandTaskConfig {
  type: 'slash_command';
  command: string;                     // Slash command name (with or without /)
  args?: string;                       // Arguments to pass
}

export interface SubagentTaskConfig {
  type: 'subagent';
  agent: string;                       // Agent name (from .claude/agents/)
  prompt: string;                      // Task for subagent
  inherit_tools?: boolean;             // Inherit parent's tools (default: false)
  separate_context: boolean;           // Always true - subagents get fresh context
  pass_results_to_parent?: boolean;    // Return results to main context (default: false)
  timeout?: number;                    // Subagent execution timeout (ms)
}

export interface ToolCallTaskConfig {
  type: 'tool_call';
  tool_name: string;                   // MCP tool name (e.g., "mcp_server.tool")
  tool_input: Record<string, any>;     // Tool input parameters
  server?: string;                     // MCP server name (if ambiguous)
}

export interface SDKQueryTaskConfig {
  type: 'sdk_query';
  prompt: string;                      // Query prompt
  sdk_options: SDKOptions;             // Full SDK options object
}

/**
 * MCP Server Configuration
 */
export interface McpServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

/**
 * SDK Options (subset of Claude Agent SDK Options)
 */
export interface SDKOptions {
  model?: string;

  // Context Configuration
  settingSources?: ('user' | 'project' | 'local')[];  // Which CLAUDE.md files to load
  additionalDirectories?: string[];
  cwd?: string;
  env?: Record<string, string>;

  // Tool Configuration
  allowedTools?: string[];
  disallowedTools?: string[];
  mcpServers?: Record<string, McpServerConfig>;

  // Permission Modes
  // - 'default': Requires user approval for actions (manual tasks)
  // - 'acceptEdits': Auto-accepts file edits (dev/prototyping workflows)
  // - 'bypassPermissions': Full automation (scheduled tasks, CI/CD)
  // - 'plan': Plan-only mode (analysis tasks, no execution)
  permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';

  // Prompting
  systemPrompt?: string | { type: 'preset'; preset: 'claude_code'; append?: string };

  // Execution Limits
  maxTurns?: number;
  maxThinkingTokens?: number;  // Claude Sonnet 4.5+ extended thinking
}

/**
 * Execution Options
 */
export interface ExecutionOptions {
  // Permissions
  permission_mode?: 'default' | 'acceptEdits' | 'bypassPermissions' | 'plan';
  allowed_tools?: string[];
  additional_directories?: string[];

  // SDK Configuration
  setting_sources?: ('user' | 'project' | 'local')[];
  inherit_context?: boolean;           // Load CLAUDE.md

  // Retry Configuration
  retry?: RetryPolicy;

  // Timeout
  timeout?: number;                    // Max execution time (ms)

  // Concurrency
  max_concurrent?: number;             // Max parallel executions of this task
}

/**
 * Task Conditions
 */
export interface TaskConditions {
  // Time-based
  skip_holidays?: boolean;
  holiday_region?: string;             // e.g., "US", "UK"
  time_window?: {
    start: string;                     // HH:MM format
    end: string;                       // HH:MM format
    timezone?: string;
  };

  // File-based
  only_if_file_exists?: string;
  skip_if_file_exists?: string;
  only_if_git_dirty?: boolean;

  // Custom conditions
  skip_if?: CommandCondition;
  only_if?: CommandCondition;
}

export interface CommandCondition {
  bash: string;                        // Command to run
  operator: '==' | '!=' | '>' | '<' | '>=' | '<=';
  value: string | number;              // Expected value
}

/**
 * Result Handlers
 */
export type ResultHandler =
  | NotifyHandler
  | FileHandler
  | TriggerTaskHandler
  | WebhookHandler
  | RetryHandler;

export interface NotifyHandler {
  type: 'notify';
  message: string;
  urgency?: 'low' | 'medium' | 'high';
}

export interface FileHandler {
  type: 'file';
  path: string;                        // File path to write
  append?: boolean;                    // Append vs overwrite
  format?: 'text' | 'json' | 'markdown';
}

export interface TriggerTaskHandler {
  type: 'trigger_task';
  task_id: string;                     // Task to trigger
  pass_context?: boolean;              // Pass execution result
}

export interface WebhookHandler {
  type: 'webhook';
  url: string;
  method?: 'POST' | 'PUT';
  headers?: Record<string, string>;
}

export interface RetryHandler {
  type: 'retry';
  max_attempts: number;
  backoff: 'linear' | 'exponential';
  initial_delay?: number;              // Milliseconds
  max_delay?: number;                  // Milliseconds
}

/**
 * Retry Policy
 */
export interface RetryPolicy {
  max_attempts: number;                // Maximum retry attempts
  backoff: 'linear' | 'exponential';   // Backoff strategy
  initial_delay: number;               // Initial delay (ms)
  max_delay: number;                   // Maximum delay (ms)
  retry_on?: 'all' | 'timeout' | 'error';
}

/**
 * Execution Record
 */
export interface Execution {
  id: string;                          // Execution ID (UUID)
  task_id: string;                     // Reference to task

  // Timing
  started_at: string;                  // ISO 8601 timestamp
  completed_at?: string;               // ISO 8601 timestamp
  duration_ms?: number;                // Execution duration

  // Trigger Info
  trigger_type: string;                // 'scheduled', 'hook', 'manual', etc.
  trigger_context?: any;               // Hook context, manual trigger info

  // Status
  status: ExecutionStatus;
  exit_code?: number;                  // For bash tasks
  error?: string;                      // Error message if failed

  // Output
  output?: string;                     // Task output/result
  output_truncated?: boolean;          // If output was truncated
  thinking_output?: string;            // Captured ThinkingBlock content
  tool_calls?: ToolCallRecord[];       // Tools used during execution
  tool_usage_summary?: {               // Summary of tool usage
    total_tools_used: number;
    unique_tools: string[];
    most_used_tool: string;
  };

  // Metadata
  sdk_usage?: {                        // SDK token usage
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
  cost_usd?: number;                   // Estimated cost
}

/**
 * Tool Call Record (for execution tracking)
 */
export interface ToolCallRecord {
  tool_name: string;
  tool_input: Record<string, any>;
  tool_result?: any;
  error?: string;
  timestamp: string;
  duration_ms?: number;
  success: boolean;
}

export type ExecutionStatus =
  | 'pending'
  | 'running'
  | 'success'
  | 'failure'
  | 'timeout'
  | 'cancelled'
  | 'skipped';

/**
 * Task Template (for marketplace)
 */
export interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  category: 'testing' | 'deployment' | 'reporting' | 'maintenance' | 'monitoring' | 'git' | 'other';
  tags: string[];

  // Template content
  template: Partial<Task>;

  // Variables that must be filled by user
  variables: TemplateVariable[];

  // Metadata
  downloads: number;
  rating: number;
  created_at: string;
  updated_at: string;
}

export interface TemplateVariable {
  name: string;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'cron' | 'path';
  required: boolean;
  default?: any;
  validation?: string;  // Regex or expression
}

/**
 * Task Analytics
 */
export interface TaskAnalytics {
  task_id: string;
  task_name: string;

  // Time Range
  period_start: string;
  period_end: string;

  // Execution Counts
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  cancelled_runs: number;
  skipped_runs: number;

  // Performance Metrics
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  p50_duration_ms: number;
  p95_duration_ms: number;
  p99_duration_ms: number;

  // Reliability Metrics
  success_rate: number;           // Percentage
  uptime_percentage: number;      // Percentage
  mtbf_hours: number;             // Mean time between failures
  mttr_minutes: number;           // Mean time to recovery

  // Cost Metrics (for AI tasks)
  total_cost_usd: number;
  avg_cost_per_run: number;
  total_input_tokens: number;
  total_output_tokens: number;
  cache_hit_rate: number;         // Percentage

  // Trends
  performance_trend: 'improving' | 'stable' | 'degrading';
  recent_failures: ExecutionSummary[];
  slowest_runs: ExecutionSummary[];

  // Predictions (AI-powered)
  predicted_next_failure?: string;  // ISO timestamp
  estimated_monthly_cost?: number;
  recommended_optimizations?: string[];
}

export interface ExecutionSummary {
  execution_id: string;
  started_at: string;
  duration_ms: number;
  status: ExecutionStatus;
  error?: string;
  cost_usd?: number;
}

/**
 * Configuration Types
 */
export interface ClaudeCronConfig {
  storage: StorageConfig;
  scheduler?: SchedulerConfig;
  transport?: 'stdio' | 'http';
  port?: number;
}

export interface StorageConfig {
  type: 'sqlite' | 'postgres';
  path?: string;      // For SQLite
  url?: string;       // For PostgreSQL
}

export interface SchedulerConfig {
  check_interval?: string;      // How often to check for due tasks (default: "30s")
  default_timezone?: string;    // Default timezone (default: "UTC")
  max_concurrent_tasks?: number; // Max tasks running concurrently
}

/**
 * % 100 COMPLETE - Type definitions
 */
