/**
 * @fileoverview Primary message processing pipeline for Discord bot interactions.
 * 
 * Serves as the main entry point for all Discord message processing, coordinating
 * validation, content analysis, and routing decisions. Key responsibilities include:
 * - Message validation and response strategy determination
 * - Autonomous response opportunity detection
 * - Game state awareness and routing to game handlers
 * - Content analysis coordination through ContentDetectionService
 * - Message routing to FlowOrchestrator for specialized processing
 * - Reply context enhancement for improved conversation understanding
 * - Comprehensive error handling with user-friendly fallback responses
 * 
 * Processing Pipeline:
 * 1. Message validation and eligibility assessment
 * 2. Game mode detection and routing to game handlers if applicable
 * 3. Typing indicator management for user experience
 * 4. Reply context enhancement for referenced messages
 * 5. Content analysis to determine processing requirements
 * 6. Routing to appropriate specialized flows through FlowOrchestrator
 * 7. Error handling and fallback response management
 * 
 * Integrates with MessageValidator for validation logic, ContentDetectionService
 * for content analysis, and FlowOrchestrator for intelligent routing decisions.
 */

import { Message } from 'discord.js';
import { logger } from '../utils/logger.js';
import { MessageCacheService } from './MessageCacheService.js';
import { MessageValidator } from './MessageValidator.js';
import { ContentDetectionService } from './ContentDetectionService.js';
import { FlowOrchestrator } from './FlowOrchestrator.js';
import { GameHandler } from './GameHandler.js';
import { MessageEnhancer } from '../utils/messageEnhancer.js';

export class MessageHandler {
  private messageValidator: MessageValidator;
  private contentDetectionService: ContentDetectionService;
  private flowOrchestrator: FlowOrchestrator;
  private gameHandler: GameHandler;

  constructor(messageCacheService: MessageCacheService, botUserId: string, discordClient?: any) {
    // Initialize service dependencies
    this.messageValidator = new MessageValidator(messageCacheService, botUserId);
    this.contentDetectionService = new ContentDetectionService(messageCacheService);
    this.flowOrchestrator = new FlowOrchestrator(messageCacheService, this.contentDetectionService, discordClient);
    this.gameHandler = new GameHandler();
  }

  initializeGameHandlerCallback() {
    // Initialize GameHandler callback after GameManager is ready
    this.flowOrchestrator.initializeGameHandlerCallback();
  }

  async handleMessage(message: Message): Promise<void> {
    // Validate message and determine response strategy
    const validation = await this.messageValidator.validateMessage(message);
    
    if (!validation.shouldProcess) {
      return;
    }

    if (validation.shouldRespond) {
      await this.handleMessageRouting(message, null, validation.referencedMessage, validation.gameState);
    } else {
      // Check for autonomous response opportunities
      const shouldRespondAutonomously = await this.messageValidator.checkAutonomousResponse(message);
      if (shouldRespondAutonomously) {
        await this.handleMessageRouting(message, message.content, null, validation.gameState);
      }
    }
  }

  private async handleMessageRouting(
    message: Message, 
    overrideMessage: string | null = null, 
    referencedMessage: Message | null = null,
    gameState: { isInGameMode: boolean; gameType?: string }
  ): Promise<void> {
    try {
      // Check if channel is in game mode first
      if (gameState.isInGameMode) {
        await this.gameHandler.handleGameMessage(message);
        return;
      }

      // Show typing indicator
      if ('sendTyping' in message.channel) {
        await message.channel.sendTyping();
      }

      // Clean message content (remove mentions) or use override
      let cleanMessage = overrideMessage || message.content.replace(/<@!?\d+>/g, '').trim();

      // If this is a reply, enhance the message with referenced content context
      if (referencedMessage) {
        cleanMessage = await MessageEnhancer.enhanceMessageWithReplyContext(cleanMessage, referencedMessage);
      }

      // Analyze content to determine routing strategy
      const contentAnalysis = await this.contentDetectionService.analyzeContent(message, referencedMessage, cleanMessage);

      // Route message to appropriate flow
      await this.flowOrchestrator.routeMessage(message, cleanMessage, referencedMessage, contentAnalysis);

    } catch (error) {
      logger.error('Error handling message routing:', error);
      
      try {
        await message.reply('Sorry, I encountered an error processing your message.');
      } catch (replyError) {
        logger.error('Error sending error reply:', replyError);
      }
    }
  }
}