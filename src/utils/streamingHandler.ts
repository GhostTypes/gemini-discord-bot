/**
 * @fileoverview Discord message streaming handler with intelligent debouncing and rate limiting.
 * 
 * This utility class manages real-time streaming of AI responses to Discord messages,
 * providing sophisticated message editing and splitting capabilities:
 * - Intelligent debounced updates to respect Discord API rate limits
 * - Automatic message splitting at 2000 character boundaries with smart content preservation
 * - State management to prevent race conditions during streaming operations
 * - Support for both text and code chunk streaming with specialized formatting
 * - Comprehensive error handling and cleanup for robust streaming operations
 * 
 * Key Features:
 * - Hybrid debouncing: Fast updates (200ms) for first 5 edits, then slower (1s) to avoid rate limits
 * - Incremental message creation for content exceeding Discord's character limits
 * - Atomic streaming operations with proper async/await handling
 * - Specialized code chunk formatting with syntax highlighting
 * - Graceful degradation when Discord API operations fail
 * 
 * Critical Implementation Details:
 * Uses existence-based state management (`isUpdating` flag) rather than boolean flags
 * to prevent race conditions in async streaming operations. All message edits include
 * timeout protection to prevent hanging operations.
 * 
 * Rate Limiting Strategy:
 * Implements a two-tier debouncing system optimized for Discord's rate limits:
 * - Initial edits (1-5): 200ms debounce for responsive user experience
 * - Subsequent edits (6+): 1000ms debounce to avoid hitting rate limits
 * 
 * Usage Context:
 * Primary utility for all streaming flows (chatFlow, multimodalChatFlow, etc.)
 * ensuring consistent Discord message handling across the application.
 */

import { Message } from 'discord.js';
import { logger } from './logger.js';

export class StreamingHandler {
  private accumulatedText = '';
  private currentMessages: Message[] = [];
  private updateTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly originalMessage: Message;
  private isUpdating = false;
  private chunkCount = 0;
  private editCount = 0;

  constructor(originalMessage: Message) {
    this.originalMessage = originalMessage;
    // Initialize with the first message and its content
    this.accumulatedText = originalMessage.content;
    this.currentMessages = [originalMessage];
  }

  public onChunk(chunk: string): void {
    this.accumulatedText += chunk;
    this.chunkCount++;
    
    // Debounce updates to avoid overwhelming Discord API
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    // Hybrid debounce: Fast for first 5 edits, then slower to respect Discord API rate limits
    const debounceTime = this.editCount < 5 ? 200 : 1000; // 200ms for first 5, then 1 second
    
    this.updateTimer = setTimeout(() => {
      this.updateMessages().catch(error => {
        logger.error('Error updating streaming message:', error);
      });
    }, debounceTime);
  }

  public onCodeChunk(chunk: { type: string; content: string; language?: string }): void {
    switch (chunk.type) {
      case 'text':
        this.accumulatedText += chunk.content;
        break;
        
      case 'code':
        this.accumulatedText += `\n\n**🔧 Executing Code:**\n\`\`\`${chunk.language || 'python'}\n${chunk.content}\n\`\`\``;
        break;
        
      case 'result':
        this.accumulatedText += `\n\n**📊 Result:**\n\`\`\`\n${chunk.content}\n\`\`\``;
        break;
    }
    
    this.chunkCount++;
    
    // Debounce updates to avoid overwhelming Discord API
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    
    // Use slightly longer debounce for code chunks since they tend to be larger
    const debounceTime = this.editCount < 5 ? 300 : 1200;
    
    this.updateTimer = setTimeout(() => {
      this.updateMessages().catch(error => {
        logger.error('Error updating streaming message:', error);
      });
    }, debounceTime);
  }

  public async finalize(): Promise<void> {
    logger.debug(`STREAMING: finalize() called, current text length: ${this.accumulatedText.length}`);
    
    // Clear any pending timer immediately
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
      this.updateTimer = null;
    }
    
    // Wait for any current update to complete (with timeout)
    let waitCount = 0;
    while (this.isUpdating && waitCount < 100) { // Max 1 second wait
      logger.debug(`STREAMING: finalize() waiting for pending update to complete (${waitCount}/100)`);
      await new Promise(resolve => setTimeout(resolve, 10));
      waitCount++;
    }
    
