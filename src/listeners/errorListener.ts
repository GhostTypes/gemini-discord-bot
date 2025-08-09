/**
 * @fileoverview Discord client error event handler for comprehensive error logging.
 * 
 * Provides centralized error handling for Discord.js client errors, ensuring
 * all Discord-related errors are properly logged and tracked. This handler
 * captures various Discord client errors including:
 * - WebSocket connection issues
 * - API rate limiting errors
 * - Authentication and permission errors
 * - Network connectivity problems
 * 
 * The handler uses structured logging to provide detailed error information
 * for debugging and monitoring Discord bot health and connectivity status.
 */

import { logger } from '../utils/logger.js';

export function handleError(error: Error): void {
  logger.error('Discord client error:', error);
}