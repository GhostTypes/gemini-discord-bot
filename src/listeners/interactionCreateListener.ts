/**
 * @fileoverview Discord interaction event handler for slash commands and button interactions.
 * 
 * Handles all Discord interaction events including slash commands, button clicks,
 * and other component interactions. This handler serves as the entry point for:
 * - Slash command execution (/tts, /game, /whitelist)
 * - Game button interactions (TicTacToe moves, AI Uprising choices)
 * - Modal form submissions and select menu interactions
 * 
 * The handler delegates to CommandService which manages the routing of different
 * interaction types to their appropriate handlers, ensuring proper error handling
 * and response management for all Discord interaction patterns.
 */

import { Interaction } from 'discord.js';
import { CommandService } from '../services/CommandService.js';

export async function handleInteractionCreate(interaction: Interaction, commandService: CommandService): Promise<void> {
  await commandService.handleInteraction(interaction);
}