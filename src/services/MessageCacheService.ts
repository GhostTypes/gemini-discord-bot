/**
 * @fileoverview Discord message caching service with sliding window context management
 * 
 * Implements a conversation history cache based on the Lumi Rust bot design.
 * Features sliding window with 64-message threshold and automatic context cleanup.
 */

import { PrismaClient, type User, type Message } from '@prisma/client';
import type { Message as DiscordMessage } from 'discord.js';
import { prisma } from '../persistence/client.js';
import { logger } from '../utils/logger.js';
import { RelevanceScorer, type OptimizedContext } from './RelevanceScorer.js';
import { botConfig } from '../config/environment.js';
import { flowLogger } from '../debug/flow-logger.js';

type MessageWithAuthor = Message & { 
  author: User;
  replyToMessage?: (Message & { author: User }) | null;
  replyToAuthorTag?: string | null;
  replyToContent?: string | null;
};

export class MessageCacheService {
  private readonly client: PrismaClient;
  private readonly cacheSize: number;

  constructor(
    client: PrismaClient = prisma, 
    cacheSize: number = parseInt(process.env.MESSAGE_CACHE_SIZE || '64')
  ) {
    this.client = client;
    this.cacheSize = cacheSize;
  }

  /**
   * Processes attachments from Discord message into base64 format during caching
   * Downloads and converts all supported attachment types for optimized future access
   */
  private async processAttachmentsForStorage(message: DiscordMessage): Promise<{ processedAttachments: any[] | null; hasAttachments: boolean }> {
    const attachments = Array.from(message.attachments.values());
    
    if (attachments.length === 0) {
      return { processedAttachments: null, hasAttachments: false };
    }

    const processedAttachments = [];
    
    for (const attachment of attachments) {
      try {
        // Generic attachment processing - easily extensible for new types
        let processed = null;
        
        if (attachment.contentType?.startsWith('image/')) {
          // Process images using MediaProcessor
          const { MediaProcessor } = await import('./MediaProcessor.js');
          processed = await MediaProcessor.processAttachment(attachment);
          if (processed) {
            logger.debug('Successfully processed image attachment for cache', { 
              filename: attachment.name,
              type: processed.type,
              size: attachment.size,
              processedSize: processed.data.length 
            });
          }
        } else if (attachment.contentType === 'application/pdf') {
          // Process PDFs using PDF flow
          const { downloadAndConvertPDFToBase64 } = await import('../flows/pdfFlow.js');
          const { data: pdfBase64, filename: pdfFilename } = await downloadAndConvertPDFToBase64(attachment.url);
          
          processed = {
            type: 'pdf' as const,
            mimeType: 'application/pdf',
            data: pdfBase64,
            filename: pdfFilename || attachment.name || 'document.pdf',
            size: attachment.size || 0,
          };
          
          logger.debug('Successfully processed PDF attachment for cache', { 
            filename: processed.filename,
            type: processed.type,
            originalSize: attachment.size,
            processedSize: pdfBase64.length 
          });
        }
        // Future: Add more attachment types here (videos, audio, documents, etc.)
        // else if (attachment.contentType?.startsWith('video/')) {
        //   processed = await VideoProcessor.processAttachment(attachment);
        // }
        
        if (processed) {
          processedAttachments.push(processed);
        } else {
          // For unsupported types, store basic metadata (no base64 processing)
          const metadata = {
            type: 'unsupported' as const,
            mimeType: attachment.contentType || 'unknown',
            data: '', // No base64 data for unsupported types
            filename: attachment.name || 'unknown',
            size: attachment.size || 0,
            url: attachment.url, // Keep URL for unsupported types
          };
          
          processedAttachments.push(metadata);
          logger.debug('Stored metadata for unsupported attachment type', { 
            filename: attachment.name,
            contentType: attachment.contentType 
          });
        }
      } catch (error) {
        logger.warn('Failed to process attachment during caching, skipping', {
          filename: attachment.name,
          contentType: attachment.contentType,
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue processing other attachments
      }
    }

    return { 
      processedAttachments: processedAttachments.length > 0 ? processedAttachments : null,
      hasAttachments: processedAttachments.length > 0 
    };
  }

  /**
   * Saves Discord message with atomic user/channel upsert
   * Implements graceful degradation - errors don't break bot functionality
   */
  public async saveMessage(
    message: DiscordMessage, 
    replyMetadata?: { authorTag: string; content: string }
  ): Promise<void> {
    if (!message.guildId || message.channel.isDMBased()) {
      return; // Skip DMs and non-guild messages
    }

    try {
      await this.client.$transaction(async (tx: any) => {
        // Upsert User with latest display name
        await tx.user.upsert({
          where: { id: message.author.id },
          update: {
            username: message.author.username,
            displayName: message.member?.displayName ?? message.author.displayName,
          },
          create: {
            id: message.author.id,
            username: message.author.username,
            displayName: message.member?.displayName ?? message.author.displayName,
          },
        });

        // Upsert Channel
        await tx.channel.upsert({
          where: { id: message.channel.id },
          update: {},
          create: {
            id: message.channel.id,
            guildId: message.guildId,
          },
        });

        // Create Message with reply context
        try {
          // Check if the referenced message exists in our database before setting foreign key
          let replyToMessageId = null;
          if (message.reference?.messageId) {
            const referencedMessageExists = await tx.message.findUnique({
              where: { id: message.reference.messageId },
              select: { id: true }
            });
            replyToMessageId = referencedMessageExists ? message.reference.messageId : null;
          }

          // Process attachment information with base64 conversion
          const { processedAttachments, hasAttachments } = await this.processAttachmentsForStorage(message);

          await tx.message.create({
            data: {
              id: message.id,
              content: message.content || '[Empty Message]',
              createdAt: message.createdAt,
              authorId: message.author.id,
              channelId: message.channel.id,
              replyToMessageId: replyToMessageId,
              replyToAuthorTag: replyMetadata?.authorTag ?? null,
              replyToContent: replyMetadata?.content ?? null,
              processedAttachments: processedAttachments,
              hasAttachments: hasAttachments,
            },
          });
        } catch (error: any) {
          // Handle any remaining errors
          if (error.code === 'P2002') {
            // Unique constraint violation - message already exists
            // Process attachment information for fallback case too
            const { processedAttachments, hasAttachments } = await this.processAttachmentsForStorage(message);
            
            await tx.message.create({
              data: {
                id: message.id,
                content: message.content || '[Empty Message]',
                createdAt: message.createdAt,
                authorId: message.author.id,
                channelId: message.channel.id,
                replyToMessageId: null, // Remove the problematic reply reference
                replyToAuthorTag: replyMetadata?.authorTag ?? null,
                replyToContent: replyMetadata?.content ?? null,
                processedAttachments: processedAttachments,
                hasAttachments: hasAttachments,
              },
            });
            logger.debug(`Saved message ${message.id} (reply reference outside cache window, using metadata)`);
          } else {
            throw error;
          }
        }
      });

      logger.debug(`Cached message ${message.id} from ${message.author.username}`);
    } catch (error) {
      logger.error(`Failed to save message ${message.id}:`, error);
      // Graceful degradation - bot continues without this message in history
    }
  }






  /**
   * Retrieves formatted conversation context for AI flows
   * Implements sliding window logic from Rust implementation
   */
  public async getFormattedContext(channelId: string, flowId?: string): Promise<string> {
    try {
      logger.info(`DEBUG: getFormattedContext called for channel ${channelId}`);
      
      if (flowId) {
        flowLogger.logFlow(flowId, `Starting context retrieval for channel ${channelId}`, 'info');
      }
      
      const channel = await this.client.channel.findUnique({ 
        where: { id: channelId } 
      });
      
      if (!channel) {
        logger.info(`DEBUG: No channel found for ID: ${channelId}`);
        if (flowId) {
          flowLogger.logFlow(flowId, `No channel found for ID: ${channelId}`, 'warn');
        }
        return "";
      }

      // Fetch messages from context window start
      const messages = await this.client.message.findMany({
        where: {
          channelId: channelId,
          createdAt: { gte: channel.contextWindowStart },
        },
        include: {
          author: true,
          replyToMessage: { include: { author: true } }
        },
        orderBy: { createdAt: 'asc' },
        take: this.cacheSize * 2, // Fetch extra for sliding window
      });

      logger.info(`DEBUG: Found ${messages.length} messages in cache`, {
        channelId,
        messageCount: messages.length,
        contextWindowStart: channel.contextWindowStart
      });

      if (flowId) {
        flowLogger.logFlow(flowId, `Retrieved ${messages.length} messages from database`, 'info', {
          channelId,
          messageCount: messages.length,
          contextWindowStart: channel.contextWindowStart.toISOString(),
          cacheSize: this.cacheSize
        });
      }

      // Check if we need to slide the window
      if (messages.length > this.cacheSize) {
        await this.slideWindow(channelId, messages);
        
        // Return only the messages that remain after sliding
        const remainingMessages = messages.slice(Math.floor(this.cacheSize / 2));
        const formattedContext = this.formatMessages(remainingMessages);
        logger.info(`DEBUG: Returning formatted context after sliding window`, {
          remainingMessageCount: remainingMessages.length,
          contextLength: formattedContext.length
        });
        
        if (flowId) {
          flowLogger.logFlow(flowId, `Context formatted after sliding window`, 'info', {
            remainingMessageCount: remainingMessages.length,
            contextLength: formattedContext.length,
            preview: formattedContext.substring(0, 200) + '...'
          });
        }
        
        return formattedContext;
      }
      
      const formattedContext = this.formatMessages(messages);
      logger.info(`DEBUG: Returning formatted context`, {
        messageCount: messages.length,
        contextLength: formattedContext.length,
        preview: formattedContext.substring(0, 100) + '...'
      });

      if (flowId) {
        flowLogger.logFlow(flowId, `Context formatted and ready`, 'info', {
          messageCount: messages.length,
          contextLength: formattedContext.length,
          fullContext: formattedContext, // FULL CONTEXT - not trimmed!
          preview: formattedContext.substring(0, 200) + '...'
        });
      }

      return formattedContext;
    } catch (error) {
      logger.error(`Failed to get context for channel ${channelId}:`, error);
      return "";
    }
  }

  /**
   * Advances context window to middle message (Rust sliding window algorithm)
   * Keeps most recent half of messages for conversation continuity
   * Deletes old messages from database to prevent unlimited growth
   */
  private async slideWindow(
    channelId: string, 
    messages: MessageWithAuthor[]
  ): Promise<void> {
    try {
      const middleIndex = Math.floor(this.cacheSize / 2);
      
      if (messages.length > middleIndex) {
        const middleMessage = messages[middleIndex];
        
        await this.client.$transaction(async (tx) => {
          // Update the context window start
          await tx.channel.update({
            where: { id: channelId },
            data: { contextWindowStart: middleMessage.createdAt },
          });
          
          // Delete messages older than the new context window start
          const deletedMessages = await tx.message.deleteMany({
            where: {
              channelId: channelId,
              createdAt: { lt: middleMessage.createdAt }
            }
          });
          
          logger.info(
            `Slid context window for channel ${channelId} ` +
            `from ${messages[0].createdAt.toISOString()} ` +
            `to ${middleMessage.createdAt.toISOString()} ` +
            `and deleted ${deletedMessages.count} old messages`
          );
        });
      }
    } catch (error) {
      logger.error(`Failed to slide window for channel ${channelId}:`, error);
    }
  }

  /**
   * Formats messages following Lumi's structure:
   * "Replying to: [Author]: [Truncated Content]"
   * "Author Name (Author ID): Message Content"
   */
  private formatMessages(messages: MessageWithAuthor[]): string {
    return messages.map(msg => {
      let formatted = "";
      
      // Add reply context (truncated to 128 chars like Rust implementation)
      if (msg.replyToMessage) {
        // Use foreign key relationship when available
        const replyContent = msg.replyToMessage.content
          .substring(0, 128)
          .replace(/\n/g, ' ');
        formatted += `Replying to:\n`;
        formatted += `\tReferenced Author ID: ${msg.replyToMessage.author.id}\n`;
        formatted += `\tReferenced Truncated Contents: ${replyContent}\n`;
      } else if (msg.replyToAuthorTag && msg.replyToContent) {
        // Use stored reply metadata when foreign key relationship is missing
        const replyContent = msg.replyToContent
          .substring(0, 128)
          .replace(/\n/g, ' ');
        formatted += `Replying to:\n`;
        formatted += `\tReferenced Author: ${msg.replyToAuthorTag}\n`;
        formatted += `\tReferenced Truncated Contents: ${replyContent}\n`;
      }
      
      // Main message format matching Rust structure
      formatted += `Author Name: ${msg.author.displayName}\n`;
      formatted += `Author ID: ${msg.author.id}\n`;
      formatted += `Contents:\n${msg.content}`;
      
      // Add attachment information if present
      if (msg.hasAttachments && msg.processedAttachments) {
        const attachments = Array.isArray(msg.processedAttachments) ? msg.processedAttachments : [];
        formatted += `\nAttachments:\n`;
        attachments.forEach((attachment: any, index: number) => {
          formatted += `\t[${index + 1}] ${attachment.filename || 'Unknown'} (${attachment.mimeType || 'unknown type'})\n`;
          formatted += `\t    Type: ${attachment.type}\n`;
          formatted += `\t    Size: ${attachment.size} bytes\n`;
          if (attachment.data && attachment.data.length > 0) {
            formatted += `\t    Data: Available (${attachment.data.length} chars base64)\n`;
          } else if (attachment.url) {
            formatted += `\t    URL: ${attachment.url}\n`;
          }
        });
      }
      
      return formatted;
    }).join('\n\n'); // Double newline for message separation
  }

  /**
   * Get cached processed attachments for a specific message
   */
  public async getCachedAttachments(messageId: string): Promise<any[] | null> {
    try {
      const message = await this.client.message.findUnique({
        where: { id: messageId },
        select: { 
          processedAttachments: true,
          hasAttachments: true 
        }
      });

      if (!message || !message.hasAttachments || !message.processedAttachments) {
        return null;
      }

      const attachments = Array.isArray(message.processedAttachments) ? message.processedAttachments : [];
      logger.debug('Retrieved cached attachments for message', { 
        messageId, 
        attachmentCount: attachments.length,
        attachmentTypes: attachments.map((a: any) => a.type)
      });
      
      return attachments;
    } catch (error) {
      logger.debug('Failed to get cached attachments for message', { messageId, error });
      return null;
    }
  }

  /**
   * Get recent messages that have attachments from the cache
   */
  public async getRecentMessagesWithAttachments(channelId: string, limit: number = 10): Promise<any[]> {
    try {
      const messages = await this.client.message.findMany({
        where: {
          channelId: channelId,
          hasAttachments: true,
        },
        include: {
          author: true,
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      logger.debug(`Found ${messages.length} messages with attachments in channel ${channelId}`);
      return messages;
      
    } catch (error) {
      logger.error(`Failed to get messages with attachments for channel ${channelId}:`, error);
      return [];
    }
  }

  /**
   * Get optimized context using RAG-like relevance scoring
   */
  public async getOptimizedContext(
    channelId: string,
    query: string,
    maxMessages: number = botConfig.rag.maxContextMessages,
    flowId?: string
  ): Promise<{
    formattedContext: string;
    optimizationResult: OptimizedContext;
  }> {
    try {
      if (flowId) {
        flowLogger.logFlow(flowId, `Starting RAG context optimization`, 'info', {
          channelId,
          query,
          maxMessages,
          cacheSize: this.cacheSize
        });
      }

      // Get all cached messages for this channel
      const messages = await this.client.message.findMany({
        where: { channelId },
        include: {
          author: true,
          replyToMessage: { include: { author: true } }
        },
        orderBy: { createdAt: 'asc' },
        take: this.cacheSize * 2,
      });

      if (flowId) {
        flowLogger.logFlow(flowId, `Retrieved messages for RAG optimization`, 'info', {
          messageCount: messages.length,
          maxAllowed: maxMessages,
          needsOptimization: messages.length > maxMessages
        });
      }

      if (messages.length <= maxMessages) {
        // No optimization needed
        if (flowId) {
          flowLogger.logFlow(flowId, `No RAG optimization needed`, 'info', {
            messageCount: messages.length,
            maxMessages,
            reason: 'Messages within limit'
          });
        }

        const formattedContext = this.formatMessages(messages);
        return {
          formattedContext,
          optimizationResult: {
            messages,
            relevanceScores: messages.map(() => 1.0),
            tokenSavings: 0,
            originalTokens: 0,
            optimizedTokens: 0,
          }
        };
      }

      // Apply relevance scoring
      if (flowId) {
        flowLogger.logFlow(flowId, `Starting relevance scoring for RAG optimization`, 'info', {
          originalMessageCount: messages.length,
          targetMessageCount: maxMessages,
          queryLength: query.length,
          query: query.substring(0, 200) + '...'
        });
      }

      const relevanceScorer = new RelevanceScorer();
      const optimizationResult = await relevanceScorer.optimizeContext(
        query,
        messages,
        maxMessages
      );

      if (flowId) {
        flowLogger.logFlow(flowId, `RAG relevance scoring completed`, 'info', {
          originalMessages: messages.length,
          optimizedMessages: optimizationResult.messages.length,
          tokenSavings: Math.round(optimizationResult.tokenSavings),
          originalTokens: optimizationResult.originalTokens,
          optimizedTokens: optimizationResult.optimizedTokens,
          fullOptimizationResult: optimizationResult, // FULL result data
          relevanceScores: optimizationResult.relevanceScores // FULL scores array
        });
      }

      const formattedContext = this.formatMessages(optimizationResult.messages);
      
      logger.info('Message cache optimization completed', {
        channelId,
        originalMessages: messages.length,
        optimizedMessages: optimizationResult.messages.length,
        tokenSavings: Math.round(optimizationResult.tokenSavings),
      });

      return { formattedContext, optimizationResult };
    } catch (error) {
      logger.error(`Failed to get optimized context for channel ${channelId}:`, error);
      
      // Fallback to regular context
      const fallbackContext = await this.getFormattedContext(channelId);
      return {
        formattedContext: fallbackContext,
        optimizationResult: {
          messages: [],
          relevanceScores: [],
          tokenSavings: 0,
          originalTokens: 0,
          optimizedTokens: 0,
        }
      };
    }
  }

  /**
   * Get basic statistics for monitoring
   */
  public async getStats(): Promise<{
    totalMessages: number;
    totalChannels: number;
    totalUsers: number;
  }> {
    try {
      const [totalMessages, totalChannels, totalUsers] = await Promise.all([
        this.client.message.count(),
        this.client.channel.count(),
        this.client.user.count(),
      ]);

      return { totalMessages, totalChannels, totalUsers };
    } catch (error) {
      logger.error('Failed to get cache stats:', error);
      return { totalMessages: 0, totalChannels: 0, totalUsers: 0 };
    }
  }
}