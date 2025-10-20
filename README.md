# claudecron

Schedule tasks in Claude Code. Run bash commands, AI prompts, or slash commands based on cron schedules, Claude Code hooks, or file changes.

## What it does

This is an MCP server that lets you automate stuff in Claude Code. You can:

- Run bash commands on a schedule or when files change
- Trigger AI tasks when certain events happen (like session start)
- Execute slash commands automatically
- Chain tasks together with dependencies
- React to Claude Code events (file edits, tool usage, etc.)

## Installation

You need Node.js 18 or later.

```bash
cd mcp-server
npm install
npm run build
```

## Configure as MCP Server

Add this to your Claude Code MCP configuration. The location depends on your OS:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "claudecron": {
      "command": "node",
      "args": ["/absolute/path/to/claudecron/mcp-server/dist/server.js"]
    }
  }
}
```

Replace `/absolute/path/to/claudecron` with the actual path.

Restart Claude Code after adding the configuration.

## Basic Usage

Once the MCP server is running, you can create tasks from within Claude Code.

### Create a scheduled task

Ask Claude to create a task:

```
Create a claudecron task that backs up my database every day at 2 AM
```

Claude will use the `claudecron_add_task` tool to create it. Here's what that looks like:

```json
{
  "name": "Daily Database Backup",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "pg_dump mydb > backups/mydb-$(date +%Y%m%d).sql"
  },
  "trigger": {
    "type": "schedule",
    "cron": "0 2 * * *",
    "timezone": "UTC"
  }
}
```

### Create a hook-based task

Run something when you edit files:

```
Create a task that runs prettier whenever I save a TypeScript file
```

This creates a task like:

```json
{
  "name": "Auto-format TypeScript on Save",
  "type": "bash",
  "task_config": {
    "type": "bash",
    "command": "prettier --write \"$FILE_PATH\""
  },
  "trigger": {
    "type": "hook",
    "event": "PostToolUse",
    "conditions": {
      "tool_names": ["Write", "Edit"],
      "file_pattern": ".*\\.tsx?$"
    },
    "debounce": "2s"
  }
}
```

### Create an AI task

Run AI prompts automatically:

```
Create a task that summarizes my git commits when I start a session
```

This creates:

```json
{
  "name": "Session Startup Report",
  "type": "subagent",
  "task_config": {
    "type": "subagent",
    "prompt": "Review recent git commits and provide a brief summary of work since last session.",
    "inherit_context": true,
    "allowed_tools": ["Bash", "Read"]
  },
  "trigger": {
    "type": "hook",
    "event": "SessionStart"
  }
}
```

## Task Types

### **bash** - Execute shell commands
Run any shell command with full environment control.

**Good for**: builds, tests, file operations, git commands, scripts

**Example**:
```json
{
  "type": "bash",
  "command": "npm test",
  "cwd": "/path/to/project",
  "timeout": 60000
}
```

### **subagent** - Execute prompts via Claude SDK
Run any AI prompt with full Claude SDK capabilities.

**Good for**: code review, analysis, refactoring, documentation, complex multi-step workflows

**Example** (inline prompt):
```json
{
  "type": "subagent",
  "prompt": "Review the code changes and summarize",
  "model": "claude-sonnet-4.5",
  "inherit_context": true,
  "allowed_tools": ["Read", "Grep"],
  "capture_thinking": true
}
```

**Example** (load from .claude/commands/):
```json
{
  "type": "subagent",
  "command": "review-pr",
  "args": "123",
  "stream_output": true
}
```

**Subagent config options**:
- `prompt` - Inline prompt (supports `{{template_vars}}`)
- `command` - Load prompt from `.claude/commands/{command}.md`
- `args` - Arguments to append to command
- `model` - Model to use (default: claude-sonnet-4.5)
- `inherit_context` - Load CLAUDE.md context (default: true)
- `allowed_tools` - Restrict available tools
- `additional_context` - Extra context to append
- `capture_thinking` - Capture thinking blocks (Claude 4.5+)
- `stream_output` - Stream results in real-time
- `max_thinking_tokens` - Extended thinking token limit
- `sdk_options` - Override any SDK option

## Triggers

**schedule** - Cron-based scheduling
```json
{
  "type": "schedule",
  "cron": "0 9 * * 1-5",
  "timezone": "America/New_York"
}
```

**hook** - React to Claude Code events
```json
{
  "type": "hook",
  "event": "PostToolUse",
  "conditions": {
    "tool_names": ["Write", "Edit"],
    "file_pattern": ".*\\.ts$"
  },
  "debounce": "2s"
}
```

Available hook events:
- `SessionStart` - When Claude Code starts or resumes
- `SessionEnd` - When session ends
- `PreToolUse` - Before any tool is used
- `PostToolUse` - After any tool is used
- `UserPromptSubmit` - When user submits a prompt
- `SubagentStop` - When a subagent finishes
- `Stop` - When user stops Claude
- `PreCompact` - Before context compaction
- `Notification` - Custom notifications

**file_watch** - Watch files for changes
```json
{
  "type": "file_watch",
  "path": "src/**/*.ts",
  "debounce": "5s"
}
```

**dependency** - Run after other tasks complete
```json
{
  "type": "dependency",
  "depends_on": ["task-id-1", "task-id-2"],
  "require_all": true
}
```

**interval** - Run every X minutes/hours
```json
{
  "type": "interval",
  "every": "30m"
}
```

**manual** - Only run when explicitly triggered
```json
{
  "type": "manual",
  "description": "Run this manually via claudecron_run_task"
}
```

## MCP Tools

These tools are available in Claude Code once the server is running:

- `claudecron_add_task` - Create a new task
- `claudecron_list_tasks` - List all tasks
- `claudecron_get_task` - Get task details
- `claudecron_update_task` - Update a task
- `claudecron_delete_task` - Delete a task
- `claudecron_run_task` - Manually run a task
- `claudecron_list_executions` - See execution history
- `claudecron_get_execution` - Get execution details
- `claudecron_get_execution_progress` - Check running task status
- `claudecron_trigger_hook` - Manually trigger a hook (for testing)
- `claudecron_get_tool_analytics` - Get usage statistics

## Managing Tasks

List all tasks:
```
Show me all my claudecron tasks
```

Run a task manually:
```
Run the task named "Daily Database Backup"
```

Check execution history:
```
Show me the last 10 task executions
```

Delete a task:
```
Delete the task named "Auto-format TypeScript on Save"
```

## Configuration for Subagent Tasks

Subagent tasks can use MCP tools if you configure them. Create a `.mcp.json` file in your project:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

Now AI tasks running in your project can use those MCP tools. Note: This is different from Claude Code's main MCP config. Tasks run in their own execution environment.

## Examples

Check the `examples/hook-tasks.json` file for more task examples including:
- Auto-formatting on save
- Running tests when files change
- Session startup reports
- Commit message generation
- Cleanup on session end
- Linting on save
- Build on config changes
- Weekly dependency reports

## Important Notes

- Tasks run in an isolated environment
- They don't have access to Claude Code's MCP servers by default
- Use `.mcp.json` in your project to give AI tasks access to specific MCP servers
- Hook tasks can see file paths via template variables like `$FILE_PATH`
- Cron expressions support seconds (6 fields) or standard 5-field format
- Timezones use IANA format (e.g., `America/New_York`, `Europe/London`)

## Development

Build:
```bash
npm run build
```

Watch mode:
```bash
npm run dev
```

Run tests:
```bash
npm test
```

Type check:
```bash
npm run type-check
```

## Storage

Tasks and execution history are stored in SQLite. Default location is `~/.claude/claudecron/tasks.db`.

## License

MIT