    if (this.isUpdating) {
      logger.debug(`STREAMING: finalize() timeout - forcing final update anyway`);
    }
    
    // Send final update
    await this.updateMessages();
    logger.debug(`STREAMING: finalize() completed`);
  }

  private async updateMessages(): Promise<void> {
    if (this.isUpdating) {
      logger.debug(`STREAMING: updateMessages called but already updating, skipping`);
      return;
    }
    
    this.isUpdating = true;
    this.editCount++;
    
    // Current debounce timing for logging
    const currentDebounce = this.editCount <= 5 ? 200 : 1000;
    
    try {
      logger.debug(`STREAMING: updateMessages called (edit #${this.editCount}, debounce: ${currentDebounce}ms), total length: ${this.accumulatedText.length}, messages: ${this.currentMessages.length}`);
      
      if (this.accumulatedText.length <= 2000) {
        // Single message case - just edit the first message
        const firstMessage = this.currentMessages[0];
        if (firstMessage && firstMessage.content !== this.accumulatedText) {
          logger.debug(`STREAMING: Editing single message, old length: ${firstMessage.content.length}, new length: ${this.accumulatedText.length}`);
          await this.editWithRetry(firstMessage, this.accumulatedText);
        }
      } else {
        logger.debug(`STREAMING: Text too long, handling incremental updates`);
        await this.handleIncrementalUpdate();
      }
    } catch (error) {
      logger.error('Error in updateMessages:', error);
    } finally {
      this.isUpdating = false;
      logger.debug(`STREAMING: updateMessages completed, isUpdating now false`);
    }
  }

  private async handleIncrementalUpdate(): Promise<void> {
    try {
      // If this is the first time we're splitting, set up the first message properly
      if (this.currentMessages.length === 1 && this.currentMessages[0].content.length < 2000) {
        // Fill the first message to its capacity
        const firstChunk = this.accumulatedText.substring(0, 2000);
        logger.debug(`STREAMING: Updating first message to capacity: ${firstChunk.length} chars`);
        await this.editWithRetry(this.currentMessages[0], firstChunk);
      }
      
      // Calculate how much content we need to distribute to additional messages
      let remainingText = this.accumulatedText.substring(2000);
      let messageIndex = 1;
      
      while (remainingText.length > 0) {
        const chunkText = remainingText.substring(0, 2000);
        
        if (messageIndex < this.currentMessages.length) {
          // Update existing message if content is different
          if (this.currentMessages[messageIndex].content !== chunkText) {
            logger.debug(`STREAMING: Updating message ${messageIndex}, new length: ${chunkText.length}`);
            await this.editWithRetry(this.currentMessages[messageIndex], chunkText);
          }
        } else {
          // Create new message
          logger.debug(`STREAMING: Creating new message ${messageIndex} with length: ${chunkText.length}`);
          if ('send' in this.originalMessage.channel) {
            try {
              const sendPromise = this.originalMessage.channel.send(chunkText);
              const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Discord send timeout')), 1000)
              );
              
              const newMessage = await Promise.race([sendPromise, timeoutPromise]) as Message;
              this.currentMessages.push(newMessage);
              logger.debug(`STREAMING: Successfully created message ${messageIndex}`);
            } catch (error: any) {
              logger.debug(`STREAMING: Failed to create message ${messageIndex}:`, error.message || error);
              // Don't break the loop, just skip this message
            }
          }
        }
        
        remainingText = remainingText.substring(2000);
        messageIndex++;
      }
      
      logger.debug(`STREAMING: After incremental update, we have ${this.currentMessages.length} messages`);
    } catch (error) {
      logger.error('Error in handleIncrementalUpdate:', error);
    }
  }

  private async editWithRetry(message: Message, content: string): Promise<void> {
    try {
      // Add timeout to Discord API call
      const editPromise = message.edit(content);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Discord edit timeout')), 1000)
      );
      
      await Promise.race([editPromise, timeoutPromise]);
      logger.debug(`STREAMING: Successfully edited message, new length: ${content.length}`);
    } catch (error: any) {
      logger.debug(`STREAMING: Edit failed:`, error.message || error);
      // Don't throw - just log and continue, better to have partial updates than to break streaming
    }
  }

  public async cleanup(): Promise<void> {
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
  }
}