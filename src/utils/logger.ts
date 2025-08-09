/**
 * @fileoverview Simple structured logging utility with configurable levels and color output.
 * 
 * This module provides a lightweight logging system designed for Discord bot development:
 * - Configurable log levels with hierarchical filtering (error > warn > info > debug)
 * - Color-coded console output for improved readability during development
 * - Structured JSON metadata for log aggregation and debugging
 * - Integration with environment configuration for runtime log level control
 * - Simple interface compatible with Winston-style logging patterns
 * 
 * Key Features:
 * - Environment-based log level configuration with safe defaults
 * - ANSI color codes for terminal output with automatic reset handling
 * - Timestamp injection for all log entries
 * - Consistent formatting across all log levels
 * - Type-safe log level validation and fallback handling
 * 
 * Log Levels (in order of priority):
 * - error: Critical errors requiring immediate attention
 * - warn: Warning conditions that should be investigated
 * - info: General informational messages about application flow
 * - debug: Detailed debugging information for development
 * 
 * Usage Context:
 * Primary logging utility used throughout the application for error tracking,
 * debugging streaming operations, and monitoring bot behavior in production.
 */

import { botConfig } from '../config/environment.js';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1, 
  info: 2,
  debug: 3
};

const COLORS: Record<LogLevel, string> = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[35m'  // Magenta
};

const RESET = '\x1b[0m';

class SimpleLogger {
  private level: LogLevel;

  constructor() {
    const configLevel = botConfig.development.logLevel.trim() as LogLevel;
    this.level = LOG_LEVELS[configLevel] !== undefined ? configLevel : 'info';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] <= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string, ...args: any[]): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const color = COLORS[level];
    const levelStr = level.toUpperCase().padEnd(5);
    
    console.log(`${color}${levelStr}${RESET}: ${message}`, ...args, `{"timestamp":"${timestamp}"}`);
  }

  error(message: string, ...args: any[]): void {
    this.formatMessage('error', message, ...args);
  }

  warn(message: string, ...args: any[]): void {
    this.formatMessage('warn', message, ...args);
  }

  info(message: string, ...args: any[]): void {
    this.formatMessage('info', message, ...args);
  }

  debug(message: string, ...args: any[]): void {
    this.formatMessage('debug', message, ...args);
  }
}

export const logger = new SimpleLogger();