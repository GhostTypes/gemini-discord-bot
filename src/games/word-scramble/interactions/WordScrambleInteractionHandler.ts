/**
 * @fileoverview Discord interaction handler for WordScramble game button interactions.
 * 
 * Handles Discord button interactions specific to the WordScramble game,
 * including hint requests and game quit actions. Key responsibilities include:
 * - Processing hint button clicks to provide clues
 * - Handling quit button clicks to end games gracefully  
 * - Integration with GameManager for state updates
 * - Error handling and user feedback
 * 
 * Supported Interactions:
 * - ws_hint: Request a hint (if available)
 * - ws_quit: End the current game
 * 
 * Note: WordScramble word guesses are handled via text chat by GameHandler,
 * not through button interactions.
 */

import { BaseInteractionHandler } from '../../common/BaseInteractionHandler.js';
import { logger } from '../../../utils/logger.js';

export class WordScrambleInteractionHandler implements BaseInteractionHandler {
  canHandle(customId: string): boolean {
    return customId.startsWith('ws_');
  }

  async handleButtonInteraction(interaction: any): Promise<void> {
    try {
      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      if (interaction.customId === 'ws_quit') {
        // Handle quit action
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'QUIT',
          timestamp: new Date(),
        });

        await interaction.reply({
          content: result.message || 'Game ended.',
          ephemeral: true,
        });
        return;
      }

      if (interaction.customId === 'ws_hint') {
        // Handle hint request
        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'HINT',
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'No hints available.',
            ephemeral: true,
          });
          return;
        }

        // Use render system to display updated game state with hint
        await interaction.deferReply();
        
        try {
          // Get updated game state after hint
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'wordscramble') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('wordscramble');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Send new message with updated game state (WordScramble uses 'send' strategy)
              await interaction.editReply(payload);
              
              console.log('WordScrambleInteractionHandler: Hint processed and game state updated');
            }
          }
        } catch (error) {
          logger.error('Error rendering hint response:', error);
          await interaction.followUp({
            content: 'Error processing hint.',
            ephemeral: true,
          });
        }
        return;
      }

      // Unknown interaction
      await interaction.reply({
        content: 'Unknown interaction.',
        ephemeral: true,
      });

    } catch (error) {
      logger.error('Error handling WordScramble button interaction:', error);
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'An error occurred processing your request.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'An error occurred processing your request.',
          ephemeral: true,
        });
      }
    }
  }
}