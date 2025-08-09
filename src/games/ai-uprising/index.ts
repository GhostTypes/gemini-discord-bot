/**
 * @fileoverview Main export module for the AI Uprising game system.
 * 
 * AI Uprising is a comprehensive text-based RPG adventure game integrated into the Discord bot,
 * offering players an immersive cyberpunk experience with AI-driven storytelling, combat mechanics,
 * and exploration systems. This module serves as the primary entry point for the AI Uprising game
 * implementation, exporting the main game class that handles all game logic and player interactions.
 * 
 * Key Features:
 * - Complex RPG mechanics with character progression, equipment, and inventory systems
 * - AI-powered dynamic storytelling and world generation using Genkit flows
 * - Turn-based combat system with strategic elements and status effects
 * - Exploration mechanics with procedurally generated areas and encounters
 * - Quest system with branching storylines and player choices
 * - Persistent game state with save/load functionality
 * 
 * The AIUprisingGame class implements the GameInterface and integrates with the bot's
 * game management system, providing seamless Discord integration with rich embeds,
 * interactive controls, and real-time AI responses that adapt to player actions.
 * 
 * This game represents the most complex and feature-rich game module in the bot's
 * game system, showcasing advanced AI integration and sophisticated game mechanics.
 */

export { AIUprisingGame } from './AIUprisingGame.js';