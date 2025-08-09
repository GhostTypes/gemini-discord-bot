/**
 * @fileoverview Discord button interaction handler for Blackjack game actions.
 * 
 * This handler processes Discord button interactions specific to Blackjack gameplay,
 * translating Discord UI events into game actions that are processed by the GameManager.
 * Implements the BaseInteractionHandler interface to integrate with the bot's unified
 * interaction system and provides proper error handling and response management.
 * 
 * Key responsibilities:
 * - Parse Discord button custom IDs into Blackjack game actions
 * - Route actions through the GameManager for state updates
 * - Handle Discord interaction responses (defer, reply, edit)
 * - Render updated game state back to Discord embeds
 * - Provide graceful error handling for failed interactions
 * 
 * Supports all Blackjack actions: betting, hitting, standing, doubling down, and game management.
 */
import { BaseInteractionHandler } from '../../common/BaseInteractionHandler.js';
import { logger } from '../../../utils/logger.js';
import { BlackjackActionType } from '../types.js';

export class BlackjackInteractionHandler implements BaseInteractionHandler {
  canHandle(customId: string): boolean {
    return customId.startsWith('blackjack_');
  }

  async handleButtonInteraction(interaction: any): Promise<void> {
    try {
      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      // Parse button action from custom ID
      const action = this.parseButtonAction(interaction.customId);
      
      if (action.type === 'QUIT') {
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

        await interaction.reply({
          content: result.message || 'Game ended.',
          ephemeral: true,
        });

        return;
      }

      // Process the action through GameManager
      const result = await gameManager().handleAction(interaction.channelId, {
        userId: interaction.user.id,
        type: action.type,
        payload: action.payload,
        timestamp: new Date(),
      });

      if (!result.success) {
        await interaction.reply({
          content: result.message || 'Action failed',
          ephemeral: true,
        });
        return;
      }

      // Defer update for all non-quit actions
      await interaction.deferUpdate();

      try {
        // Get updated game state
        const gameState = await gameManager().getChannelGameState(interaction.channelId);
        
        if (gameState.gameState && gameState.gameType === 'blackjack') {
          const { GameRegistry } = await import('../../../games/common/GameRegistry.js');
          const game = GameRegistry.getGameInstance('blackjack');
          
          if (game) {
            const reply = game.render(gameState.gameState);
            
            const payload: any = {};
            if (reply.embeds) {payload.embeds = reply.embeds;}
            if (reply.components) {payload.components = reply.components;}
            if (reply.files) {payload.files = reply.files;}
            
            await interaction.editReply(payload);
            await gameManager().storeGameMessageId(interaction.channelId, interaction.message!.id);
            
            console.log(`BlackjackInteractionHandler: ${action.type} rendered successfully`);
          }
        }
      } catch (error) {
        logger.error('Error rendering blackjack action:', error);
        await interaction.followUp({
          content: 'Error updating game display.',
          ephemeral: true,
        });
      }
    } catch (error) {
      logger.error('Error handling Blackjack interaction:', error);
      
      const errorMessage = 'An error occurred while processing your action. Please try again.';
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  private parseButtonAction(customId: string): { type: BlackjackActionType; payload?: any } {
    // Remove 'blackjack_' prefix
    const actionPart = customId.replace('blackjack_', '');

    switch (actionPart) {
      case 'bet_10':
        return { type: 'BET', payload: { amount: 10 } };
      case 'bet_25':
        return { type: 'BET', payload: { amount: 25 } };
      case 'bet_50':
        return { type: 'BET', payload: { amount: 50 } };
      case 'bet_100':
        return { type: 'BET', payload: { amount: 100 } };
      case 'max_bet':
        return { type: 'MAX_BET' };
      case 'place_bet':
        return { type: 'PLACE_BET' };
      case 'hit':
        return { type: 'HIT' };
      case 'stand':
        return { type: 'STAND' };
      case 'double':
        return { type: 'DOUBLE_DOWN' };
      case 'new_game':
        return { type: 'NEW_GAME' };
      case 'quit':
        return { type: 'QUIT' };
      default:
        logger.warn(`Unknown blackjack action: ${actionPart}`);
        return { type: 'QUIT' }; // Default fallback
    }
  }
}