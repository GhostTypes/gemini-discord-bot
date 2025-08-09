/**
 * @fileoverview Core text-based chat flow with streaming support and thinking integration.
 * 
 * This module implements the primary conversational flow for the Discord bot, providing:
 * - Real-time streaming text responses with proper message editing
 * - Google Genkit flow integration with Gemini 2.5 Flash Lite model
 * - Advanced thinking/reasoning support with configurable token budgets
 * - Proper chunk filtering to separate thinking content from user responses
 * - Comprehensive logging and error handling for streaming operations
 * 
 * Key Features:
 * - Streaming chat responses that edit Discord messages in real-time
 * - Thinking token budget management with dynamic allocation
 * - Chunk-by-chunk processing with async callback support
 * - Integration with GenerationConfigBuilder for consistent model parameters
 * 
 * Critical Implementation Details:
 * The streaming function uses CRITICAL async callback handling to prevent
 * race conditions that would create multiple Discord messages instead of
 * editing existing ones. All chunk callbacks must be awaited properly.
 * 
 * Usage Context:
 * Primary flow for text-only conversations, called by DiscordBot service
 * for mentions and DMs without media attachments or special intents.
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import { botConfig } from '../config/environment.js';
import { getSystemPrompt } from '../utils/systemPrompt.js';

const ChatInput = z.object({
  message: z.string(),
  userId: z.string(),
  channelId: z.string(),
  messageCacheService: z.any(), // MessageCacheService instance
});

export type ChatInputType = z.infer<typeof ChatInput>;

const ChatOutput = z.object({
  response: z.string(),
});

export const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: ChatInput,
    outputSchema: ChatOutput,
  },
  async (input: z.infer<typeof ChatInput>) => {
    const { message, channelId, messageCacheService } = input;

    // Get context using the same logic as streamChatResponse
    let optimizedContext: string;
    
    if (botConfig.rag.enabled) {
      try {
        const { formattedContext } = await messageCacheService.getOptimizedContext(
          channelId,
          message,
          botConfig.rag.maxContextMessages
        );
        optimizedContext = formattedContext;
      } catch (error) {
        logger.warn('CHAT FLOW: RAG optimization failed, using regular context', error);
        optimizedContext = await messageCacheService.getFormattedContext(channelId);
      }
    } else {
      optimizedContext = await messageCacheService.getFormattedContext(channelId);
    }

    const systemPrompt = getSystemPrompt();
    
    let userPrompt: string;
    if (optimizedContext && optimizedContext.trim()) {
      userPrompt = `Here is the recent conversation history:\n${optimizedContext}\n\nUser's current message: ${message}`;
    } else {
      userPrompt = `User message: ${message}`;
    }

    const { text } = await ai.generate({
      prompt: userPrompt,
      system: systemPrompt,
      config: GenerationConfigBuilder.build(),
    });

    return {
      response: text || 'Sorry, I couldn\'t generate a response.',
    };
  }
);


// Text-only streaming function
export async function streamChatResponse(
  input: ChatInputType,
  onChunk: (chunk: string) => void
): Promise<string> {
  const { message, userId, channelId, messageCacheService } = input;

  logger.info('CHAT FLOW: Processing text-only request', { 
    userId, 
    channelId,
    ragEnabled: botConfig.rag.enabled
  });

  let optimizedContext: string;
  
  // Get context using RAG optimization if enabled
  if (botConfig.rag.enabled) {
    try {
      const { formattedContext, optimizationResult } = await messageCacheService.getOptimizedContext(
        channelId,
        message,
        botConfig.rag.maxContextMessages
      );
      
      optimizedContext = formattedContext;
      
      logger.info('CHAT FLOW: RAG optimization completed', {
        tokenSavings: Math.round(optimizationResult.tokenSavings),
        originalMessages: optimizationResult.messages.length,
        optimizedMessages: optimizationResult.messages.length,
        optimizationApplied: optimizationResult.tokenSavings > 0
      });
    } catch (error) {
      logger.warn('CHAT FLOW: RAG optimization failed, using regular context', error);
      optimizedContext = await messageCacheService.getFormattedContext(channelId);
    }
  } else {
    // Use regular formatted context when RAG is disabled
    optimizedContext = await messageCacheService.getFormattedContext(channelId);
  }

  const systemPrompt = getSystemPrompt();
  
  let userPrompt: string;
  if (optimizedContext && optimizedContext.trim()) {
    userPrompt = `Here is the recent conversation history:\n${optimizedContext}\n\nUser's current message: ${message}`;
  } else {
    userPrompt = `User: ${message}`;
  }

  const { stream } = await ai.generateStream({
    prompt: userPrompt,
    system: systemPrompt,
    config: GenerationConfigBuilder.build(),
  });

  let fullResponse = '';
  let chunkCount = 0;
  
  for await (const chunk of stream) {
    // CRITICAL: Filter out thinking chunks, only process final response text
    const chunkAny = chunk as any;
    if (chunk.text && !chunkAny.thoughts) {
      chunkCount++;
      logger.debug(`CHAT FLOW: Processing response chunk ${chunkCount}, length: ${chunk.text.length}`);
      fullResponse += chunk.text;
      await onChunk(chunk.text);
    } else if (chunkAny.thoughts) {
      // Log thinking activity but don't stream to user
      logger.debug(`CHAT FLOW: Processing thinking chunk (${chunkAny.thoughts.length} chars) - not streaming to user`);
    }
  }

  // Log thinking usage if enabled
  if (botConfig.thinking.enabled) {
    logger.info(`CHAT FLOW: Completed with thinking enabled (budget: ${botConfig.thinking.budget === -1 ? 'dynamic' : botConfig.thinking.budget})`);
  }

  logger.debug(`CHAT FLOW: Stream completed, total response chunks: ${chunkCount}, final response length: ${fullResponse.length}`);
  return fullResponse || 'Sorry, I couldn\'t generate a response.';
}