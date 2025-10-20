/**
 * Test SubagentExecutor
 *
 * Simple test to verify SubagentExecutor implementation
 */

import { SubagentExecutor } from './src/executors/subagent-executor.js';
import { Task, SubagentTaskConfig, Execution } from './src/models/types.js';

async function testSubagentExecutor() {
  console.log('Testing SubagentExecutor...\n');

  // Create a test task
  const task: Task = {
    id: 'test-subagent',
    name: 'Test Subagent Task',
    description: 'Test subagent execution',
    enabled: true,
    type: 'subagent',
    task_config: {
      type: 'subagent',
      agent: 'test-agent',
      prompt: 'What is 2 + 2?',
      separate_context: true,
      inherit_tools: false,
      timeout: 30000
    } as SubagentTaskConfig,
    trigger: {
      type: 'manual',
      description: 'Manual test'
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    run_count: 0,
    success_count: 0,
    failure_count: 0
  };

  // Create a test execution
  const execution: Execution = {
    id: 'test-exec-1',
    task_id: task.id,
    started_at: new Date().toISOString(),
    trigger_type: 'manual',
    status: 'running'
  };

  // Create executor instance
  const executor = new SubagentExecutor();

  console.log('Executing subagent task...');
  console.log('Task:', JSON.stringify(task, null, 2));
  console.log('\n');

  try {
    const result = await executor.execute(task, execution);

    console.log('\nExecution Result:');
    console.log('Status:', result.status);
    console.log('Duration:', result.duration_ms, 'ms');
    console.log('Output:', result.output?.substring(0, 200));

    if (result.thinking_output) {
      console.log('Thinking:', result.thinking_output.substring(0, 200));
    }

    if (result.sdk_usage) {
      console.log('SDK Usage:', result.sdk_usage);
    }

    if (result.cost_usd) {
      console.log('Cost:', result.cost_usd, 'USD');
    }

    if (result.tool_calls && result.tool_calls.length > 0) {
      console.log('Tool Calls:', result.tool_calls.length);
    }

    console.log('\nTest completed successfully!');
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testSubagentExecutor().catch(console.error);
