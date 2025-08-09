/**
 * @fileoverview Multimodal chat flow supporting images, videos, and rich media content.
 * 
 * This flow extends the basic chat capabilities to handle diverse media types:
 * - Image processing and analysis with base64 encoding support
 * - Video content understanding and description
 * - PDF document analysis and content extraction
 * - Multi-media conversation context with proper prompt formatting
 * - Streaming responses with thinking integration for complex multimodal reasoning
 * 
 * Key Features:
 * - ProcessedMedia interface for unified media handling across attachment types
 * - Base64 data URL generation for Genkit media processing
 * - Higher token limits (8192) to accommodate multimodal reasoning
 * - Comprehensive logging for media processing and streaming operations
 * - Thinking support for complex visual and document analysis tasks
 * 
 * Media Processing Pipeline:
 * 1. Receive processed media from MediaProcessor/VideoProcessor services
 * 2. Convert to Genkit-compatible data URL format
 * 3. Construct multimodal prompt with text and media components
 * 4. Stream response with proper thinking chunk filtering
 * 5. Handle errors gracefully with fallback messaging
 * 
 * Supported Media Types:
 * - Images: JPEG, PNG, WebP, GIF via MediaProcessor
 * - Videos: MP4, WebM, MOV via VideoProcessor  
 * - PDFs: Document content extraction and analysis
 * - Text: Enhanced text processing with media context
 * 
 * Usage Context:
 * Called by DiscordBot service when messages contain attachments or media URLs,
 * providing rich multimodal conversation capabilities beyond text-only chat.
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import { botConfig } from '../config/environment.js';

const ProcessedMediaSchema = z.object({
  type: z.enum(['image', 'video', 'pdf', 'text']),
  mimeType: z.string(),
  data: z.string(),
  filename: z.string().optional(),
  size: z.number(),
});

const MultimodalChatInput = z.object({
  message: z.string(),
  userId: z.string(),
  processedMedia: z.array(ProcessedMediaSchema),
  channelId: z.string(),
  messageCacheService: z.any(), // MessageCacheService instance
});

const MultimodalChatOutput = z.object({
  response: z.string(),
});

export type MultimodalChatInputType = z.infer<typeof MultimodalChatInput>;

export const multimodalChatFlow = ai.defineFlow(
  {
    name: 'multimodalChatFlow',
    inputSchema: MultimodalChatInput,
    outputSchema: MultimodalChatOutput,
  },
  async (input: MultimodalChatInputType) => {
    const { message, userId, processedMedia, channelId, messageCacheService } = input;

    logger.info(`MULTIMODAL FLOW: Processing ${processedMedia.length} media items`, { userId, channelId });

    // Get context using the same logic as streamMultimodalChatResponse
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
        logger.warn('MULTIMODAL FLOW: RAG optimization failed, using regular context', error);
        optimizedContext = await messageCacheService.getFormattedContext(channelId);
      }
    } else {
      optimizedContext = await messageCacheService.getFormattedContext(channelId);
    }

    // Build text content with conversation context
    let textContent = message;
    if (optimizedContext && optimizedContext.trim()) {
      textContent = `Here is the recent conversation history:\n${optimizedContext}\n\nUser's current message: ${message}`;
    }

    // Convert processed media to Genkit format
    const prompt = [
      { text: textContent },
      ...processedMedia.map(media => ({
        media: {
          url: `data:${media.mimeType};base64,${media.data}`
        }
      }))
    ];

    const { text } = await ai.generate({
      prompt: [
        { text: 'You are a helpful Discord bot assistant.' },
        ...prompt
      ],
      config: GenerationConfigBuilder.build({
        maxOutputTokens: 8192, // Higher for multimodal
      }),
    });

    return {
      response: text || 'Sorry, I couldn\'t analyze the media content.',
    };
  }
);

// Streaming function for multimodal content
export async function streamMultimodalChatResponse(
  input: MultimodalChatInputType,
  onChunk: (chunk: string) => void
): Promise<string> {
  const { message, userId, processedMedia, channelId, messageCacheService } = input;

  logger.info(`MULTIMODAL FLOW: Streaming ${processedMedia.length} media items`, { 
    userId,
    channelId,
    ragEnabled: botConfig.rag.enabled
  });

  // Get context using RAG optimization if enabled
  let optimizedContext: string;
  
  if (botConfig.rag.enabled) {
    try {
      const { formattedContext, optimizationResult } = await messageCacheService.getOptimizedContext(
        channelId,
        message,
        botConfig.rag.maxContextMessages
      );
      
      optimizedContext = formattedContext;
      
      logger.info('MULTIMODAL FLOW: RAG optimization completed', {
        tokenSavings: Math.round(optimizationResult.tokenSavings),
        originalMessages: optimizationResult.messages.length,
        optimizedMessages: optimizationResult.messages.length,
        optimizationApplied: optimizationResult.tokenSavings > 0
      });
    } catch (error) {
      logger.warn('MULTIMODAL FLOW: RAG optimization failed, using regular context', error);
      optimizedContext = await messageCacheService.getFormattedContext(channelId);
    }
  } else {
    // Use regular formatted context when RAG is disabled
    optimizedContext = await messageCacheService.getFormattedContext(channelId);
  }

  // Build text content with conversation context
  let textContent = message;
  if (optimizedContext && optimizedContext.trim()) {
    textContent = `Here is the recent conversation history:\n${optimizedContext}\n\nUser's current message: ${message}`;
  }

  // Convert processed media to Genkit format
  const prompt = [
    { text: textContent },
    ...processedMedia.map(media => ({
      media: {
        url: `data:${media.mimeType};base64,${media.data}`
      }
    }))
  ];

  logger.debug('MULTIMODAL FLOW: Prompt structure', {
    textContentLength: textContent.length,
    originalMessage: message,
    hasContext: !!optimizedContext?.trim(),
    mediaCount: processedMedia.length,
    mediaTypes: processedMedia.map(m => m.mimeType),
    dataSizes: processedMedia.map(m => m.data.length)
  });

  const { stream } = await ai.generateStream({
    prompt: [
      { text: 'You are a helpful Discord bot assistant.' },
      ...prompt
    ],
    config: GenerationConfigBuilder.build({
      maxOutputTokens: 8192, // Higher for multimodal
    }),
  });

  let fullResponse = '';
  let chunkCount = 0;
  
  for await (const chunk of stream) {
    // CRITICAL: Filter out thinking chunks, only process final response text
    const chunkAny = chunk as any;
    if (chunk.text && !chunkAny.thoughts) {
      chunkCount++;
      logger.debug(`MULTIMODAL FLOW: Processing response chunk ${chunkCount}, length: ${chunk.text.length}`);
      fullResponse += chunk.text;
      await onChunk(chunk.text);
    } else if (chunkAny.thoughts) {
      // Log thinking activity but don't stream to user
      logger.debug(`MULTIMODAL FLOW: Processing thinking chunk (${chunkAny.thoughts.length} chars) - not streaming to user`);
    }
  }

  // Log thinking usage if enabled
  if (botConfig.thinking.enabled) {
    logger.info(`MULTIMODAL FLOW: Completed with thinking enabled (budget: ${botConfig.thinking.budget === -1 ? 'dynamic' : botConfig.thinking.budget})`);
  }

  logger.debug(`MULTIMODAL FLOW: Stream completed, total chunks: ${chunkCount}, final response length: ${fullResponse.length}`);
  return fullResponse || 'Sorry, I couldn\'t analyze the media content.';
}