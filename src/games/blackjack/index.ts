/**
 * @fileoverview Blackjack game module entry point providing clean exports for external consumption.
 * 
 * This module aggregates and re-exports all public Blackjack game components including the main
 * game class, interaction handler, and TypeScript type definitions. Serves as the primary
 * integration point for the Discord bot system to access Blackjack functionality without
 * requiring knowledge of the internal module structure.
 * 
 * Exports:
 * - BlackjackGame: Main game logic and state management
 * - BlackjackInteractionHandler: Discord button interaction processing
 * - Type definitions: BlackjackState, BlackjackActionType, Card interfaces
 */
export { BlackjackGame } from './BlackjackGame.js';
export { BlackjackInteractionHandler } from './interactions/BlackjackInteractionHandler.js';
export type { BlackjackState, BlackjackActionType, Card } from './types.js';