/**
 * @fileoverview Abstract base class defining the game interface for all Discord bot games.
 * 
 * Provides the fundamental contract that all games must implement to integrate
 * with the bot's game management system. Defines core game lifecycle methods
 * and state management requirements for consistent game behavior.
 * 
 * Required Implementation Methods:
 * - startGame: Initialize game state and return startup effects
 * - processAction: Handle player actions and update game state
 * - getDisplayState: Generate human-readable game state representations
 * - validateAction: Validate player actions against current game state
 * - checkEndConditions: Determine if game should end and identify winners
 * - getAvailableActions: List valid actions for current game state
 * - render: Generate Discord presentation for current game state
 * 
 * All games extending this base class gain automatic integration with:
 * - GameManager for state persistence and lifecycle management
 * - Discord interaction systems for button and command handling
 * - GameRegistry for dynamic game discovery and instantiation
 * - Timeout management and automatic cleanup systems
 */

import { GameState, GameAction, GameActionResult, GameConfig } from './types.js';
import { DiscordReply } from '../../types/discord.js';

export abstract class BaseGame {
  abstract config: GameConfig;

  abstract startGame(options: { hostId: string; channelId: string; [key: string]: any }): GameActionResult;

  abstract processAction(currentState: GameState, action: GameAction): GameActionResult | Promise<GameActionResult>;

  abstract getDisplayState(currentState: GameState): string;

  abstract validateAction(currentState: GameState, action: GameAction): boolean;

  abstract checkEndConditions(currentState: GameState): { shouldEnd: boolean; winnerId?: string; reason?: string };

  abstract getAvailableActions(currentState: GameState): string[];

  abstract render(currentState: GameState): DiscordReply;
}