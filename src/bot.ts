/**
 * @fileoverview Main entry point for the Discord bot with Google Genkit integration.
 * 
 * This file serves as the primary bootstrap for the Discord bot system, handling:
 * - Genkit configuration initialization and flow registration
 * - Discord bot service instantiation and startup
 * - Graceful shutdown handling for SIGINT/SIGTERM signals
 * - Error handling and process management
 * 
 * The bot utilizes Google Genkit for AI flow orchestration with streaming support,
 * integrating Discord.js 14.x for real-time chat interactions. All flows are
 * automatically registered during startup by importing their respective modules.
 * 
 * Key Dependencies:
 * - Discord.js 14.x: Discord API integration with streaming message support
 * - Google Genkit 1.14.x: AI flow orchestration and streaming capabilities
 * - Winston-style logging: Structured logging with proper error tracking
 * 
 * Usage Context:
 * Primary entry point for the gemini-bot-rev2 project, designed for Windows
 * development environments with tsx hot-reload support.
 */

import './genkit.config.js';
import { DiscordBot } from './services/DiscordBot.js';
import { logger } from './utils/logger.js';
import './flows/chatFlow.js';
import './flows/ttsFlow.js';

// Global bot instance for cleanup
let bot: DiscordBot | null = null;

async function main(): Promise<void> {
  try {
    logger.info('Starting Discord bot with Genkit integration...');

    // Initialize flows (registers them with Genkit)
    logger.info('Registering Genkit flows...');
    // The flows are registered by importing them

    // Initialize Discord bot
    bot = new DiscordBot();
    await bot.start();

    logger.info('Bot started successfully!');
  } catch (error) {
    logger.error('Failed to start bot:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  if (bot) {
    await bot.stop();
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  if (bot) {
    await bot.stop();
  }
  process.exit(0);
});

// Start the application
main().catch((error) => {
  logger.error('Unhandled error in main:', error);
  process.exit(1);
});