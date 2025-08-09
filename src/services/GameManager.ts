/**
 * @fileoverview Centralized game state management and coordination service.
 * 
 * Manages all game-related operations including lifecycle management, state
 * persistence, and Discord integration. Key responsibilities include:
 * - Game session initialization and termination
 * - State persistence and retrieval through Prisma database
 * - Game timeout management and automatic cleanup
 * - Discord message coordination for game updates
 * - Game action processing and effect handling
 * - Multi-channel game support with isolated states
 * 
 * Game Lifecycle Management:
 * - Start games with configurable options (difficulty, players, etc.)
 * - Handle game actions and state transitions
 * - Process game effects (messages, embeds, UI updates)
 * - Manage game timeouts and automatic cleanup
 * - Store and retrieve game message IDs for UI updates
 * 
 * Database Integration:
 * - Channel state management (NORMAL vs GAME mode)
 * - Game session persistence with active status tracking
 * - Game state serialization for complex game data
 * 
 * Works closely with GameRegistry for game instantiation and supports
 * multiple concurrent games across different Discord channels.
 */

import { prisma } from '../persistence/client.js';
import { GameRegistry } from '../games/common/GameRegistry.js';
import { GameState, GameAction, GameEffect } from '../games/common/types.js';
import { logger } from '../utils/logger.js';
import { TicTacToeGame } from '../games/tic-tac-toe/TicTacToeGame.js';
import { GeoGuesserGame } from '../games/geo-guesser/GeoGuesserGame.js';
import { Client } from 'discord.js';

export class GameManager {
  private timeouts = new Map<string, any>();
  private discordClient?: Client;
  private gameUpdateCallback?: (channelId: string, result: any) => Promise<void>;

  setDiscordClient(client: Client) {
    this.discordClient = client;
  }

  setGameUpdateCallback(callback: (channelId: string, result: any) => Promise<void>) {
    this.gameUpdateCallback = callback;
    console.log('GameManager: Game update callback registered');
  }

  async startGame(channelId: string, gameType: string, hostId: string, options?: { difficulty?: string }): Promise<{ success: boolean; message: string; effects?: GameEffect[] }> {
    try {
      const existingState = await prisma.channelState.findUnique({
        where: { channelId },
        include: { activeGameSession: true },
      });

      if (existingState?.mode === 'GAME' && existingState.activeGameSession?.isActive) {
        return {
          success: false,
          message: `A ${existingState.activeGameSession.gameType} game is already active in this channel!`,
        };
      }

      const game = GameRegistry.create(gameType);
      if (!game) {
        return {
          success: false,
          message: `Unknown game type: ${gameType}. Use \`/game list\` to see available games.`,
        };
      }

      const result = game.startGame({ hostId, channelId, ...options });
      if (!result.success) {
        return {
          success: false,
          message: 'Failed to start game.',
        };
      }

      await prisma.$transaction(async (tx) => {
        const session = await tx.gameSession.create({
          data: {
            channelId,
            gameType,
            gameData: result.newState,
            participants: result.newState.participants,
          },
        });

        await tx.channelState.upsert({
          where: { channelId },
          update: {
            mode: 'GAME',
            activeGameSessionId: session.id,
          },
          create: {
            channelId,
            mode: 'GAME',
            activeGameSessionId: session.id,
          },
        });
      });

      await this.executeEffects(channelId, result.effects);

      logger.info(`Started ${gameType} game in channel ${channelId} hosted by ${hostId}`);
      
      return {
        success: true,
        message: `${game.config.displayName} started successfully!`,
        effects: result.effects,
      };
    } catch (error) {
      logger.error('Error starting game:', error);
      return {
        success: false,
        message: 'An error occurred while starting the game.',
      };
    }
  }

  async handleAction(channelId: string, action: GameAction): Promise<{ success: boolean; message?: string; effects?: GameEffect[] }> {
    try {
      const channelState = await prisma.channelState.findUnique({
        where: { channelId },
        include: { activeGameSession: true },
      });

      if (!channelState || channelState.mode !== 'GAME' || !channelState.activeGameSession?.isActive) {
        return {
          success: false,
          message: 'No active game in this channel.',
        };
      }

      const session = channelState.activeGameSession;
      const game = GameRegistry.create(session.gameType);
      if (!game) {
        logger.error(`Unknown game type in session: ${session.gameType}`);
        return {
          success: false,
          message: 'Game type error. Please restart the game.',
        };
      }

      const result = await game.processAction(session.gameData as GameState, action);
      
      await prisma.gameSession.update({
        where: { id: session.id },
        data: {
          gameData: result.newState,
          participants: result.newState.participants,
        },
      });

      // Return result FIRST so GameHandler can render before we process END_GAME
      const returnResult = {
        success: result.success,
        ...(result.message && { message: result.message }),
        effects: result.effects,
        newState: result.newState,
      };

      // Process effects AFTER returning (except END_GAME which we'll delay)
      console.log(`GameManager.startGame: Processing ${result.effects.length} effects`);
      const endGameEffects: any[] = [];
      for (const effect of result.effects) {
        console.log(`GameManager.startGame: Processing effect: ${effect.type}`);
        if (effect.type === 'SCHEDULE_AI_MOVE') {
          // Process AI move scheduling
          await this.executeEffects(channelId, [effect]);
        } else if (effect.type === 'END_GAME') {
          // Delay END_GAME processing to allow rendering first
          endGameEffects.push(effect);
        } else if (effect.type === 'UPDATE_PARTICIPANTS') {
          // Process participant updates
          await this.executeEffects(channelId, [effect]);
        } else if (effect.type === 'SCHEDULE_TIMEOUT') {
          // Process timeout scheduling
          await this.executeEffects(channelId, [effect]);
        }
        // Skip SEND_MESSAGE effects - handled by InteractionHandlers
      }

      // Process END_GAME effects after a short delay to allow rendering
      if (endGameEffects.length > 0) {
        setTimeout(async () => {
          for (const effect of endGameEffects) {
            await this.executeEffects(channelId, [effect]);
          }
        }, 100); // 100ms delay to allow render to complete
      }

      return returnResult;
    } catch (error) {
      logger.error('Error handling game action:', error);
      return {
        success: false,
        message: 'An error occurred while processing your action.',
      };
    }
  }

