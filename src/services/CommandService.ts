/**
 * @fileoverview Discord slash command registration and interaction handling service.
 * 
 * Manages the complete lifecycle of Discord slash commands and game interactions.
 * Key responsibilities include:
 * - Slash command registration with Discord API
 * - Command execution routing and error handling
 * - Game interaction handling through specialized interaction handlers
 * - Button and component interaction processing for games
 * - Command validation and user permission checks
 * 
 * Supported Commands:
 * - /tts: Text-to-speech audio generation
 * - /whitelist: Channel whitelist management for bot permissions
 * - /game: Game management (start, stop, status, list)
 * - /operators: Operator management and authorization system
 * 
 * Game Interaction Support:
 * - TicTacToe: Button interactions for game moves and AI responses
 * - AI Uprising: Complex RPG interactions with story choices and combat
 * - GeoGuesser: Geographic guessing game with location-based interactions
 * 
 * The service coordinates with Discord's REST API for command registration
 * and provides a centralized interaction handling system for all bot commands.
 */

import { Collection, REST, Routes, Interaction, Client } from 'discord.js';
import { botConfig } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import * as ttsCommand from '../commands/tts.js';
import * as whitelistCommand from '../commands/whitelist.js';
import * as gameCommand from '../commands/game.js';
import * as operatorsCommand from '../commands/operators.js';
import { BaseInteractionHandler } from '../games/common/BaseInteractionHandler.js';
import { TicTacToeInteractionHandler } from '../games/tic-tac-toe/interactions/TicTacToeInteractionHandler.js';
import { WordScrambleInteractionHandler } from '../games/word-scramble/interactions/WordScrambleInteractionHandler.js';
import { AIUprisingInteractionHandler } from '../games/ai-uprising/interactions/AIUprisingInteractionHandler.js';
import { GeoGuesserInteractionHandler } from '../games/geo-guesser/interactions/GeoGuesserInteractionHandler.js';
import { HangmanInteractionHandler } from '../games/hangman/interactions/HangmanInteractionHandler.js';
import { BlackjackInteractionHandler } from '../games/blackjack/interactions/BlackjackInteractionHandler.js';

export class CommandService {
  private commands: Collection<string, any>;
  private client: Client;
  private interactionHandlers: BaseInteractionHandler[];

  constructor(client: Client) {
    this.client = client;
    this.commands = new Collection();
    this.interactionHandlers = [
      new TicTacToeInteractionHandler(),
      new WordScrambleInteractionHandler(),
      new AIUprisingInteractionHandler(),
      new GeoGuesserInteractionHandler(),
      new HangmanInteractionHandler(),
      new BlackjackInteractionHandler(),
    ];
    this.initializeCommands();
  }

  private initializeCommands(): void {
    this.commands.set(ttsCommand.data.name, ttsCommand);
    this.commands.set(whitelistCommand.data.name, whitelistCommand);
    this.commands.set(gameCommand.data.name, gameCommand);
    this.commands.set(operatorsCommand.data.name, operatorsCommand);
  }

  async registerSlashCommands(): Promise<void> {
    try {
      const commands = this.commands.map(command => command.data.toJSON());
      
      const rest = new REST().setToken(botConfig.discord.token);
      
      // Register commands globally (takes up to 1 hour to update)
      // For faster development, use guild-specific registration instead
      await rest.put(
        Routes.applicationCommands(this.client.user!.id),
        { body: commands },
      );
      
      logger.info(`Successfully registered ${commands.length} slash commands.`);
    } catch (error) {
      logger.error('Error registering slash commands:', error);
    }
  }

  async handleInteraction(interaction: Interaction): Promise<void> {
    if (interaction.isChatInputCommand()) {
      await this.handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
      await this.handleButtonInteraction(interaction);
    }
  }

  private async handleSlashCommand(interaction: any): Promise<void> {
    const command = this.commands.get(interaction.commandName);

    if (!command) {
      logger.warn(`No command matching ${interaction.commandName} was found.`);
      return;
    }

    try {
      await command.execute(interaction);
      logger.info('Slash command executed successfully', {
        command: interaction.commandName,
        userId: interaction.user.id,
        username: interaction.user.username,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
      });
    } catch (error) {
      logger.error('Error executing slash command:', {
        command: interaction.commandName,
        error: error instanceof Error ? error.message : String(error),
        userId: interaction.user.id,
      });

      const errorMessage = 'There was an error while executing this command!';
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: errorMessage, ephemeral: true });
      } else {
        await interaction.reply({ content: errorMessage, ephemeral: true });
      }
    }
  }

  private async handleButtonInteraction(interaction: any): Promise<void> {
    // Find the appropriate handler for this interaction
    const handler = this.interactionHandlers.find(h => h.canHandle(interaction.customId));
    
    if (handler) {
      await handler.handleButtonInteraction(interaction);
    } else {
      logger.warn(`No handler found for button interaction: ${interaction.customId}`);
      await interaction.reply({
        content: 'This interaction is not supported.',
        ephemeral: true,
      });
    }
  }
}