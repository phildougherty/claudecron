/**
 * Template Variable System
 *
 * Provides variable substitution for file paths, messages, and other strings
 * Supports: {{date}}, {{timestamp}}, {{week_number}}, {{task_id}}, {{task_name}}, etc.
 */

import { Task, Execution } from '../models/types.js';

/**
 * Replace template variables in a string
 *
 * Supported variables:
 * - {{date}} - Current date in YYYY-MM-DD format
 * - {{timestamp}} - Unix timestamp in seconds
 * - {{week_number}} - ISO week number (1-53)
 * - {{year}} - Current year (YYYY)
 * - {{month}} - Current month (01-12)
 * - {{day}} - Current day (01-31)
 * - {{hour}} - Current hour (00-23)
 * - {{minute}} - Current minute (00-59)
 * - {{task_id}} - Task ID
 * - {{task_name}} - Task name
 * - {{execution_id}} - Execution ID
 * - {{status}} - Execution status
 *
 * @param template - String with template variables
 * @param task - Task object for task-specific variables
 * @param execution - Execution object for execution-specific variables
 * @returns String with variables replaced
 */
export function replaceTemplateVariables(
  template: string,
  task?: Task,
  execution?: Execution
): string {
  const now = new Date();

  // Date/time variables
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');

  const date = `${year}-${month}-${day}`;
  const timestamp = Math.floor(now.getTime() / 1000);
  const weekNumber = getWeekNumber(now);

  // Build replacement map
  const replacements: Record<string, string> = {
    // Date/time
    date,
    timestamp: String(timestamp),
    week_number: String(weekNumber),
    year: String(year),
    month,
    day,
    hour,
    minute,
    second,

    // Date formats
    datetime: `${date}_${hour}-${minute}-${second}`,
    date_hour: `${date}_${hour}`,

    // Task variables
    task_id: task?.id ?? 'unknown',
    task_name: task?.name ?? 'unknown',
    task_type: task?.type ?? 'unknown',

    // Execution variables
    execution_id: execution?.id ?? 'unknown',
    status: execution?.status ?? 'unknown',
    trigger_type: execution?.trigger_type ?? 'unknown',
  };

  // Replace all variables
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    const pattern = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    result = result.replace(pattern, value);
  }

  return result;
}

/**
 * Get ISO week number for a date
 * @param date - Date to get week number for
 * @returns Week number (1-53)
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Check if a string contains template variables
 * @param str - String to check
 * @returns True if string contains any template variables
 */
export function hasTemplateVariables(str: string): boolean {
  return /\{\{[^}]+\}\}/.test(str);
}

/**
 * Extract all template variable names from a string
 * @param str - String to extract variables from
 * @returns Array of variable names (without {{}} delimiters)
 */
export function extractTemplateVariables(str: string): string[] {
  const matches = str.match(/\{\{([^}]+)\}\}/g) || [];
  return matches.map(m => m.replace(/[{}]/g, ''));
}
