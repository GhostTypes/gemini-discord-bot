/**
 * @fileoverview Discord interaction handler for TicTacToe game button interactions.
 * 
 * Handles all Discord button interactions specific to the TicTacToe game,
 * including game moves, difficulty changes, and game management actions.
 * Key responsibilities include:
 * - Move processing for the 3x3 game grid
 * - Game management actions (quit, difficulty toggle)
 * - User feedback and response coordination
 * - Integration with GameManager for state updates
 * - Error handling and graceful interaction management
 * 
 * Supported Interactions:
 * - Grid moves: ttt_move_X_Y for board position selection
 * - Game management: ttt_quit for ending the game
 * - Settings: ttt_difficulty for difficulty adjustment
 * 
 * The handler ensures proper Discord interaction patterns with deferred
 * responses where appropriate and coordinates with the GameManager for
 * consistent game state management and AI move processing.
 */

import { BaseInteractionHandler } from '../../common/BaseInteractionHandler.js';
import { logger } from '../../../utils/logger.js';

export class TicTacToeInteractionHandler implements BaseInteractionHandler {
  canHandle(customId: string): boolean {
    return customId.startsWith('ttt_');
  }

  async handleButtonInteraction(interaction: any): Promise<void> {
    try {
      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      if (interaction.customId === 'ttt_quit') {
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

      if (interaction.customId === 'ttt_difficulty') {
        // Handle difficulty toggle - for now just show message
        await interaction.reply({
          content: 'Difficulty can only be changed before the first move!',
          ephemeral: true,
        });
        return;
      }

      // Handle grid position moves (ttt_0_0, ttt_1_2, etc.)
      const parts = interaction.customId.split('_');
      if (parts.length === 3 && parts[0] === 'ttt') {
        const row = parseInt(parts[1]);
        const col = parseInt(parts[2]);

        if (isNaN(row) || isNaN(col) || row < 0 || row > 2 || col < 0 || col > 2) {
          await interaction.reply({
            content: 'Invalid move position.',
            ephemeral: true,
          });
          return;
        }

        const result = await gameManager().handleAction(interaction.channelId, {
          userId: interaction.user.id,
          type: 'SUBMIT',
          payload: { row, col },
          timestamp: new Date(),
        });

        if (!result.success) {
          await interaction.reply({
            content: result.message || 'Invalid move.',
            ephemeral: true,
          });
          return;
        }

        // Use new render system to immediately display player's move
        await interaction.deferUpdate(); // Acknowledge the button press
        
        try {
          // Get updated game state after player's move
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'tictactoe') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('tictactoe');
            
            if (game) {
              const reply = game.render(gameState.gameState);
              
              // Build payload for Discord
              const payload: any = {};
              if (reply.embeds) {payload.embeds = reply.embeds;}
              if (reply.components) {payload.components = reply.components;}
              if (reply.files) {payload.files = reply.files;}
              
              // Update the Discord message immediately with player's move
              await interaction.editReply(payload);
              
              // Store message ID for AI move updates
              await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
              
              console.log('TicTacToeInteractionHandler: Player move rendered immediately');
            }
          }
        } catch (error) {
          logger.error('Error rendering player move:', error);
          await interaction.followUp({
            content: 'Error updating game board.',
            ephemeral: true,
          });
        }
      }
    } catch (error) {
      logger.error('Error handling TicTacToe button interaction:', error);
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'An error occurred processing your move.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'An error occurred processing your move.',
          ephemeral: true,
        });
      }
    }
  }
}