# Hook Manager Examples

This document provides examples of using the Hook Manager to respond to Claude Code lifecycle events.

## Table of Contents

1. [Basic Hook Tasks](#basic-hook-tasks)
2. [File-Based Hooks](#file-based-hooks)
3. [Tool-Specific Hooks](#tool-specific-hooks)
4. [Debounced Hooks](#debounced-hooks)
5. [Advanced Use Cases](#advanced-use-cases)

## Basic Hook Tasks

### SessionStart Hook

Run a task when Claude Code starts:

```json
{
  "name": "Session Initialization",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "echo 'Claude Code session started at $(date)' >> ~/.claude/session.log"
  },
  "trigger": {
    "type": "hook",
    "event": "SessionStart",
    "conditions": {
      "source": ["startup"]
    }
  },
  "enabled": true
}
```

### SessionEnd Hook

Cleanup task when Claude Code session ends:

```json
{
  "name": "Session Cleanup",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "echo 'Session ended' && cleanup-temp-files.sh"
  },
  "trigger": {
    "type": "hook",
    "event": "SessionEnd"
  },
  "enabled": true
}
```

## File-Based Hooks

### Run Tests After TypeScript File Changes

```json
{
  "name": "Auto Test TypeScript",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "npm test"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "conditions": {
      "file_pattern": ".*\\.ts$",
      "tool_names": ["Write", "Edit"]
    },
    "debounce": "5s"
  },
  "enabled": true
}
```

### Format Code After Edit

```json
{
  "name": "Auto Format",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "prettier --write ${FILE_PATH}"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "conditions": {
      "file_pattern": ".*\\.(ts|js|tsx|jsx)$",
      "tool_names": ["Write", "Edit"]
    },
    "debounce": "2s"
  },
  "enabled": true
}
```

### Git Auto-Commit After File Changes

```json
{
  "name": "Auto Git Commit",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "git add ${FILE_PATH} && git commit -m 'Auto-commit: ${FILE_PATH}'"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "conditions": {
      "tool_names": ["Write", "Edit"]
    },
    "debounce": "10s"
  },
  "enabled": true
}
```

## Tool-Specific Hooks

### Track All Tool Usage

```json
{
  "name": "Tool Usage Logger",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "echo '${TOOL_NAME} used at $(date)' >> ~/.claude/tool-usage.log"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse"
  },
  "enabled": true
}
```

### React to Specific Tools

```json
{
  "name": "File Write Notification",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "notify-send 'File Written' 'Claude wrote to ${FILE_PATH}'"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "matcher": "^(Write|Edit)$"
  },
  "enabled": true
}
```

## Debounced Hooks

### Build After Multiple File Changes

Debouncing prevents the build from running after every single file change:

```json
{
  "name": "Debounced Build",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "npm run build"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "conditions": {
      "tool_names": ["Write", "Edit"]
    },
    "debounce": "10s"
  },
  "enabled": true
}
```

### Sync to Remote After Multiple Changes

```json
{
  "name": "Sync to Remote",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "rsync -av . user@remote:/path/to/project"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "debounce": "30s"
  },
  "enabled": true
}
```

## Advanced Use Cases

### Context-Aware Task Execution

```json
{
  "name": "Context Logger",
  "type": "ai_prompt",
  "task_config": {
    "type": "ai_prompt",
    "prompt": "Analyze the file changes and suggest improvements for ${FILE_PATH}"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "conditions": {
      "file_pattern": ".*\\.(ts|js)$"
    }
  },
  "enabled": true
}
```

### Subagent Stop Handler

```json
{
  "name": "Subagent Completion Handler",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "echo 'Subagent ${SUBAGENT_NAME} completed' >> ~/.claude/subagent.log"
  },
  "trigger": {
    "type": "hook",
    "event": "SubagentStop"
  },
  "enabled": true
}
```

### Pre-Tool Validation

```json
{
  "name": "Pre-Tool Validator",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "validate-file.sh ${FILE_PATH}"
  },
  "trigger": {
    "type": "hook",
    "event": "PreToolUse",
    "conditions": {
      "tool_names": ["Write"]
    }
  },
  "enabled": true
}
```

### Notification on Stop

```json
{
  "name": "Stop Notification",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "notify-send 'Claude Stopped' 'Reason: ${REASON}'"
  },
  "trigger": {
    "type": "hook",
    "event": "Stop"
  },
  "enabled": true
}
```

## Hook Context Variables

Hook tasks receive context information that can be used in commands:

- `${EVENT}` - Hook event type
- `${TIMESTAMP}` - Event timestamp
- `${SESSION_ID}` - Claude session ID
- `${TOOL_NAME}` - Tool name (for tool-related hooks)
- `${FILE_PATH}` - File path (for file-related hooks)
- `${SUBAGENT_NAME}` - Subagent name (for SubagentStop)
- `${REASON}` - Stop reason (for Stop event)
- `${GIT_BRANCH}` - Current git branch (if available)
- `${GIT_DIRTY}` - Whether git working directory is dirty

## Testing Hooks

Use the `claudecron_trigger_hook` tool to manually test hooks:

```javascript
// Trigger a SessionStart hook
await claudecron_trigger_hook({
  event: "SessionStart",
  context: {
    source: "startup",
    session_id: "test-session-123"
  }
});

// Trigger a PostToolUse hook
await claudecron_trigger_hook({
  event: "PostToolUse",
  context: {
    tool_name: "Write",
    file_path: "/src/test.ts"
  }
});
```

## Best Practices

1. **Use Debouncing**: For hooks that might fire frequently (like PostToolUse), always use debouncing to prevent excessive executions.

2. **Be Specific**: Use conditions and matchers to make hooks as specific as possible. This prevents unexpected executions.

3. **Test Thoroughly**: Use the `claudecron_trigger_hook` tool to test your hooks before enabling them.

4. **Handle Errors**: Use `on_failure` handlers to capture and log errors from hook tasks.

5. **Monitor Performance**: Hooks run automatically, so ensure they don't slow down your workflow.

6. **Use File Patterns Carefully**: Regex file patterns are powerful but can be complex. Test them thoroughly.

## Pattern Matching Examples

### Regex Patterns

```javascript
// Match TypeScript files
"file_pattern": ".*\\.ts$"

// Match files in src directory
"file_pattern": "^src/.*"

// Match test files
"file_pattern": ".*\\.test\\.(ts|js)$"

// Match specific directories
"file_pattern": "^(src|lib)/.*"
```

### Tool Name Matchers

```javascript
// Match Write or Edit tools
"matcher": "^(Write|Edit)$"

// Match any Read-related tool
"matcher": "Read.*"

// Match MCP tools
"matcher": "^mcp__.*"
```

## Troubleshooting

### Hook Not Firing

1. Check if task is enabled: `claudecron_get_task({ id: "task-id" })`
2. Verify event type matches
3. Check conditions (file_pattern, tool_names, etc.)
4. Look at execution logs: `claudecron_list_executions({ task_id: "task-id" })`

### Hook Firing Too Often

1. Add or increase debounce duration
2. Make conditions more specific
3. Use file_pattern to narrow scope

### Hook Not Matching Files

1. Test your regex pattern separately
2. Ensure pattern is properly escaped
3. Check actual file paths in context

## Additional Resources

- See `CLAUDE_CRON.md` for full specification
- See `/tests/integration/hook-manager.test.ts` for test examples
- See `/src/scheduler/hook-manager.ts` for implementation details
