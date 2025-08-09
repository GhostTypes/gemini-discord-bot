/**
 * @fileoverview Game orchestration flow providing centralized game management interface.
 * 
 * Acts as a bridge between Discord commands/interactions and the underlying GameManager
 * service. Provides structured flow functions for:
 * - Game initialization and startup with configuration options
 * - Game action processing and state transitions
 * - GameManager singleton access and Discord client integration
 * - Type-safe input/output validation using Zod schemas
 * 
 * This flow ensures proper initialization of the GameManager with Discord client
 * dependencies and provides a clean interface for game-related operations throughout
 * the application. Handles game lifecycle management and maintains game state consistency.
 */

import { GameManager } from '../services/GameManager.js';
import { GameActionInput, GameActionOutput, GameStartInput, GameStartOutput } from './schemas/game.js';
import { logger } from '../utils/logger.js';
import { Client } from 'discord.js';

let gameManager: GameManager;

export function initializeGameManager(discordClient: Client) {
  gameManager = new GameManager();
  gameManager.setDiscordClient(discordClient);
}

function getGameManager(): GameManager {
  if (!gameManager) {
    throw new Error('GameManager not initialized. Call initializeGameManager first.');
  }
  return gameManager;
}

export async function startGameFlow(input: GameStartInput): Promise<GameStartOutput> {
  logger.info(`Starting game flow: ${input.gameType} in channel ${input.channelId}`);
  
  const result = await getGameManager().startGame(input.channelId, input.gameType, input.hostId);
  
  return {
    success: result.success,
    message: result.message,
    effects: result.effects,
  };
}

export async function gameActionFlow(input: GameActionInput): Promise<GameActionOutput> {
  logger.debug(`Processing game action: ${input.action.type} from ${input.userId} in ${input.channelId}`);
  
  const result = await getGameManager().handleAction(input.channelId, {
    ...input.action,
    userId: input.userId,
    timestamp: new Date(),
  });
  
  return {
    success: result.success,
    message: result.message,
    effects: result.effects,
  };
}

export { getGameManager as gameManager };