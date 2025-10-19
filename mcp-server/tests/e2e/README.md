# End-to-End (E2E) Test Suite

Comprehensive end-to-end tests for ClaudeCron MCP Server.

## Overview

The E2E test suite validates complete workflows from task creation through execution and verification. These tests simulate real-world usage scenarios and ensure all components work together correctly.

## Test Structure

```
tests/e2e/
├── framework.ts           # E2E test framework and utilities
├── workflows.test.ts      # Complete workflow scenarios
├── hooks.test.ts          # Hook integration tests
├── performance.test.ts    # Performance and load tests
├── recovery.test.ts       # Error recovery and resilience tests
└── README.md             # This file
```

## Test Categories

### 1. Workflow Tests (`workflows.test.ts`)

Tests complete task lifecycle workflows:

- **Basic Task Workflows**
  - Create, execute, and verify tasks
  - Handle task failures
  - Handle timeouts
  - Custom working directories
  - Environment variables

- **Multiple Execution Workflows**
  - Track statistics across executions
  - Mixed success/failure scenarios

- **Persistence Workflows**
  - Data persistence across restarts
  - Database recovery

- **Conditional Execution Workflows**
  - File-based conditions
  - Conditional task skipping

- **Complex Workflow Scenarios**
  - Sequential task execution
  - Concurrent task execution
  - Dependency chains

### 2. Hook Integration Tests (`hooks.test.ts`)

Tests hook-triggered task execution:

- **SessionStart Hook**
  - Session initialization tasks
  - Debouncing support

- **PostToolUse Hook**
  - File edit triggers
  - File pattern filtering
  - Tool name filtering

- **SubagentStop Hook**
  - Subagent completion handlers
  - Subagent name filtering

- **PreToolUse Hook**
  - Pre-execution validation

- **Other Hooks**
  - Notification handlers
  - Session cleanup
  - Stop handlers

### 3. Performance Tests (`performance.test.ts`)

Tests system performance and scalability:

- **Task Creation Performance**
  - Bulk task creation
  - Creation throughput

- **Concurrent Execution Performance**
  - Multiple concurrent tasks
  - Rapid sequential executions

- **Database Performance**
  - Query efficiency
  - Large task counts

- **Resource Tests**
  - Large output handling
  - Memory constraints

- **Stress Tests**
  - Mixed workloads
  - Sustained load
  - Throughput measurements

### 4. Recovery Tests (`recovery.test.ts`)

Tests error handling and recovery:

- **Task Failure Recovery**
  - Retry mechanisms
  - Exponential backoff
  - Timeout recovery

- **Database Recovery**
  - Database restart handling
  - Corrupted data handling

- **Resource Exhaustion Recovery**
  - Disk space issues
  - Memory constraints

- **Concurrent Failure Scenarios**
  - Multiple simultaneous failures
  - Failure isolation

- **State Corruption Recovery**
  - Incomplete execution records
  - Missing files

- **Scheduler Recovery**
  - Task rescheduling
  - Disabled task handling

## Running E2E Tests

### Run All E2E Tests
```bash
npm run test:e2e
```

### Run Specific Test Suite
```bash
# Workflow tests only
npx vitest run tests/e2e/workflows.test.ts

# Hook tests only
npx vitest run tests/e2e/hooks.test.ts

# Performance tests only
npx vitest run tests/e2e/performance.test.ts

# Recovery tests only
npx vitest run tests/e2e/recovery.test.ts
```

### Watch Mode
```bash
npm run test:e2e:watch
```

### With Coverage
```bash
npm run test:coverage -- tests/e2e
```

## E2E Test Framework

The `E2ETestFramework` class provides utilities for E2E testing:

### Setup and Teardown
```typescript
let framework: E2ETestFramework;

beforeEach(async () => {
  framework = new E2ETestFramework();
  await framework.setup();
});

afterEach(async () => {
  await framework.teardown();
});
```

### Creating Tasks
```typescript
const task = await framework.createTask({
  name: 'Test Task',
  type: 'bash',
  task_config: {
    type: 'bash',
    command: 'echo "test"'
  },
  trigger: {
    type: 'manual',
    description: 'Test'
  }
});
```

### Executing Tasks
```typescript
const executionId = await framework.executeTask(task.id, 'manual');
const execution = await framework.waitForExecutionComplete(executionId);
```

### Assertions
```typescript
// Assert execution status
framework.assertExecutionStatus(execution, 'success');

// Assert task statistics
framework.assertTaskStats(task, {
  run_count: 1,
  success_count: 1,
  failure_count: 0
});
```

### Utilities
```typescript
// Create temporary files
const tempFile = framework.createTempFile('content');

// Sleep
await framework.sleep(1000);

// Get task/execution
const task = await framework.getTask(taskId);
const execution = await framework.getExecution(executionId);
const executions = await framework.listExecutions(taskId);
```

## Writing New E2E Tests

### Test Template
```typescript
describe('My E2E Test Suite', () => {
  let framework: E2ETestFramework;

  beforeEach(async () => {
    framework = new E2ETestFramework();
    await framework.setup();
  });

  afterEach(async () => {
    await framework.teardown();
  });

  it('should perform end-to-end workflow', async () => {
    // 1. Create task
    const task = await framework.createTask({
      name: 'Test Task',
      type: 'bash',
      task_config: {
        type: 'bash',
        command: 'echo "test"'
      },
      trigger: {
        type: 'manual',
        description: 'Test'
      }
    });

    // 2. Execute task
    const executionId = await framework.executeTask(task.id);

    // 3. Wait for completion
    const execution = await framework.waitForExecutionComplete(executionId);

    // 4. Verify results
    framework.assertExecutionStatus(execution, 'success');
    expect(execution!.output).toContain('test');

    // 5. Verify task stats
    const updatedTask = await framework.getTask(task.id);
    framework.assertTaskStats(updatedTask, {
      run_count: 1,
      success_count: 1
    });
  }, 10000);
});
```

## Best Practices

1. **Isolation**: Each test should be independent and not rely on other tests
2. **Cleanup**: Always use the framework's teardown to clean up resources
3. **Timeouts**: Set appropriate timeouts for long-running tests
4. **Assertions**: Use framework assertions for consistent error messages
5. **Temp Files**: Use framework utilities to create temporary files that auto-cleanup
6. **Concurrency**: Be mindful of concurrent test execution and resource sharing

## Performance Considerations

- E2E tests are slower than unit tests
- Use `test:e2e:watch` during development for faster feedback
- Run full E2E suite in CI/CD pipeline
- Monitor test execution times to catch performance regressions

## Troubleshooting

### Tests Timing Out
- Increase test timeout in test file: `it('test', async () => {...}, 60000)`
- Check for deadlocks or infinite loops
- Verify database isn't locked

### Flaky Tests
- Add retry logic for network-dependent tests
- Use proper waiting mechanisms instead of fixed sleeps
- Ensure proper cleanup between tests

### Database Issues
- Check for file permissions in `/tmp` directory
- Verify database connections are properly closed
- Check for leaked database handles

## Contributing

When adding new E2E tests:

1. Follow existing test patterns
2. Use the E2E test framework
3. Document complex test scenarios
4. Keep tests focused and clear
5. Add appropriate timeouts
6. Update this README if adding new test categories
