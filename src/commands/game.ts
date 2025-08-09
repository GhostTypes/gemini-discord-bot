/**
 * @fileoverview Discord slash command for game management and interaction.
 * 
 * Provides comprehensive game control through Discord slash commands with subcommands for:
 * - Starting new games with configurable difficulty levels and game type selection
 * - Stopping active games with proper cleanup and state management
 * - Checking game status and displaying current game state information
 * - Listing all available games with descriptions and instructions
 * 
 * Features channel whitelisting validation, proper error handling, and supports
 * multiple game types including TicTacToe and AI Uprising with specialized embed
 * handling for rich Discord presentations.
 */

import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { gameManager } from '../flows/gameFlow.js';
import { GameRegistry } from '../games/common/GameRegistry.js';
import { WhitelistService, WhitelistType } from '../services/WhitelistService.js';
import { logger } from '../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('game')
  .setDescription('Game commands')
  .addSubcommand(subcommand =>
    subcommand
      .setName('start')
      .setDescription('Start a new game')
      .addStringOption(option =>
        option
          .setName('type')
          .setDescription('Type of game to start')
          .setRequired(true)
          .addChoices(
            ...GameRegistry.list().map(game => ({
              name: game.displayName,
              value: game.name,
            }))
          )
      )
      .addStringOption(option =>
        option
          .setName('difficulty')
          .setDescription('Difficulty level (for TicTacToe)')
          .setRequired(false)
          .addChoices(
            { name: 'Easy', value: 'EASY' },
            { name: 'Medium', value: 'MEDIUM' },
            { name: 'Hard', value: 'HARD' }
          )
      )
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('stop')
      .setDescription('Stop the current game')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('status')
      .setDescription('Check current game status')
  )
  .addSubcommand(subcommand =>
    subcommand
      .setName('list')
      .setDescription('List available games')
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const subcommand = interaction.options.getSubcommand();
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  // Check channel whitelist first
  if (!interaction.channel?.isDMBased()) {
    const whitelistService = WhitelistService.getInstance();
    const isWhitelisted = await whitelistService.isChannelWhitelisted(channelId, WhitelistType.BOT);
    if (!isWhitelisted) {
      await interaction.reply({
        content: 'Games are not enabled in this channel.',
        ephemeral: true,
      });
      return;
    }
  }

  try {
    switch (subcommand) {
      case 'start': {
        const gameType = interaction.options.getString('type', true);
        const difficulty = interaction.options.getString('difficulty');
        
        await interaction.deferReply();
        
        const result = await gameManager().startGame(channelId, gameType, userId, difficulty ? { difficulty } : {});
        
        await interaction.editReply({
          content: result.message,
        });
        
        // Display the initial game state using the new render system
        if (result.success && (gameType === 'tictactoe' || gameType === 'wordscramble' || gameType === 'geoguesser' || gameType === 'aiuprising' || gameType === 'hangman' || gameType === 'blackjack')) {
          try {
            const gameState = await gameManager().getChannelGameState(channelId);
            if (gameState.gameState) {
              const { GameRegistry } = await import('../games/common/GameRegistry.js');
              const game = GameRegistry.getGameInstance(gameType);
              if (game) {
                const reply = game.render(gameState.gameState);
                
                // Build payload with only defined properties
                const gamePayload: any = {};
                if (reply.embeds) {gamePayload.embeds = reply.embeds;}
                if (reply.components) {gamePayload.components = reply.components;}
                if (reply.files) {gamePayload.files = reply.files;}
                
                // For slash commands, always use followUp to send the game board
                const gameMessage = await interaction.followUp(gamePayload);
                
                // Store the message ID for future updates
                await gameManager().storeGameMessageId(channelId, gameMessage.id);
              }
            }
          } catch (error) {
            console.error('Error displaying initial game state:', error);
          }
        }
        break;
      }

      case 'stop': {
        const result = await gameManager().stopGame(channelId, 'Stopped by user command');
        
        await interaction.reply({
          content: result.message,
          ephemeral: !result.success,
        });
        break;
      }

      case 'status': {
        const state = await gameManager().getChannelGameState(channelId);
        
        if (!state.isInGameMode) {
          await interaction.reply({
            content: 'No game is currently active in this channel.',
            ephemeral: true,
          });
        } else {
          const game = GameRegistry.create(state.gameType!);
          const display = game ? game.getDisplayState(state.gameState!) : 'Game state unavailable';
          
          await interaction.reply({
            content: display,
            ephemeral: true,
          });
        }
        break;
      }

      case 'list': {
        const games = GameRegistry.list();
        const gameList = games
          .map(game => `**${game.displayName}** (\`${game.name}\`)\n${game.description}`)
          .join('\n\n');
        
        await interaction.reply({
          content: `🎮 **Available Games:**\n\n${gameList}\n\nUse \`/game start <type>\` to start a game!`,
          ephemeral: true,
        });
        break;
      }

      default:
        await interaction.reply({
          content: 'Unknown subcommand.',
          ephemeral: true,
        });
    }
  } catch (error) {
    logger.error('Error in game command:', error);
    
    const errorMessage = 'An error occurred while processing the game command.';
    
    if (interaction.deferred) {
      await interaction.editReply(errorMessage);
    } else {
      await interaction.reply({
        content: errorMessage,
        ephemeral: true,
      });
    }
  }
}