  async stopGame(channelId: string, reason: string = 'Game stopped'): Promise<{ success: boolean; message: string }> {
    try {
      const channelState = await prisma.channelState.findUnique({
        where: { channelId },
        include: { activeGameSession: true },
      });

      if (!channelState || channelState.mode !== 'GAME') {
        return {
          success: false,
          message: 'No active game in this channel.',
        };
      }

      await prisma.$transaction(async (tx) => {
        if (channelState.activeGameSession) {
          await tx.gameSession.update({
            where: { id: channelState.activeGameSession.id },
            data: {
              isActive: false,
              endedAt: new Date(),
            },
          });
        }

        await tx.channelState.update({
          where: { channelId },
          data: {
            mode: 'NORMAL',
            activeGameSessionId: null,
          },
        });
      });

      const timeoutKey = `${channelId}`;
      if (this.timeouts.has(timeoutKey)) {
        clearTimeout(this.timeouts.get(timeoutKey)!);
        this.timeouts.delete(timeoutKey);
      }

      logger.info(`Stopped game in channel ${channelId}: ${reason}`);
      
      return {
        success: true,
        message: `Game ended: ${reason}`,
      };
    } catch (error) {
      logger.error('Error stopping game:', error);
      return {
        success: false,
        message: 'An error occurred while stopping the game.',
      };
    }
  }

  async getChannelGameState(channelId: string): Promise<{ isInGameMode: boolean; gameType?: string; gameState?: GameState }> {
    try {
      const channelState = await prisma.channelState.findUnique({
        where: { channelId },
        include: { activeGameSession: true },
      });

      if (!channelState || channelState.mode !== 'GAME' || !channelState.activeGameSession?.isActive) {
        return { isInGameMode: false };
      }

      return {
        isInGameMode: true,
        gameType: channelState.activeGameSession.gameType,
        gameState: channelState.activeGameSession.gameData as GameState,
      };
    } catch (error) {
      logger.error('Error getting channel game state:', error);
      return { isInGameMode: false };
    }
  }

  private async executeEffects(channelId: string, effects: GameEffect[]): Promise<void> {
    for (const effect of effects) {
      try {
        switch (effect.type) {
          case 'SEND_MESSAGE':
            await this.handleSendMessageEffect(channelId, effect);
            break;
          
          case 'END_GAME':
            await this.stopGame(channelId, effect.reason);
            break;
          
          case 'SCHEDULE_TIMEOUT':
            this.scheduleGameTimeout(channelId, effect.duration);
            break;
          
          case 'UPDATE_PARTICIPANTS': {
            const channelState = await prisma.channelState.findUnique({
              where: { channelId },
              include: { activeGameSession: true },
            });
            
            if (channelState?.activeGameSession) {
              await prisma.gameSession.update({
                where: { id: channelState.activeGameSession.id },
                data: { participants: effect.participants },
              });
            }
            break;
          }

          case 'SCHEDULE_AI_MOVE': {
            const aiEffect = effect as { type: 'SCHEDULE_AI_MOVE'; delay?: number };
            const delay = aiEffect.delay || 1000;
            
            console.log(`GameManager: Scheduling AI move in ${delay}ms for channel ${channelId}`);
            setTimeout(async () => {
              try {
                await this.handleAiMove(channelId);
              } catch (error) {
                logger.error('Error handling AI move:', error);
              }
            }, delay);
            break;
          }
        }
      } catch (error) {
        logger.error(`Error executing effect ${effect.type}:`, error);
      }
    }
  }

