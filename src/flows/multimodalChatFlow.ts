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
import { flowLogger } from '../debug/flow-logger.js';

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
  flowId: z.string().optional(), // Flow ID for logging
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
    const { message, userId, processedMedia, channelId, messageCacheService, flowId } = input;

    logger.info(`MULTIMODAL FLOW: Processing ${processedMedia.length} media items`, { userId, channelId });

    if (flowId) {
      flowLogger.logFlow(flowId, `Starting multimodal chat processing`, 'info', {
        mediaCount: processedMedia.length,
        mediaTypes: processedMedia.map(m => m.type),
        userId,
        channelId,
        originalMessage: message
      });
    }

    // Get context using the same logic as streamMultimodalChatResponse
    let optimizedContext: string;
    
    if (botConfig.rag.enabled) {
      try {
        if (flowId) {
          flowLogger.logFlow(flowId, `Starting RAG optimization for context`, 'info', {
            maxContextMessages: botConfig.rag.maxContextMessages
          });
        }

        const { formattedContext } = await messageCacheService.getOptimizedContext(
          channelId,
          message,
          botConfig.rag.maxContextMessages,
          flowId
        );
        optimizedContext = formattedContext;

        if (flowId) {
          flowLogger.logFlow(flowId, `RAG optimization completed`, 'info', {
            contextLength: formattedContext.length,
            optimizedContext: formattedContext // FULL CONTEXT - not trimmed!
          });
        }
      } catch (error) {
        logger.warn('MULTIMODAL FLOW: RAG optimization failed, using regular context', error);
        
        if (flowId) {
          flowLogger.logFlow(flowId, `RAG optimization failed, falling back to regular context`, 'warn', {
            error: error instanceof Error ? error.message : String(error)
          });
        }

        optimizedContext = await messageCacheService.getFormattedContext(channelId, flowId);
      }
    } else {
      if (flowId) {
        flowLogger.logFlow(flowId, `RAG disabled, using regular context`, 'info');
      }
      optimizedContext = await messageCacheService.getFormattedContext(channelId, flowId);
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
  const { message, userId, processedMedia, channelId, messageCacheService, flowId } = input;

  logger.info(`MULTIMODAL FLOW: Streaming ${processedMedia.length} media items`, { 
    userId,
    channelId,
    ragEnabled: botConfig.rag.enabled
  });

  if (flowId) {
    flowLogger.logFlow(flowId, `Starting streaming multimodal response`, 'info', {
      mediaCount: processedMedia.length,
      mediaTypes: processedMedia.map(m => m.type),
      ragEnabled: botConfig.rag.enabled,
      userId,
      channelId,
      originalMessage: message,
      fullProcessedMedia: processedMedia // FULL media data - not trimmed!
    });
  }

  // Get context using RAG optimization if enabled
  let optimizedContext: string;
  
  if (botConfig.rag.enabled) {
    try {
      if (flowId) {
        flowLogger.logFlow(flowId, `Starting RAG optimization for streaming`, 'info', {
          maxContextMessages: botConfig.rag.maxContextMessages
        });
      }

      const { formattedContext, optimizationResult } = await messageCacheService.getOptimizedContext(
        channelId,
        message,
        botConfig.rag.maxContextMessages,
        flowId
      );
      
      optimizedContext = formattedContext;
      
      logger.info('MULTIMODAL FLOW: RAG optimization completed', {
        tokenSavings: Math.round(optimizationResult.tokenSavings),
        originalMessages: optimizationResult.messages.length,
        optimizedMessages: optimizationResult.messages.length,
        optimizationApplied: optimizationResult.tokenSavings > 0
      });

      if (flowId) {
        flowLogger.logFlow(flowId, `RAG optimization completed for streaming`, 'info', {
          tokenSavings: Math.round(optimizationResult.tokenSavings),
          originalMessages: optimizationResult.messages.length,
          optimizedMessages: optimizationResult.messages.length,
          optimizationApplied: optimizationResult.tokenSavings > 0,
          fullOptimizedContext: formattedContext, // FULL OPTIMIZED CONTEXT - not trimmed!
          fullOptimizationResult: optimizationResult // FULL result data
        });
      }
    } catch (error) {
      logger.warn('MULTIMODAL FLOW: RAG optimization failed, using regular context', error);
      
      if (flowId) {
        flowLogger.logFlow(flowId, `RAG optimization failed for streaming, using fallback`, 'warn', {
          error: error instanceof Error ? error.message : String(error),
          fallbackUsed: true
        });
      }

      optimizedContext = await messageCacheService.getFormattedContext(channelId, flowId);
    }
  } else {
    if (flowId) {
      flowLogger.logFlow(flowId, `RAG disabled for streaming, using regular context`, 'info');
    }
    // Use regular formatted context when RAG is disabled
    optimizedContext = await messageCacheService.getFormattedContext(channelId, flowId);
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

  if (flowId) {
    flowLogger.logFlow(flowId, `Starting AI model streaming call for multimodal response`, 'info', {
      model: 'googleai/gemini-2.0-flash-lite (implicit)',
      maxOutputTokens: 8192,
      promptParts: prompt.length,
      fullPrompt: prompt, // FULL PROMPT - not trimmed!
      thinkingEnabled: botConfig.thinking.enabled,
      thinkingBudget: botConfig.thinking.budget,
      configUsed: GenerationConfigBuilder.build({ maxOutputTokens: 8192 })
    });
  }

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
  let thinkingChunkCount = 0;
  let allThinkingContent = '';
  
  for await (const chunk of stream) {
    // CRITICAL: Filter out thinking chunks, only process final response text
    const chunkAny = chunk as any;
    if (chunk.text && !chunkAny.thoughts) {
      chunkCount++;
      logger.debug(`MULTIMODAL FLOW: Processing response chunk ${chunkCount}, length: ${chunk.text.length}`);
      fullResponse += chunk.text;
      await onChunk(chunk.text);
      
      // Log each response chunk for flow monitoring
      if (flowId) {
        flowLogger.logFlow(flowId, `AI response chunk #${chunkCount} received`, 'debug', {
          chunkNumber: chunkCount,
          chunkLength: chunk.text.length,
          fullChunkContent: chunk.text, // FULL CHUNK - not trimmed!
          totalResponseLength: fullResponse.length
        });
      }
    } else if (chunkAny.thoughts) {
      // Log thinking activity but don't stream to user
      thinkingChunkCount++;
      allThinkingContent += chunkAny.thoughts;
      logger.debug(`MULTIMODAL FLOW: Processing thinking chunk ${thinkingChunkCount} (${chunkAny.thoughts.length} chars) - not streaming to user`);
      
      // Log thinking chunks for flow monitoring
      if (flowId) {
        flowLogger.logFlow(flowId, `AI thinking chunk #${thinkingChunkCount} received`, 'debug', {
          thinkingChunkNumber: thinkingChunkCount,
          thinkingChunkLength: chunkAny.thoughts.length,
          fullThinkingContent: chunkAny.thoughts, // FULL THINKING - not trimmed!
          totalThinkingLength: allThinkingContent.length
        });
      }
    }
  }

  // Log completion of AI model call with comprehensive statistics
  if (flowId) {
    flowLogger.logFlow(flowId, `AI model streaming call completed`, 'info', {
      model: 'googleai/gemini-2.0-flash-lite (implicit)',
      totalResponseChunks: chunkCount,
      totalThinkingChunks: thinkingChunkCount,
      finalResponseLength: fullResponse.length,
      totalThinkingLength: allThinkingContent.length,
      fullFinalResponse: fullResponse, // FULL RESPONSE - not trimmed!
      fullThinkingContent: allThinkingContent, // FULL THINKING - not trimmed!
      thinkingEnabled: botConfig.thinking.enabled,
      maxOutputTokens: 8192,
      streamingCompleted: true
    });
  }

  // Log thinking usage if enabled
  if (botConfig.thinking.enabled) {
    logger.info(`MULTIMODAL FLOW: Completed with thinking enabled (budget: ${botConfig.thinking.budget === -1 ? 'dynamic' : botConfig.thinking.budget})`);
  }

  logger.debug(`MULTIMODAL FLOW: Stream completed, total chunks: ${chunkCount}, final response length: ${fullResponse.length}`);
  return fullResponse || 'Sorry, I couldn\'t analyze the media content.';
}