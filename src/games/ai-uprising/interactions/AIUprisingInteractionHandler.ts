/**
 * @fileoverview Discord interaction handler for AI Uprising game button interactions.
 * 
 * Handles all Discord button interactions specific to the AI Uprising RPG game,
 * including combat choices, story decisions, and game management actions.
 * Key responsibilities include:
 * - Button interaction routing based on custom ID patterns
 * - Game action processing through GameManager integration
 * - User feedback and response coordination
 * - Error handling and graceful degradation
 * - Integration with AI Uprising game state and flows
 * 
 * Supported Interactions:
 * - Combat actions: Attack, defend, use items, special abilities
 * - Story choices: Dialogue options, exploration decisions
 * - Game management: Quit, pause, help actions
 * - Equipment actions: Use items, equip weapons/armor
 * 
 * The handler ensures proper Discord interaction management with deferred
 * responses to prevent timeouts during AI processing and coordinates with
 * the GameManager for consistent state management.
 */

import { BaseInteractionHandler } from '../../common/BaseInteractionHandler.js';
import { logger } from '../../../utils/logger.js';

export class AIUprisingInteractionHandler implements BaseInteractionHandler {
  canHandle(customId: string): boolean {
    return customId.startsWith('aiuprising_');
  }

  async handleButtonInteraction(interaction: any): Promise<void> {
    try {
      const { gameManager } = await import('../../../flows/gameFlow.js');
      
      if (interaction.customId === 'aiuprising_quit') {
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
      
      // Defer the interaction immediately to prevent timeout
      await interaction.deferUpdate();
      
      // Show loading state with current action
      const actionDescription = this.getActionDescription(interaction.customId);
      await this.showLoadingState(interaction, actionDescription);
      
      // Handle all other AI Uprising actions
      const result = await gameManager().handleAction(interaction.channelId, {
        userId: interaction.user.id,
        type: 'SUBMIT',
        payload: { customId: interaction.customId, currentAction: actionDescription },
        timestamp: new Date(),
      });
      
      if (result.success) {
        // Use new render system to immediately display player's move
        try {
          // Get updated game state after player's move
          const gameState = await gameManager().getChannelGameState(interaction.channelId);
          
          if (gameState.gameState && gameState.gameType === 'aiuprising') {
            // Get game instance and render the updated state
            const { GameRegistry } = await import('../../common/GameRegistry.js');
            const game = GameRegistry.getGameInstance('aiuprising');
            
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
      logger.error('Error handling AI Uprising button interaction:', error);
      
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({
          content: 'An error occurred processing your action.',
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: 'An error occurred processing your action.',
          ephemeral: true,
        });
      }
    }
  }

  private getActionDescription(customId: string): string {
    const actionMap: Record<string, string> = {
      'aiuprising_start_adventure': '🚀 Starting your adventure...',
      'aiuprising_move_north': '🧭 Moving north...',
      'aiuprising_move_south': '🧭 Moving south...',
      'aiuprising_move_east': '🧭 Moving east...',
      'aiuprising_move_west': '🧭 Moving west...',
      'aiuprising_move_up': '🧭 Moving up...',
      'aiuprising_move_down': '🧭 Moving down...',
      'aiuprising_search': '🔍 Searching the area...',
      'aiuprising_inventory': '📦 Opening inventory...',
      'aiuprising_rest': '😴 Resting...',
      'aiuprising_attack': '⚔️ Attacking enemy...',
      'aiuprising_defend': '🛡️ Defending...',
      'aiuprising_use_item': '💊 Using item...',
      'aiuprising_flee': '🏃 Attempting to flee...',
      'aiuprising_back_to_exploring': '↩️ Going back...',
    };

    // Handle dynamic actions
    if (customId.startsWith('aiuprising_use_')) {
      return '💊 Using item...';
    }
    if (customId.startsWith('aiuprising_story_choice_')) {
      return '📖 Making story choice...';
    }

    return actionMap[customId] || '⏳ Processing action...';
  }

  private async showLoadingState(interaction: any, actionDescription: string): Promise<void> {
    try {
      // Create a simple loading embed to show immediately
      const loadingEmbed = {
        title: '⏳ AI Uprising',
        description: 'Processing your action...',
        color: 0x3498db, // Blue color for loading
        fields: [
          {
            name: '🎮 Current Action',
            value: actionDescription,
            inline: false
          }
        ],
        footer: {
          text: 'Please wait while the AI generates the response...'
        }
      };

      await interaction.editReply({
        embeds: [loadingEmbed],
        components: [] // Remove buttons during loading
      });
    } catch (error) {
      logger.error('Error showing loading state:', error);
      // Don't throw - continue with the action processing
    }
  }
}