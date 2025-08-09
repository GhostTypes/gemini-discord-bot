/**
 * @fileoverview Game message handler for text-based game interactions.
 * 
 * Processes Discord messages when channels are in game mode, handling
 * common game commands and routing game-specific actions. Key features:
 * - Universal game commands (quit, exit, stop, hint, help)
 * - Game action routing to GameManager for specialized processing
 * - Natural language command interpretation for user-friendly gameplay
 * - Integration with game registry for dynamic game support
 * - Error handling and user feedback for game interactions
 * 
 * Common Game Commands:
 * - quit/exit/stop: End current game session
 * - hint/clue: Request gameplay hints from AI
 * - help: Display game-specific help information
 * 
 * The handler works in conjunction with GameManager to provide a seamless
 * text-based gaming experience within Discord channels, supporting multiple
 * concurrent games and game-specific interaction patterns.
 */

import { Message } from 'discord.js';
import { gameManager } from '../flows/gameFlow.js';
import { GameRegistry } from '../games/common/GameRegistry.js';
import { logger } from '../utils/logger.js';
import { DiscordReply, RenderStrategy } from '../types/discord.js';

export class GameHandler {

  async handleGameMessage(message: Message): Promise<void> {
    const content = message.content.toLowerCase().trim();
    const userId = message.author.id;
    const channelId = message.channelId;

    logger.debug('Processing game message', { 
      content: content.substring(0, 50), 
      userId, 
      channelId 
    });

    // Check game type to handle appropriately
    const gameState = await gameManager().getChannelGameState(channelId);
    
    if (!gameState.isInGameMode || !gameState.gameType) {
      return;
    }

    if (content === 'quit' || content === 'exit' || content === 'stop') {
      const result = await gameManager().stopGame(channelId, `Game ended by ${message.author.username}`);
      await message.reply(result.message);
      return;
    }

    if (content === 'hint' || content === 'clue') {
      const result = await gameManager().handleAction(channelId, {
        userId,
        type: 'HINT',
        payload: {},
        timestamp: new Date(),
      });
      
      await this.renderGameResponse(message, result);
      return;
    }

    // Handle Hangman single letter guessing
    if (gameState.gameType === 'hangman') {
      const upperContent = content.toUpperCase();
      if (/^[A-Z]$/.test(upperContent)) {
        const result = await gameManager().handleAction(channelId, {
          userId,
          type: 'GUESS_LETTER',
          payload: { letter: upperContent },
          timestamp: new Date(),
        });
        
        await this.renderGameResponse(message, result);
        return;
      }
    }

    // Handle Blackjack betting amounts
    if (gameState.gameState && gameState.gameType === 'blackjack') {
      const betAmount = parseInt(content);
      if (!isNaN(betAmount) && betAmount > 0) {
        const result = await gameManager().handleAction(channelId, {
          userId,
          type: 'BET',
          payload: { amount: betAmount },
          timestamp: new Date(),
        });
        
        await this.renderGameResponse(message, result);
        return;
      }
    }

    // For all other games, use the standard action handling and render flow
    const actionType = gameState.gameType === 'geoguesser' ? 'GUESS' as const : 'SUBMIT' as const;
    
    const result = await gameManager().handleAction(channelId, {
      userId,
      type: actionType,
      payload: { guess: message.content },
      timestamp: new Date(),
    });

    await this.renderGameResponse(message, result);
  }

  async handleGameStart(message: Message, _cleanMessage: string, entities?: { gameType?: string | undefined; gameAction?: string | undefined; payload?: any }): Promise<void> {
    try {
      const gameType = entities?.gameType || 'wordscramble';
      
      if (!GameRegistry.exists(gameType)) {
        await message.reply(`Unknown game type: ${gameType}. Available games: ${GameRegistry.list().map(g => g.name).join(', ')}`);
        return;
      }

      const result = await gameManager().startGame(message.channelId, gameType, message.author.id);
      
      await message.reply(result.message);
      
      // Handle game start display using new render system for migrated games
      if (gameType === 'tictactoe' || gameType === 'wordscramble' || gameType === 'geoguesser' || gameType === 'aiuprising' || gameType === 'hangman' || gameType === 'blackjack') {
        const gameState = await gameManager().getChannelGameState(message.channelId);
        if (gameState.gameState) {
          const game = GameRegistry.getGameInstance(gameType);
          if (game) {
            const reply = game.render(gameState.gameState);
            // For game start, always use 'send' strategy
            const startReply = { ...reply, strategy: 'send' as RenderStrategy };
            await this.executeRenderStrategy(message, startReply);
          }
        }
      }
    } catch (error) {
      logger.error('Error starting game:', error);
      await message.reply('Sorry, I encountered an error starting the game.');
    }
  }

  async handleGameHelp(message: Message): Promise<void> {
    try {
      const games = GameRegistry.list();
      const gameList = games
        .map(game => `**${game.displayName}** (\`${game.name}\`)\n${game.description}`)
        .join('\n\n');
      
      await message.reply(`🎮 **Available Games:**\n\n${gameList}\n\nSay something like "Let's play word scramble!" to start a game!`);
    } catch (error) {
      logger.error('Error showing game help:', error);
      await message.reply('Sorry, I encountered an error showing the game list.');
    }
  }

