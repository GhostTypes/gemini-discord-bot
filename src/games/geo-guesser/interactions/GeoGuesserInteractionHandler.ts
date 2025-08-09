/**
 * @fileoverview Discord interaction handler for GeoGuesser game button interactions.
 * 
 * Handles all Discord button interactions specific to the GeoGuesser game,
 * including guess submissions, hint requests, round navigation, and game management.
 * Key responsibilities include:
 * - Guess processing and validation coordination
 * - Hint system management and display
 * - Round progression and game state updates
 * - Difficulty selection and settings management
 * - User feedback and response coordination
 * - Integration with GameManager for state persistence
 * - Error handling and graceful interaction management
 * 
 * Supported Interactions:
 * - Game actions: geoguesser_hint, geoguesser_skip, geoguesser_next_round
 * - Game management: geoguesser_quit for ending the game
 * - Settings: geoguesser_difficulty_* for difficulty adjustment
 * - Navigation: geoguesser_next_round for round progression
 * 
 * The handler ensures proper Discord interaction patterns with deferred
 * responses where appropriate and coordinates with the GameManager for
 * consistent game state management and location loading processing.
 */

import { BaseInteractionHandler } from '../../common/BaseInteractionHandler.js';
import { logger } from '../../../utils/logger.js';
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js';

export class GeoGuesserInteractionHandler implements BaseInteractionHandler {
  canHandle(customId: string): boolean {
    return customId.startsWith('geoguesser_');
  }

