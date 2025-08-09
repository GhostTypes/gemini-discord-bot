/**
 * @fileoverview Message validation service for Discord bot response strategy determination.
 * 
 * Determines whether and how the bot should respond to Discord messages based on
 * various conditions and contexts. Key validation logic includes:
 * - Bot message filtering with selective caching for attachment-rich content
 * - @mention detection and validation for direct bot interactions
 * - Reply message handling with bot-reply-to-bot detection
 * - Channel whitelist validation for bot permissions
 * - Game mode detection and routing decisions
 * - Autonomous response opportunity assessment
 * 
 * Response Strategy Categories:
 * - Direct responses: @mentions and replies to bot messages
 * - Game mode routing: Channel-specific game state handling
 * - Autonomous responses: Proactive engagement based on content analysis
 * - Message caching: Context preservation for conversation continuity
 * 
 * The validator integrates with WhitelistService for permission checks,
 * MessageCacheService for context management, and supports autonomous
 * response detection through AI-powered content analysis.
 */

import { Message } from 'discord.js';
import { WhitelistService, WhitelistType } from './WhitelistService.js';
import { MessageCacheService } from './MessageCacheService.js';
import { gameManager } from '../flows/gameFlow.js';
import { processAutonomousResponse } from '../flows/autonomousResponseFlow.js';
import { logger } from '../utils/logger.js';

export interface MessageValidationResult {
  shouldProcess: boolean;
  shouldRespond: boolean;
  isReply: boolean;
  isReplyToBot: boolean;
  referencedMessage: Message | null;
  gameState: { isInGameMode: boolean; gameType?: string };
  reason?: string;
}

export class MessageValidator {
  private messageCacheService: MessageCacheService;
  private botUserId: string;

  constructor(messageCacheService: MessageCacheService, botUserId: string) {
    this.messageCacheService = messageCacheService;
    this.botUserId = botUserId;
  }

  async validateMessage(message: Message): Promise<MessageValidationResult> {
    // Handle bot messages for caching but don't respond to them
    if (message.author.bot) {
      // Cache bot messages with attachments for conversation context
      if (message.attachments.size > 0 && !message.channel.isDMBased()) {
        try {
          await this.messageCacheService.saveMessage(message);
          logger.debug(`Cached bot message with attachments: ${message.id}`, {
            attachmentCount: message.attachments.size,
            channelId: message.channel.id
          });
        } catch (error) {
          logger.debug('Failed to cache bot message (non-critical):', error);
        }
      }
      
      return {
        shouldProcess: false,
        shouldRespond: false,
        isReply: false,
        isReplyToBot: false,
        referencedMessage: null,
        gameState: { isInGameMode: false },
        reason: 'Bot message'
      };
    }

    // CRITICAL: Check BOT whitelist first - don't process any messages from non-whitelisted channels
    if (!message.channel.isDMBased()) {
      const whitelistService = WhitelistService.getInstance();
      const isBotWhitelisted = await whitelistService.isChannelWhitelisted(message.channel.id, WhitelistType.BOT);
      if (!isBotWhitelisted) {
        logger.debug('MESSAGE: Channel not whitelisted for bot functionality, ignoring message', {
          channelId: message.channel.id,
          userId: message.author.id
        });
        // Still cache the message for potential future use, but don't respond
        const replyMetadata = message.reference ? await this.getReplyMetadata(message) : undefined;
        this.messageCacheService.saveMessage(message, replyMetadata).catch((error) => {
          logger.debug('Message cache save failed (non-critical):', error);
        });
        
        return {
          shouldProcess: false,
          shouldRespond: false,
          isReply: false,
          isReplyToBot: false,
          referencedMessage: null,
          gameState: { isInGameMode: false },
          reason: 'Channel not whitelisted'
        };
      }
    }

    // Check if this is a reply to any message (do this first to get reply metadata)
    const isReply = !!message.reference;
    let referencedMessage: Message | null = null;
    let isReplyToBot = false;

    if (isReply) {
      try {
        referencedMessage = await message.fetchReference();
        isReplyToBot = referencedMessage.author.id === this.botUserId;
        logger.debug('Reply detected', {
          isReplyToBot,
          referencedAuthor: referencedMessage.author.tag,
          referencedContent: referencedMessage.content.substring(0, 50)
        });
      } catch (error) {
        logger.warn('Could not fetch referenced message:', error);
      }
    }

    // Cache message for conversation history (non-blocking) with reply metadata
    const replyMetadata = referencedMessage ? {
      authorTag: referencedMessage.author.tag,
      content: referencedMessage.content.substring(0, 128)
    } : undefined;
    
    this.messageCacheService.saveMessage(message, replyMetadata).catch((error) => {
      logger.debug('Message cache save failed (non-critical):', error);
    });

    // Check if channel is in game mode first - if so, always respond
    const gameState = await gameManager().getChannelGameState(message.channelId);
    
    logger.debug('Game state check', { 
      channelId: message.channelId, 
      isInGameMode: gameState.isInGameMode,
      gameType: gameState.gameType 
    });
    
    // Handle mentions, DMs, replies to the bot, and replies to any message that mentions the bot
    const isMentioned = message.mentions.users.has(this.botUserId);
    const shouldRespond = gameState.isInGameMode || 
                          isMentioned || 
                          message.channel.isDMBased() || 
                          isReplyToBot ||
                          (isReply && !isReplyToBot); // Reply to any message (not just bot messages)
    
    logger.debug('Message validation decision', {
      userId: message.author.id,
      channelId: message.channelId,
      isMentioned,
      isReplyToBot,
      isReply,
      isDM: message.channel.isDMBased(),
      isInGameMode: gameState.isInGameMode,
      shouldRespond,
      botUserId: this.botUserId
    });

    return {
      shouldProcess: true,
      shouldRespond,
      isReply,
      isReplyToBot,
      referencedMessage,
      gameState,
      reason: shouldRespond ? 'Should respond' : 'Check autonomous'
    };
  }

