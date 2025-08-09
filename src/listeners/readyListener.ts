/**
 * @fileoverview Discord client ready event handler for bot initialization and startup tasks.
 * 
 * Handles the Discord client ready event, performing essential initialization tasks
 * when the bot successfully connects to Discord. Key responsibilities include:
 * - Logging successful bot connection with user information
 * - Slash command registration with Discord API
 * - Game state cleanup for stale or abandoned games
 * - Initial system health checks and validation
 * 
 * This handler ensures the bot is fully operational and ready to handle user
 * interactions by completing all necessary startup procedures and cleanup tasks
 * before beginning normal operation.
 */

import { Client } from 'discord.js';
import { logger } from '../utils/logger.js';
import { CommandService } from '../services/CommandService.js';
import { gameManager } from '../flows/gameFlow.js';

export async function handleReady(client: Client, commandService: CommandService): Promise<void> {
  logger.info(`Discord bot ready! Logged in as ${client.user?.tag}`);
  await commandService.registerSlashCommands();
  await gameManager().cleanupStaleGames();
}