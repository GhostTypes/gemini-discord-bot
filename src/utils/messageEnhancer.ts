/**
 * @fileoverview Discord message enhancement utilities for contextual reply processing.
 * 
 * Provides sophisticated message enhancement capabilities for Discord bot interactions,
 * specifically focused on enriching user messages with contextual information from
 * referenced messages. This utility class enables the bot to understand and respond
 * to message replies with full context awareness.
 * 
 * Key features:
 * - Reply context enhancement with referenced message content and author information
 * - Automatic attachment type detection and context annotation (images, videos, audio, files)
 * - URL extraction and context enrichment from referenced messages
 * - Structured context formatting for AI consumption with clear delineation
 * - Robust error handling with graceful fallback to original message content
 * - Integration with UrlDetector for comprehensive web context analysis
 * 
 * The MessageEnhancer class transforms simple Discord message replies into rich,
 * contextually-aware prompts that help the AI understand conversation flow and
 * provide more relevant responses based on what users are replying to.
 */

import { Message } from 'discord.js';
import { UrlDetector } from '../flows/schemas/webContext.js';
import { logger } from './logger.js';

export class MessageEnhancer {
  
  static async enhanceMessageWithReplyContext(cleanMessage: string, referencedMessage: Message): Promise<string> {
    try {
      // Build context from the referenced message
      const contextParts: string[] = [];
      
      // Add referenced message author and content
      contextParts.push(`[Replying to @${referencedMessage.author.username}]: "${referencedMessage.content}"`);
      
      // Add attachment context if present
      if (referencedMessage.attachments.size > 0) {
        const attachmentTypes = Array.from(referencedMessage.attachments.values()).map(att => {
          if (att.contentType?.startsWith('image/')) {return 'image';}
          if (att.contentType?.startsWith('video/')) {return 'video';}
          if (att.contentType?.startsWith('audio/')) {return 'audio';}
          return 'file';
        });
        contextParts.push(`[Referenced message contains: ${attachmentTypes.join(', ')}]`);
      }
      
      // Add URL context if present
      const referencedUrls = UrlDetector.extractUrls(referencedMessage.content);
      if (referencedUrls.length > 0) {
        contextParts.push(`[Referenced message contains URLs: ${referencedUrls.slice(0, 2).join(', ')}${referencedUrls.length > 2 ? '...' : ''}]`);
      }
      
      // Combine context with the current message
      const context = contextParts.join('\n');
      return `${context}\n\n[User's reply]: ${cleanMessage}`;
      
    } catch (error) {
      logger.error('Error enhancing message with reply context:', error);
      return cleanMessage; // Fall back to original message
    }
  }
}