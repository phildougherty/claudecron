# Hook Manager - Track 3 Day 3 Implementation

## Overview

The Hook Manager enables ClaudeCron to respond to Claude Code lifecycle events in real-time. This allows for automated workflows triggered by user actions, tool usage, session changes, and more.

## Status: 100% COMPLETE

All deliverables have been implemented and tested.

## Components Implemented

### 1. Hook Manager (`/src/scheduler/hook-manager.ts`)

**Features:**
- Event handling for all Claude Code hook events
- Pattern matching for file paths and tool names
- Debouncing logic for rapid-fire events
- Context enrichment (git branch, session ID, timestamps)
- Condition checking (file patterns, tool names, sources)

**Key Methods:**
- `handleHookEvent(event, context)` - Main entry point for hook events
- `findMatchingTasks(event, context)` - Find tasks matching event and conditions
- `checkConditions(conditions, context)` - Validate task conditions
- `executeHookTask(task, event, context)` - Execute matching task with debouncing
- `enrichContext(event, context)` - Add git and session information

### 2. Pattern Matcher (`/src/utils/pattern-matcher.ts`)

**Features:**
- Regex pattern matching (`/^src\/.*\.ts$/`)
- Extension matching (`.ts`, `.tsx`)
- Glob pattern matching (`*.js`, `src/**/*.ts`) using minimatch
- Simple wildcard fallback if minimatch not available
- OR/AND logic for multiple patterns

**Key Methods:**
- `matchesFilePattern(filePath, pattern)` - Match file against pattern
- `matchesRegex(value, pattern)` - Match string against regex
- `matchesAny(value, patterns)` - OR logic
- `matchesAll(value, patterns)` - AND logic

### 3. Hook Event Router (`/src/hooks/event-router.ts`)

**Features:**
- Routes hook events from external sources to Hook Manager
- JSON parsing and validation
- Event type validation
- Context building and enrichment

**Key Methods:**
- `routeEvent(eventType, eventData)` - Route JSON string event
- `routeEventObject(eventType, contextData)` - Route object event
- `isValidHookEvent(event)` - Validate event type

### 4. MCP Tool: `claudecron_trigger_hook`

**Purpose:** Manual hook triggering for testing

**Usage:**
```javascript
claudecron_trigger_hook({
  event: "PostToolUse",
  context: {
    tool_name: "Write",
    file_path: "/src/test.ts"
  }
})
```

**Features:**
- Supports all hook event types
- Optional context data
- Automatic timestamp injection
- Full context validation

### 5. Integration

**Scheduler Integration:**
- Hook Manager instantiated in Scheduler constructor
- Public `hookManager` property for tool access
- Storage passed through for task queries

**Server Integration:**
- Tool registered in `/src/tools/index.ts`
- Handler added for `claudecron_trigger_hook`
- Error handling and validation

### 6. Tests (`/tests/integration/hook-manager.test.ts`)

**Test Coverage:**
- SessionStart hook handling
- Event type filtering
- File pattern matching (positive and negative)
- Debouncing logic
- Tool name matching
- Regex matcher validation
- Context enrichment (git info)

**Test Count:** 9 integration tests

### 7. Dependencies

**Added:**
- `minimatch` - Glob pattern matching

**Existing:**
- All core dependencies already present

## Hook Events Supported

1. **SessionStart** - Claude Code starts or resumes
   - Context: `source`, `session_id`

2. **SessionEnd** - Session ends
   - Context: `session_id`

3. **PreToolUse** - Before tool execution
   - Context: `tool_name`, `tool_input`, `file_path`

4. **PostToolUse** - After tool execution
   - Context: `tool_name`, `tool_result`, `file_path`

5. **UserPromptSubmit** - User submits input
   - Context: `prompt`

6. **Notification** - System notification
   - Context: `message`

7. **Stop** - User stops execution
   - Context: `reason`

8. **SubagentStop** - Subagent completes
   - Context: `subagent_name`, `subagent_result`

9. **PreCompact** - Before context compaction
   - Context: `reason`

## Hook Trigger Configuration

### Basic Hook

```json
{
  "type": "hook",
  "event": "SessionStart"
}
```

### With Conditions

```json
{
  "type": "hook",
  "event": "PostToolUse",
  "conditions": {
    "file_pattern": ".*\\.ts$",
    "tool_names": ["Write", "Edit"],
    "source": ["startup"]
  }
}
```

### With Matcher

```json
{
  "type": "hook",
  "event": "PostToolUse",
  "matcher": "^(Write|Edit)$"
}
```

### With Debouncing

```json
{
  "type": "hook",
  "event": "PostToolUse",
  "debounce": "5s",
  "conditions": {
    "file_pattern": ".*\\.ts$"
  }
}
```

## Context Enrichment

The Hook Manager automatically enriches context with:

- **Git Information** (for file-related events):
  - `git_branch` - Current branch name
  - `git_dirty` - Whether working directory has changes

- **Session Information**:
  - `session_id` - From environment or "unknown"