  private async renderGameResponse(message: Message, result: any, isAiMove = false): Promise<void> {
    const gameState = await gameManager().getChannelGameState(message.channelId);
    const gameType = gameState.gameType;
    
    if (!gameType) {return;}
    
    
    // Use new render system for migrated games
    if (gameType === 'tictactoe' || gameType === 'wordscramble' || gameType === 'geoguesser' || gameType === 'aiuprising' || gameType === 'hangman' || gameType === 'blackjack') {
      const game = GameRegistry.getGameInstance(gameType);
      if (game && result.success && result.newState) {
        const reply = game.render(result.newState);
        console.log(`GameHandler: ${gameType} render strategy: ${reply.strategy}`);
        
        // For AI moves, always use 'edit' strategy to update the existing message
        if (isAiMove) {
          reply.strategy = 'edit';
          console.log(`GameHandler: Overriding strategy to 'edit' for AI move`);
        }
        
        await this.executeRenderStrategy(message, reply);
        return;
      }
    }
  }

  private async executeRenderStrategy(message: Message, reply: DiscordReply): Promise<void> {
    const payload: any = {};
    if (reply.content !== undefined) {payload.content = reply.content;}
    if (reply.embeds !== undefined) {payload.embeds = reply.embeds;}
    if (reply.components !== undefined) {payload.components = reply.components;}
    if (reply.files !== undefined) {payload.files = reply.files;}

    let sentMessage;
    
    switch (reply.strategy) {
      case 'reply':
        sentMessage = await message.reply(payload);
        break;
      case 'send':
        if ('send' in message.channel) {
          sentMessage = await message.channel.send(payload);
        }
        break;
      case 'edit': {
        // Get stored message and edit it
        const storedMessageId = await this.getStoredMessageId(message.channelId);
        if (storedMessageId) {
          try {
            const gameMessage = await message.channel.messages.fetch(storedMessageId);
            await gameMessage.edit(payload);
          } catch (error) {
            // Fallback to send if edit fails
            if ('send' in message.channel) {
              sentMessage = await message.channel.send(payload);
            }
          }
        } else {
          if ('send' in message.channel) {
            sentMessage = await message.channel.send(payload);
          }
        }
        break;
      }
      case 'delete-create': {
        // Delete old message and create new one
        const oldMessageId = await this.getStoredMessageId(message.channelId);
        if (oldMessageId) {
          try {
            const oldMessage = await message.channel.messages.fetch(oldMessageId);
            await oldMessage.delete();
          } catch (error) {
            logger.debug('Could not delete old message:', error);
          }
        }
        if ('send' in message.channel) {
          sentMessage = await message.channel.send(payload);
        }
        break;
      }
    }
    
    if (sentMessage) {
      await gameManager().storeGameMessageId(message.channelId, sentMessage.id);
    }
  }

  private async getStoredMessageId(channelId: string): Promise<string | null> {
    try {
      const { prisma } = await import('../persistence/client.js');
      const channelState = await prisma.channelState.findUnique({
        where: { channelId },
        include: { activeGameSession: true },
      });
      return channelState?.activeGameSession?.lastMessageId || null;
    } catch (error) {
      logger.error('Error getting stored message ID:', error);
      return null;
    }
  }


  async handleAiMoveCallback(channelId: string, result: any): Promise<void> {
    // This method is called by GameManager when an AI move completes
    // We need to create a mock message context to use our render system
    try {
      const { prisma } = await import('../persistence/client.js');
      const channelState = await prisma.channelState.findUnique({
        where: { channelId },
        include: { activeGameSession: true },
      });

      if (!channelState?.activeGameSession?.lastMessageId) {
        logger.warn(`No message ID stored for channel ${channelId} - cannot update Discord`);
        return;
      }

      // Get the Discord channel and last message
      if (!this.discordClient) {
        logger.warn('No Discord client available for AI move update');
        return;
      }

      const channel = await this.discordClient.channels.fetch(channelId);
      if (!channel?.isTextBased()) {
        logger.warn(`Channel ${channelId} is not text-based`);
        return;
      }

      const lastMessage = await channel.messages.fetch(channelState.activeGameSession.lastMessageId);
      
      // Use the actual Discord message object - it already has all the methods we need
      // We just need to ensure it has the channelId property
      (lastMessage as any).channelId = channelId;

      // Use our render system to update the Discord message
      console.log('GameHandler: About to call renderGameResponse for AI move');
      await this.renderGameResponse(lastMessage as any, result, true); // true indicates AI move
      
      logger.debug(`AI move rendered successfully for channel ${channelId}`);
    } catch (error) {
      logger.error('Error in handleAiMoveCallback:', error);
    }
  }


  setDiscordClient(client: any) {
    this.discordClient = client;
  }

  private discordClient?: any;
}