  async checkAutonomousResponse(message: Message): Promise<boolean> {
    try {
      // Check if channel is whitelisted for autonomous responses
      const whitelistService = WhitelistService.getInstance();
      const isAutonomousWhitelisted = await whitelistService.isChannelWhitelisted(message.channelId, WhitelistType.AUTONOMOUS);
      
      if (!isAutonomousWhitelisted) {
        logger.debug('AUTONOMOUS: Channel not whitelisted for autonomous responses, skipping', {
          channelId: message.channelId,
          userId: message.author.id
        });
        return false;
      }

      // Skip if message is too short or likely casual
      if (message.content.length < 10) {
        return false;
      }

      // Skip common casual patterns
      const casualPatterns = [
        /^(hi|hey|hello|yo|sup)\s*$/i,
        /^(lol|lmao|haha|ok|okay|yes|no|yep|nope|thanks|thx)\s*$/i,
        /^[.!?]+$/,
        /^:\w+:$/, // Single emoji
      ];

      if (casualPatterns.some(pattern => pattern.test(message.content.trim()))) {
        return false;
      }

      // Get recent channel messages for context (last 5 messages)
      let recentMessages: Array<{ content: string; author: string; timestamp: string }> = [];
      
      try {
        if (message.channel.isTextBased()) {
          const messages = await message.channel.messages.fetch({ limit: 6 }); // 6 to include current message
          recentMessages = Array.from(messages.values())
            .filter(m => m.id !== message.id) // Exclude current message
            .slice(0, 5) // Get last 5
            .reverse() // Chronological order
            .map(m => ({
              content: m.content,
              author: m.author.username,
              timestamp: m.createdAt.toISOString(),
            }));
        }
      } catch (error) {
        logger.debug('Could not fetch recent messages for autonomous context:', error);
      }

      logger.debug('AUTONOMOUS: Processing message for autonomous response', {
        userId: message.author.id,
        messageLength: message.content.length,
        contextMessages: recentMessages.length,
      });

      // Only do the analysis part - decide if we should respond
      const result = await processAutonomousResponse({
        message: message.content,
        channelId: message.channelId,
        userId: message.author.id,
        username: message.author.username,
        recentMessages,
      });

      if (result.shouldRespond) {
        logger.info('AUTONOMOUS: Autonomous response warranted, routing through normal system', {
          userId: message.author.id,
          confidence: result.confidence,
          responseType: result.responseType,
        });
        return true;
      } else {
        logger.debug('AUTONOMOUS: No response warranted', {
          userId: message.author.id,
          confidence: result.confidence,
          reason: result.reason,
        });
        return false;
      }

    } catch (error) {
      logger.error('AUTONOMOUS: Error in autonomous response handler:', error);
      return false;
    }
  }

  private async getReplyMetadata(message: Message): Promise<{ authorTag: string; content: string } | undefined> {
    try {
      const referencedMessage = await message.fetchReference();
      return {
        authorTag: referencedMessage.author.tag,
        content: referencedMessage.content.substring(0, 128)
      };
    } catch (error) {
      logger.warn('Could not fetch referenced message metadata:', error);
      return undefined;
    }
  }
}