/**
 * @fileoverview Main Discord bot service - lightweight orchestration of services and event handling.
 * 
 * This service class provides the core Discord bot initialization and coordination:
 * - Discord.js client management with proper intent configuration
 * - Service orchestration (CommandService, MessageHandler)
 * - Event listener setup and delegation
 * - Graceful startup and shutdown handling
 * 
 * Architectural Approach:
 * - Lightweight orchestration class that delegates to specialized services
 * - MessageHandler: Handles all message processing and AI flow coordination
 * - CommandService: Manages slash command registration and execution
 * - Event listeners: Modular event handling with clear separation of concerns
 * 
 * Usage Context:
 * Central service instantiated by bot.ts, coordinates all Discord interactions
 * through specialized service classes.
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import { botConfig } from '../config/environment.js';
import { logger } from '../utils/logger.js';
import { CommandService } from './CommandService.js';
import { MessageHandler } from './MessageHandler.js';
import { MessageCacheService } from './MessageCacheService.js';
import { handleReady } from '../listeners/readyListener.js';
import { handleMessageCreate } from '../listeners/messageCreateListener.js';
import { handleInteractionCreate } from '../listeners/interactionCreateListener.js';
import { handleError } from '../listeners/errorListener.js';

export class DiscordBot {
  private client: Client;
  private commandService: CommandService;
  private messageHandler: MessageHandler;
  private messageCacheService: MessageCacheService;

  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
      ],
    });

    // Initialize services
    this.messageCacheService = new MessageCacheService();
    this.commandService = new CommandService(this.client);
    this.messageHandler = new MessageHandler(this.messageCacheService, this.client.user?.id || '', this.client);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.client.once(Events.ClientReady, async (readyClient) => {
      // Update messageHandler with actual bot user ID after login
      this.messageHandler = new MessageHandler(this.messageCacheService, readyClient.user.id, readyClient);
      
      // Initialize GameManager with Discord client
      const { initializeGameManager } = await import('../flows/gameFlow.js');
      initializeGameManager(readyClient);

      // Initialize GameHandler callback now that GameManager is ready
      this.messageHandler.initializeGameHandlerCallback();
      
      await handleReady(readyClient, this.commandService);
    });

    this.client.on(Events.MessageCreate, (message) => {
      handleMessageCreate(message, this.messageHandler);
    });

    this.client.on(Events.InteractionCreate, (interaction) => {
      handleInteractionCreate(interaction, this.commandService);
    });

    this.client.on(Events.Error, handleError);
  }

  async start(): Promise<void> {
    try {
      await this.client.login(botConfig.discord.token);
      logger.info('Discord bot started successfully');
    } catch (error) {
      logger.error('Failed to start Discord bot:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    logger.info('Shutting down Discord bot...');
    this.client.destroy();
  }

  getClient(): Client {
    return this.client;
  }
}