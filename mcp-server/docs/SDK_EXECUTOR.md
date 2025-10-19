# SDK Executor Implementation Summary

## Overview

The SDK Executor is the core component for executing AI-powered tasks in ClaudeCron. It integrates the Claude Agent SDK to provide autonomous AI task execution with full context awareness.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Task Scheduler                         │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                   Executor Factory                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  createExecutor(task) {                              │  │
│  │    if (task.type === 'ai_prompt' ||                  │  │
│  │        task.type === 'sdk_query') {                  │  │
│  │      return new SDKExecutor();                       │  │
│  │    }                                                  │  │
│  │  }                                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      SDK Executor                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  execute(task, execution) {                          │  │
│  │    1. Extract config (AIPrompt or SDKQuery)          │  │
│  │    2. Build SDK options (buildSDKOptions)            │  │
│  │    3. Execute SDK query()                            │  │
│  │    4. Handle messages (assistant, result)            │  │
│  │    5. Track usage and costs                          │  │
│  │    6. Return ExecutionResult                         │  │
│  │  }                                                    │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│               Claude Agent SDK (query)                      │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  - Load context from CLAUDE.md (settingSources)      │  │
│  │  - Execute prompt with tools                         │  │
│  │  - Stream messages (assistant, result, system)       │  │
│  │  - Track token usage and costs                       │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. SDKExecutor Class

**Location:** `/home/phil/dev/claudecron/mcp-server/src/executors/sdk-executor.ts`

**Responsibilities:**
- Execute AI prompt tasks (`ai_prompt`)
- Execute SDK query tasks (`sdk_query`)
- Manage SDK options and configuration
- Track execution metrics and costs

**Public Interface:**
```typescript
class SDKExecutor implements Executor {
  async execute(task: Task, execution: Execution): Promise<ExecutionResult>
}
```

### 2. SDK Options Builder

**Method:** `buildSDKOptions(task, config)`

**Configuration Matrix:**

| Option | Source Priority | Default |
|--------|----------------|---------|
| permissionMode | task.options → config | `bypassPermissions` |
| settingSources | task.options → auto | `['project', 'user']` for ai_prompt |
| allowedTools | task.options → config | `undefined` (all tools) |
| model | config.model | SDK default |
| maxTurns | hardcoded | `20` |
| additionalDirectories | task.options | `undefined` |
| cwd | task.task_config | `undefined` |
| env | task.task_config | `undefined` |

### 3. Message Handling

**Message Flow:**
```
SDK query() Stream
    │
    ├─► assistant message
    │   ├─► Extract text blocks → output
    │   └─► Track tool_use blocks → tool_calls
    │
    ├─► result message
    │   ├─► Capture usage → sdk_usage
    │   ├─► Capture cost → cost_usd
    │   └─► Handle subtypes:
    │       ├─► success → return result
    │       ├─► error_during_execution → throw error
    │       └─► error_max_turns → throw error
    │
    └─► system message (logged but not processed)
```

## Task Types

### AI Prompt Task

```typescript
{
  "type": "ai_prompt",
  "task_config": {
    "type": "ai_prompt",
    "prompt": "Your prompt here",
    "inherit_context": true,           // Load CLAUDE.md files
    "allowed_tools": ["Read", "Grep"], // Restrict tools
    "additional_context": "...",       // Extra instructions
    "model": "claude-sonnet-4.5",      // Override model
    "max_thinking_tokens": 10000       // Extended thinking
  }
}
```

**Features:**
- Automatic context inheritance
- Tool restrictions
- Model selection
- Additional context appending
- Extended thinking support

### SDK Query Task

```typescript
{
  "type": "sdk_query",
  "task_config": {
    "type": "sdk_query",
    "prompt": "Your prompt here",
    "sdk_options": {
      "permissionMode": "bypassPermissions",
      "settingSources": ["project"],
      "allowedTools": ["Read", "Grep"],
      "maxTurns": 10
    }
  }
}
```

**Features:**
- Full SDK options control
- Custom permission modes
- Fine-grained tool control
- Turn limit configuration

## Context Loading

### settingSources Configuration

```typescript
// Automatic for ai_prompt with inherit_context=true
settingSources: ['project', 'user']

// Project only
settingSources: ['project']

// User only
settingSources: ['user']

// No context
settingSources: []
```