  async handleButtonInteraction(interaction: any): Promise<void> {
    try {
      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      // Handle quit action
      if (interaction.customId === 'geoguesser_quit') {
        await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'QUIT',
          timestamp: new Date(),
        });

        // Use render system to show game over state publicly
        await interaction.deferUpdate(); // Acknowledge the button press

        try {
          // Get updated game state
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'geoguesser') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('geoguesser');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Update the Discord message immediately
              await interaction.editReply(payload);
            }
          }
        } catch (error) {
          logger.error('Error rendering game end:', error);
          await interaction.followUp({
            content: 'Game ended.',
            ephemeral: false, // Make it public
          });
        }
        return;
      }

      // Handle hint request
      if (interaction.customId === 'geoguesser_hint') {
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'HINT',
          payload: { hintType: 'COUNTRY' },
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Cannot get hint right now.',
            ephemeral: true,
          });
          return;
        }

        // Use new render system to immediately display updated state
        await interaction.deferUpdate(); // Acknowledge the button press

        try {
          // Get updated game state
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'geoguesser') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('geoguesser');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Update the Discord message immediately
              await interaction.editReply(payload);
              
              // Store message ID for future updates
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
            }
          }
        } catch (error) {
          logger.error('Error rendering hint update:', error);
          await interaction.followUp({
            content: 'Hint added! Check the game above.',
            ephemeral: true,
          });
        }
        return;
      }

      // Handle skip round
      if (interaction.customId === 'geoguesser_skip') {
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'SKIP',
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Cannot skip round right now.',
            ephemeral: true,
          });
          return;
        }

        // Use new render system to immediately display skip result
        await interaction.deferUpdate(); // Acknowledge the button press

        try {
          // Get updated game state
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'geoguesser') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('geoguesser');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Update the Discord message immediately
              await interaction.editReply(payload);
              
              // Store message ID for future updates
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
            }
          }
        } catch (error) {
          logger.error('Error rendering skip result:', error);
          await interaction.followUp({
            content: 'Round skipped! Check the game above.',
            ephemeral: true,
          });
        }
        return;
      }

      // Handle next round
      if (interaction.customId === 'geoguesser_next_round') {
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'NEXT_ROUND',
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Cannot start next round right now.',
            ephemeral: true,
          });
          return;
        }

        // Use new render system to immediately display next round state
        await interaction.deferUpdate(); // Acknowledge the button press

        try {
          // Get updated game state
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'geoguesser') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('geoguesser');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Update the Discord message immediately
              await interaction.editReply(payload);
              
              // Store message ID for future updates
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
            }
          }
        } catch (error) {
          logger.error('Error rendering next round:', error);
          await interaction.followUp({
            content: 'Next round started! Check the game above.',
            ephemeral: true,
          });
        }
        return;
      }


      // Handle difficulty selection
      if (interaction.customId.startsWith('geoguesser_difficulty_')) {
        const difficulty = interaction.customId.split('_')[2].toUpperCase();
        
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'DIFFICULTY',
          payload: { difficulty },
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Cannot change difficulty right now.',
            ephemeral: true,
          });
          return;
        }

        // Use new render system to immediately display difficulty change
        await interaction.deferUpdate(); // Acknowledge the button press

        try {
          // Get updated game state
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'geoguesser') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('geoguesser');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Update the Discord message immediately
              await interaction.editReply(payload);
              
              // Store message ID for future updates
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
            }
          }
        } catch (error) {
          logger.error('Error rendering difficulty change:', error);
          await interaction.followUp({
            content: 'Difficulty changed! Check the game above.',
            ephemeral: true,
          });
        }
        return;
      }

      // Handle guess submission (via modal)
      if (interaction.customId === 'geoguesser_guess') {
        await this.showGuessModal(interaction);
        return;
      }

      // Unknown interaction
      await interaction.reply({
        content: 'Unknown game action.',
        ephemeral: true,
      });

    } catch (error) {
      logger.error('Error handling GeoGuesser button interaction:', error);
      
      const errorMessage = 'An error occurred processing your action.';
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: errorMessage,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    }
  }

  private async showGuessModal(interaction: any): Promise<void> {
    const modal = new ModalBuilder()
      .setCustomId('geoguesser_guess_modal')
      .setTitle('🌍 Make Your Guess');

    const guessInput = new TextInputBuilder()
      .setCustomId('guess')
      .setLabel('Where do you think this location is?')
      .setStyle(TextInputStyle.Short)
      .setPlaceholder('e.g., Paris, France or Tokyo, Japan')
      .setRequired(true)
      .setMaxLength(100);

    const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(guessInput);
    modal.addComponents(actionRow);

    await interaction.showModal(modal);
  }

  async handleModalSubmit(interaction: any): Promise<void> {
    if (interaction.customId !== 'geoguesser_guess_modal') {
      return;
    }

    try {
      const guess = interaction.fields.getTextInputValue('guess');
      
      if (!guess || guess.trim().length === 0) {
        await interaction.reply({
          content: 'Please provide a valid guess.',
          ephemeral: true,
        });
        return;
      }

      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      // Defer the reply since guess processing can take time
      await interaction.deferReply();

      const result = await gameManager().handleAction(interaction.channelId, {
        userId: interaction.user.id,
        type: 'GUESS',
        payload: { guess: guess.trim() },
        timestamp: new Date(),
      });

      if (!result.success) {
        await interaction.editReply({
          content: result.message || 'Failed to process your guess. Please try again.',
        });
        return;
      }

      // Use new render system to display guess result
      try {
        // Get updated game state after guess
        const gameState = await gameManager().getChannelGameState(interaction.channelId);
        
        if (gameState.gameState && gameState.gameType === 'geoguesser') {
          // Get game instance and render the updated state
          const { GameRegistry } = await import('../../common/GameRegistry.js');
          const game = GameRegistry.getGameInstance('geoguesser');
          
          if (game) {
            const reply = game.render(gameState.gameState);
            
            // Find the game message to update
            const gameMessage = interaction.message || await this.findGameMessage(interaction);
            
            if (gameMessage) {
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Update the game message
              await gameMessage.edit(payload);
              
              // Store message ID for future updates
              await gameManager().storeGameMessageId(interaction.channelId, gameMessage.id);
              
              await interaction.editReply({
                content: '✅ Your guess has been processed! Check the game above for results.',
              });
            } else {
              // Fallback: send as reply if can't find game message
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              await interaction.editReply(payload);
            }
          }
        }
      } catch (error) {
        logger.error('Error rendering guess result:', error);
        await interaction.editReply({
          content: 'Your guess was processed, but there was an error updating the display.',
        });
      }

    } catch (error) {
      logger.error('Error handling GeoGuesser guess modal:', error);
      
      const errorMessage = 'An error occurred processing your guess.';
      
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: errorMessage,
        });
      } else {
        await interaction.reply({
          content: errorMessage,
          ephemeral: true,
        });
      }
    }
  }


  private async findGameMessage(interaction: any): Promise<any> {
    try {
      // Try to find the most recent game message in the channel
      const messages = await interaction.channel.messages.fetch({ limit: 10 });
      
      for (const message of messages.values()) {
        if (message.embeds.length > 0) {
          const embed = message.embeds[0];
          if (embed.title && embed.title.includes('GeoGuesser')) {
            return message;
          }
        }
      }
      
      return null;
    } catch (error) {
      logger.warn('Could not find game message:', error);
      return null;
    }
  }

  // Handle message-based guess input (when users type guesses in chat)
  async handleMessageGuess(message: any, guess: string): Promise<boolean> {
    try {
      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      const result = await gameManager().handleAction(message.channel.id, {
        userId: message.author.id,
        type: 'GUESS',
        payload: { guess: guess.trim() },
        timestamp: new Date(),
      });

      if (!result.success) {
        await message.reply(result.message || 'Invalid guess. Make sure you have an active game running!');
        return false;
      }

      // Let GameManager handle the response through normal game flow
      // The result will be automatically rendered through GameHandler

      return true;

    } catch (error) {
      logger.error('Error handling message-based guess:', error);
      await message.reply('An error occurred processing your guess.');
      return false;
    }
  }
}