  private async handleSendMessageEffect(channelId: string, effect: { type: 'SEND_MESSAGE'; content: string; isEmbed?: boolean }): Promise<void> {
    if (!this.discordClient) {
      logger.warn('GameManager: Cannot send message - Discord client not available');
      return;
    }

    try {
      const channel = await this.discordClient.channels.fetch(channelId);
      if (!channel?.isTextBased() || !('send' in channel)) {
        logger.warn(`GameManager: Channel ${channelId} is not a sendable text channel`);
        return;
      }

      let messageData: any = { content: effect.content };

      // Handle embed encoding for different games
      if (effect.content.startsWith('__HANGMAN_EMBED__')) {
        const embedData = JSON.parse(effect.content.replace('__HANGMAN_EMBED__', ''));
        messageData = {
          embeds: embedData.embeds,
          components: embedData.components,
        };
      } else if (effect.content.startsWith('__GEOGUESSER_EMBED__')) {
        const embedData = JSON.parse(effect.content.replace('__GEOGUESSER_EMBED__', ''));
        messageData = {
          embeds: embedData.embeds,
          components: embedData.components,
        };
      } else if (effect.content.startsWith('__TICTACTOE_EMBED__')) {
        const embedData = JSON.parse(effect.content.replace('__TICTACTOE_EMBED__', ''));
        messageData = {
          embeds: embedData.embeds,
          components: embedData.components,
        };
      }
      // Add more embed types as needed

      const message = await channel.send(messageData);
      
      // Store the message ID for future updates (AI moves, etc.)
      await this.storeGameMessageId(channelId, message.id);
      
      logger.debug(`GameManager: Sent game message ${message.id} to channel ${channelId}`);
    } catch (error) {
      logger.error('GameManager: Error sending message effect:', error);
    }
  }

  private scheduleGameTimeout(channelId: string, duration: number): void {
    const timeoutKey = `${channelId}`;
    
    if (this.timeouts.has(timeoutKey)) {
      clearTimeout(this.timeouts.get(timeoutKey)!);
    }

    const timeout = setTimeout(async () => {
      await this.stopGame(channelId, 'Game timed out due to inactivity');
      this.timeouts.delete(timeoutKey);
    }, duration);

    this.timeouts.set(timeoutKey, timeout);
    logger.debug(`Scheduled game timeout for channel ${channelId} in ${duration}ms`);
  }

  private async handleAiMove(channelId: string): Promise<void> {
    try {
      console.log('GameManager: Handling AI move for channel:', channelId);
      const channelState = await prisma.channelState.findUnique({
        where: { channelId },
        include: { activeGameSession: true },
      });

      if (!channelState || channelState.mode !== 'GAME' || !channelState.activeGameSession?.isActive) {
        logger.warn(`No active game for AI move in channel ${channelId}`);
        return;
      }

      const session = channelState.activeGameSession;
      let result: any;

      if (session.gameType === 'tictactoe') {
        const game = GameRegistry.create(session.gameType) as TicTacToeGame;
        if (!game) {
          logger.error(`Failed to create TicTacToe game instance for AI move`);
          return;
        }
        const gameState = session.gameData as any;
        result = await game.handleAiMove(gameState);
      } else if (session.gameType === 'geoguesser') {
        const game = GameRegistry.create(session.gameType) as GeoGuesserGame;
        if (!game) {
          logger.error(`Failed to create GeoGuesser game instance for location loading`);
          return;
        }
        const gameState = session.gameData as any;
        result = await game.handleLocationLoading(gameState);
      } else {
        logger.warn(`AI move requested for unsupported game type: ${session.gameType}`);
        return;
      }
      
      await prisma.gameSession.update({
        where: { id: session.id },
        data: {
          gameData: result.newState,
          participants: result.newState.participants,
        },
      });

      // Use callback to notify GameHandler about AI move completion
      if (this.gameUpdateCallback) {
        await this.gameUpdateCallback(channelId, result);
        console.log('GameManager: Notified GameHandler about AI move completion');
      } else {
        logger.warn('GameManager: No callback registered for game updates');
      }

      logger.debug(`Game processing completed for channel ${channelId}`);
    } catch (error) {
      logger.error('Error in handleAiMove:', error);
    }
  }

  async storeGameMessageId(channelId: string, messageId: string): Promise<void> {
    try {
      const channelState = await prisma.channelState.findUnique({
        where: { channelId },
        include: { activeGameSession: true },
      });

      if (channelState?.activeGameSession) {
        await prisma.gameSession.update({
          where: { id: channelState.activeGameSession.id },
          data: { lastMessageId: messageId },
        });
        console.log(`GameManager: Stored message ID ${messageId} for channel ${channelId}`);
      }
    } catch (error) {
      logger.error('Error storing game message ID:', error);
    }
  }

  async cleanupStaleGames(): Promise<void> {
    try {
      const staleChannels = await prisma.channelState.findMany({
        where: { mode: 'GAME' },
        include: { activeGameSession: true },
      });

      for (const channel of staleChannels) {
        logger.info(`Cleaning up stale game in channel ${channel.channelId}`);
        await this.stopGame(channel.channelId, 'Bot restart - game interrupted');
      }

      logger.info(`Cleaned up ${staleChannels.length} stale games`);
    } catch (error) {
      logger.error('Error cleaning up stale games:', error);
    }
  }
}