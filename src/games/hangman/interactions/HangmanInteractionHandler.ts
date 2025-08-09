/**
 * @fileoverview Hangman game interaction handler for Discord button interactions.
 * 
 * Handles Discord button interactions specific to the Hangman game including:
 * - Hint requests
 * - Difficulty changes (before game starts)
 * - Category changes (before game starts) 
 * - New game requests
 * - Game quit actions
 * 
 * This handler processes Discord button clicks and converts them into game actions
 * that can be processed by the HangmanGame class. It follows the interaction
 * handler pattern used throughout the game system for consistency.
 */

import { BaseInteractionHandler } from '../../common/BaseInteractionHandler.js';
import { logger } from '../../../utils/logger.js';

export class HangmanInteractionHandler implements BaseInteractionHandler {
  canHandle(customId: string): boolean {
    return customId.startsWith('hangman_');
  }

  async handleButtonInteraction(interaction: any): Promise<void> {
    try {
      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      if (interaction.customId === 'hangman_quit') {
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'QUIT',
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Failed to quit game.',
            ephemeral: true,
          });
          return;
        }

        // Acknowledge the quit action
        await interaction.reply({
          content: result.message || 'Game ended.',
          ephemeral: true,
        });

        // The GameManager will handle the END_GAME effect which stops the game
        // No need to render since the game is ending
        return;
      }

      if (interaction.customId === 'hangman_hint') {
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'HINT',
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'No more hints available!',
            ephemeral: true,
          });
          return;
        }

        // Defer the reply first since game updates might take time
        await interaction.deferUpdate();

        try {
          // Get updated game state after hint
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'hangman') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../../games/common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('hangman');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Update the Discord message with the hint
              await interaction.editReply(payload);
              
              // Store message ID for future updates
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
              
              console.log('HangmanInteractionHandler: Hint rendered successfully');
            }
          }
        } catch (error) {
          logger.error('Error rendering hint:', error);
          await interaction.followUp({
            content: 'Error updating game display.',
            ephemeral: true,
          });
        }
        return;
      }

      if (interaction.customId === 'hangman_difficulty') {
        // Cycle through difficulties
        const difficulties = ['EASY', 'MEDIUM', 'HARD'];
        const match = interaction.component.label?.match(/Difficulty: (\w+)/);
        const currentDifficulty = match ? match[1] : 'MEDIUM';
        const currentIndex = difficulties.indexOf(currentDifficulty);
        const nextIndex = (currentIndex + 1) % difficulties.length;
        const newDifficulty = difficulties[nextIndex];

        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'DIFFICULTY',
          payload: { difficulty: newDifficulty },
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Cannot change difficulty after game starts!',
            ephemeral: true,
          });
          return;
        }

        await interaction.deferUpdate();

        try {
          // Get updated game state after difficulty change
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'hangman') {
            const { GameRegistry } = await import('../../../games/common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('hangman');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              await interaction.editReply(payload);
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
            }
          }
        } catch (error) {
          logger.error('Error rendering difficulty change:', error);
        }
        return;
      }

      if (interaction.customId === 'hangman_category') {
        // Cycle through categories
        const categories = ['RANDOM', 'ANIMALS', 'MOVIES', 'COUNTRIES', 'FOOD', 'SPORTS', 'TECHNOLOGY'];
        const match = interaction.component.label?.match(/Category: (\w+)/);
        const currentCategory = match ? match[1] : 'RANDOM';
        const currentIndex = categories.indexOf(currentCategory);
        const nextIndex = (currentIndex + 1) % categories.length;
        const newCategory = categories[nextIndex];

        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'CATEGORY',
          payload: { category: newCategory },
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Cannot change category after game starts!',
            ephemeral: true,
          });
          return;
        }

        await interaction.deferUpdate();

        try {
          // Get updated game state after category change
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'hangman') {
            const { GameRegistry } = await import('../../../games/common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('hangman');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              await interaction.editReply(payload);
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
            }
          }
        } catch (error) {
          logger.error('Error rendering category change:', error);
        }
        return;
      }

      if (interaction.customId === 'hangman_new_game') {
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'NEW_GAME',
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Failed to start new game.',
            ephemeral: true,
          });
          return;
        }

        await interaction.deferUpdate();

        try {
          // Get updated game state after new game
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'hangman') {
            const { GameRegistry } = await import('../../../games/common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('hangman');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              await interaction.editReply(payload);
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
            }
          }
        } catch (error) {
          logger.error('Error rendering new game:', error);
        }
        return;
      }

      logger.warn(`Unknown Hangman interaction: ${interaction.customId}`);
      await interaction.reply({
        content: 'Unknown interaction.',
        ephemeral: true,
      });

    } catch (error) {
      logger.error('Error handling Hangman interaction:', error);
      
      const errorMessage = 'An error occurred while processing your action. Please try again.';
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

}