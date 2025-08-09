/**
 * @fileoverview Base interface for Discord interaction handlers in the game system.
 * 
 * Defines the contract for handling Discord button interactions specific to
 * different games. Each game can implement this interface to handle its
 * unique interaction patterns while maintaining consistency with the bot's
 * interaction management system.
 * 
 * Required Methods:
 * - canHandle: Determine if this handler can process a specific interaction
 * - handleButtonInteraction: Process Discord button interactions for the game
 * 
 * Integration with CommandService:
 * Handlers implementing this interface are automatically registered with
 * the CommandService and receive appropriate interaction events based on
 * their canHandle logic, enabling seamless game-specific interaction routing.
 */

import { Interaction } from 'discord.js';

export interface BaseInteractionHandler {
  handleButtonInteraction(interaction: Interaction): Promise<void>;
  canHandle(customId: string): boolean;
}