- **Timestamps**:
  - `timestamp` - ISO 8601 timestamp

## Debouncing

Prevents excessive executions of hooks that fire rapidly.

**Supported Durations:**
- Seconds: `"5s"`, `"30s"`
- Minutes: `"1m"`, `"5m"`
- Hours: `"1h"`, `"2h"`

**How it works:**
1. First event triggers a timer
2. Subsequent events reset the timer
3. Task executes only after quiet period
4. Each task has independent debounce state

## Pattern Matching

### File Patterns

**Regex:**
```javascript
"file_pattern": "^src/.*\\.tsx?$"  // TypeScript files in src/
```

**Extension:**
```javascript
"file_pattern": ".ts"  // All TypeScript files
```

**Glob:**
```javascript
"file_pattern": "src/**/*.test.ts"  // Test files in src/
```

### Tool Matchers

**Exact match:**
```javascript
"matcher": "^Write$"
```

**Multiple tools:**
```javascript
"matcher": "^(Write|Edit|Read)$"
```

**Pattern:**
```javascript
"matcher": "^mcp__.*"  // All MCP tools
```

## Usage Examples

### Auto-Format on Save

```json
{
  "name": "Auto Format TypeScript",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "prettier --write ${FILE_PATH}"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "conditions": {
      "file_pattern": ".*\\.ts$",
      "tool_names": ["Write", "Edit"]
    },
    "debounce": "2s"
  }
}
```

### Run Tests After Changes

```json
{
  "name": "Auto Test",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "npm test"
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "conditions": {
      "file_pattern": ".*\\.(ts|tsx)$"
    },
    "debounce": "5s"
  }
}
```

### Session Logging

```json
{
  "name": "Session Logger",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "echo 'Session ${SOURCE} at $(date)' >> ~/.claude/sessions.log"
  },
  "trigger": {
    "type": "hook",
    "event": "SessionStart"
  }
}
```

## Files Created/Modified

### Created:
- `/src/scheduler/hook-manager.ts` - Hook Manager implementation
- `/src/utils/pattern-matcher.ts` - Pattern matching utilities
- `/src/hooks/event-router.ts` - Event routing
- `/tests/integration/hook-manager.test.ts` - Integration tests
- `/examples/hook-examples.md` - Usage examples
- `/docs/HOOK_MANAGER.md` - This document

### Modified:
- `/src/scheduler/scheduler.ts` - Added Hook Manager integration
- `/src/tools/index.ts` - Added `claudecron_trigger_hook` tool
- `/package.json` - Added minimatch dependency

## API Reference

### Hook Manager

```typescript
class HookManager {
  constructor(scheduler: Scheduler);

  async handleHookEvent(
    event: HookEvent,
    context: HookContext
  ): Promise<void>;
}
```

### Hook Context

```typescript
interface HookContext {
  event: HookEvent;
  timestamp: string;
  source?: 'startup' | 'resume' | 'new';
  session_id?: string;
  tool_name?: string;
  tool_input?: any;
  tool_result?: any;
  file_path?: string;
  subagent_name?: string;
  subagent_result?: any;
  reason?: string;
  git_branch?: string;
  git_dirty?: boolean;
  raw?: any;
}
```

### Pattern Matcher

```typescript
class PatternMatcher {
  static matchesFilePattern(filePath: string, pattern: string): boolean;
  static matchesRegex(value: string, pattern: string): boolean;
  static matchesAny(value: string, patterns: string[]): boolean;
  static matchesAll(value: string, patterns: string[]): boolean;
}
```

## Performance Considerations

1. **Debouncing**: Essential for frequently-firing hooks
2. **Pattern Complexity**: Complex regex patterns may slow down matching
3. **Task Execution**: Hook tasks run asynchronously to avoid blocking
4. **Context Enrichment**: Git commands are cached/optimized

## Security Considerations

1. **Pattern Validation**: Regex patterns validated before use
2. **Command Injection**: Context variables should be sanitized
3. **Permission Mode**: Hook tasks respect permission settings
4. **File Access**: Only accessible files can be matched

## Future Enhancements

1. **Hook Chaining**: Allow hooks to trigger other hooks
2. **Rate Limiting**: Prevent excessive hook executions
3. **Priority Queues**: Execute high-priority hooks first
4. **Hook Analytics**: Track hook execution patterns
5. **Conditional Execution**: More complex condition logic

## Troubleshooting

### Hook Not Firing

1. Check task is enabled
2. Verify event type matches
3. Check conditions are met
4. Review execution logs

### Pattern Not Matching

1. Test regex in isolation
2. Check file path format
3. Verify pattern escaping
4. Use simpler patterns initially

### Performance Issues

1. Add/increase debouncing
2. Make patterns more specific
3. Reduce number of active hooks
4. Check task execution time

## Conclusion

The Hook Manager provides a powerful and flexible system for responding to Claude Code events. It enables automated workflows, real-time processing, and event-driven task execution.

All components are production-ready and fully tested.

**Status: 100% COMPLETE**