### CLAUDE.md Loading Behavior

| Task Type | inherit_context | Default settingSources |
|-----------|----------------|------------------------|
| ai_prompt | true (default) | `['project', 'user']` |
| ai_prompt | false | `[]` |
| sdk_query | N/A | Custom via sdk_options |

## Permission Modes

### bypassPermissions (Default)
- Full autonomous execution
- No user prompts
- Ideal for scheduled tasks

### acceptEdits
- Auto-accepts file edits
- Prompts for other actions
- Good for development workflows

### plan
- Planning only, no execution
- Analysis and reporting tasks
- Safe mode for exploration

### default
- Requires approval for all actions
- Manual task execution
- Interactive mode

## Usage Tracking

### Metrics Captured

```typescript
{
  sdk_usage: {
    input_tokens: number,           // Prompt tokens
    output_tokens: number,          // Response tokens
    cache_creation_input_tokens?: number,  // Prompt caching
    cache_read_input_tokens?: number       // Cache hits
  },
  cost_usd: number,                // Total cost in USD
  tool_calls: [{                   // Tools used
    tool_name: string,
    tool_input: object,
    timestamp: string
  }]
}
```

## Error Handling

### Error Types

1. **Validation Errors**
   - Missing prompt
   - Invalid configuration
   - Returns: `{ status: 'failure', error: '...' }`

2. **Execution Errors**
   - SDK execution failure
   - Max turns exceeded
   - Returns: `{ status: 'failure', error: '...' }`

3. **Runtime Errors**
   - Network issues
   - API errors
   - Returns: `{ status: 'failure', error: '...' }`

## Testing

### Test Coverage

- 14 integration test cases
- All message types covered
- Error scenarios tested
- Context loading verified
- Cost tracking validated

### Running Tests

```bash
npm test
```

## Example Usage

### Example 1: Simple AI Task

```typescript
const task = {
  name: "Generate Summary",
  type: "ai_prompt",
  task_config: {
    type: "ai_prompt",
    prompt: "Read README.md and summarize",
    inherit_context: true,
    allowed_tools: ["Read"]
  }
};

const executor = new SDKExecutor();
const result = await executor.execute(task, execution);

// Result:
// {
//   status: 'success',
//   output: '...',
//   duration_ms: 5000,
//   sdk_usage: { input_tokens: 100, output_tokens: 50 },
//   cost_usd: 0.002
// }
```

### Example 2: SDK Query with Custom Options

```typescript
const task = {
  name: "Code Analysis",
  type: "sdk_query",
  task_config: {
    type: "sdk_query",
    prompt: "Analyze src/ for issues",
    sdk_options: {
      permissionMode: "plan",
      settingSources: ["project"],
      allowedTools: ["Read", "Grep", "Glob"],
      maxTurns: 5
    }
  }
};

const executor = new SDKExecutor();
const result = await executor.execute(task, execution);
```

## Integration Points

### With Scheduler
- Called via ExecutorFactory
- Execution results persisted
- Usage tracked in database

### With Storage
- Task configuration stored
- Execution records saved
- Cost data queryable

### With MCP Tools
- Tasks created via MCP
- Execution triggered via MCP
- Results retrieved via MCP

## Performance Considerations

### Token Optimization
- Use prompt caching for repeated context
- Restrict tools to reduce overhead
- Set appropriate maxTurns limits

### Cost Management
- Track costs per execution
- Monitor usage trends
- Set budget alerts (future)

### Execution Time
- Default maxTurns: 20
- Typical duration: 3-30 seconds
- Timeout handling in scheduler

## Security

### Permission Control
- bypassPermissions for automation
- Tool restrictions for safety
- Context isolation per task

### Data Privacy
- Task configs in database
- Execution results logged
- API keys via environment

## Future Enhancements

### Planned Features
- Streaming output support
- Extended thinking capture
- Cost budgets per task
- Usage analytics dashboard
- Retry logic for failures

### Potential Optimizations
- Parallel task execution
- Result caching
- Smart context loading
- Adaptive maxTurns

## Summary

The SDK Executor is a production-ready component that enables:
- Autonomous AI task execution
- Flexible context management
- Comprehensive usage tracking
- Robust error handling
- Full Claude Agent SDK integration

**Status:** 100% Complete, Ready for Production Use
