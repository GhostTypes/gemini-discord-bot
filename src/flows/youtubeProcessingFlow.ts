/**
 * @fileoverview YouTube video analysis flow with specialized content understanding.
 * 
 * Provides specialized processing for YouTube videos using Google's multimodal
 * AI capabilities optimized for YouTube content. Key features include:
 * - Direct YouTube URL processing without video download
 * - YouTube-specific content analysis and summarization
 * - Video metadata extraction and context understanding
 * - Streaming responses with formatted video analysis
 * - Integration with Google's native YouTube understanding capabilities
 * 
 * YouTube Processing Pipeline:
 * 1. Extract YouTube video IDs and metadata from URLs
 * 2. Process videos directly through Google's YouTube-aware models
 * 3. Analyze video content, transcripts, and visual elements
 * 4. Stream comprehensive analysis back to Discord
 * 5. Format responses with video context and insights
 * 
 * Optimized for YouTube-specific features like:
 * - Video transcripts and closed captions
 * - Channel context and creator information
 * - Video categories and metadata analysis
 * - Community engagement and comment context
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { ProcessedVideo } from '../services/VideoProcessor.js';
import { GoogleGenAI, createUserContent } from '@google/genai';
import { botConfig } from '../config/environment.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';

const ProcessedVideoSchema = z.object({
  type: z.enum(['video']),
  mimeType: z.string(),
  data: z.string(), // YouTube URL stored here
  filename: z.string().optional(),
  size: z.number(),
  duration: z.number().optional(),
  isYouTube: z.boolean(),
  videoId: z.string().optional(),
  url: z.string(),
});

const YouTubeProcessingInput = z.object({
  message: z.string(),
  userId: z.string(),
  processedVideos: z.array(ProcessedVideoSchema),
});

const YouTubeProcessingOutput = z.object({
  response: z.string(),
});

export type YouTubeProcessingInputType = z.infer<typeof YouTubeProcessingInput>;

export const youtubeProcessingFlow = ai.defineFlow(
  {
    name: 'youtubeProcessingFlow',
    inputSchema: YouTubeProcessingInput,
    outputSchema: YouTubeProcessingOutput,
  },
  async (input: YouTubeProcessingInputType) => {
    const { message, userId, processedVideos } = input;

    logger.info(`YOUTUBE FLOW: Processing ${processedVideos.length} YouTube videos`, { userId });

    if (processedVideos.length === 0) {
      return {
        response: 'No YouTube videos were provided for processing.',
      };
    }

    try {
      // Process the first YouTube video
      const video = processedVideos[0];
      
      if (!video.isYouTube) {
        throw new Error('Expected YouTube video but received regular video');
      }

      const responseText = await processYouTubeVideo(video, message);

      return {
        response: responseText || 'Sorry, I couldn\'t analyze the YouTube video content.',
      };

    } catch (error) {
      logger.error('YouTube processing failed', { error, userId });
      return {
        response: getYouTubeErrorMessage(error as Error),
      };
    }
  }
);

// Streaming function for YouTube processing
export async function streamYouTubeProcessingResponse(
  input: YouTubeProcessingInputType,
  onChunk: (chunk: string) => void
): Promise<string> {
  const { message, userId, processedVideos } = input;

  logger.info(`YOUTUBE FLOW: Streaming ${processedVideos.length} YouTube videos`, { userId });

  if (processedVideos.length === 0) {
    const errorResponse = 'No YouTube videos were provided for processing.';
    await onChunk(errorResponse);
    return errorResponse;
  }

  try {
    // Process the first YouTube video  
    const video = processedVideos[0];
    
    if (!video.isYouTube) {
      throw new Error('Expected YouTube video but received regular video');
    }

    const fullResponse = await streamYouTubeVideoProcessing(video, message, onChunk);

    logger.debug(`YOUTUBE FLOW: Streaming completed, response length: ${fullResponse.length}`);
    return fullResponse || 'Sorry, I couldn\'t analyze the YouTube video content.';

  } catch (error) {
    logger.error('YouTube streaming failed', { error, userId });
    const errorResponse = getYouTubeErrorMessage(error as Error);
    await onChunk(errorResponse);
    return errorResponse;
  }
}

/**
 * Process YouTube video with direct URL (no file upload needed) - matches legacy 1:1
 */
async function processYouTubeVideo(video: ProcessedVideo, message: string): Promise<string> {
  logger.info('Processing YouTube video', { videoId: video.videoId, url: video.url });

  // Create GoogleGenAI client - exactly like legacy
  const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });

  // Normalize YouTube URL like legacy
  const normalizedUrl = video.data; // Already normalized in VideoProcessor

  // Generate response with YouTube video context (direct URL processing) - exactly like legacy
  const response = await genaiClient.models.generateContent({
    model: botConfig.google.model,
    contents: createUserContent([
      {
        fileData: {
          fileUri: normalizedUrl, // Direct YouTube URL - no upload needed
        },
      },
      message,
    ]),
    config: GenerationConfigBuilder.build({
      temperature: 0.5,
      maxOutputTokens: 6144,
    }),
  });

  return response.text ?? 'YouTube video analysis completed but no response was generated.';
}

/**
 * Stream YouTube video processing - exactly like legacy pattern
 */
async function streamYouTubeVideoProcessing(
  video: ProcessedVideo, 
  message: string, 
  onChunk: (chunk: string) => void
): Promise<string> {
  logger.info('Streaming YouTube video processing', { videoId: video.videoId });

  // Create GoogleGenAI client - exactly like legacy
  const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });

  // Normalize YouTube URL like legacy
  const normalizedUrl = video.data; // Already normalized in VideoProcessor

  // Stream response generation - exactly like legacy
  const response = await genaiClient.models.generateContentStream({
    model: botConfig.google.model,
    contents: createUserContent([
      {
        fileData: {
          fileUri: normalizedUrl, // Direct YouTube URL - no upload needed
        },
      },
      message,
    ]),
    config: GenerationConfigBuilder.build({
      temperature: 0.5,
      maxOutputTokens: 6144,
    }),
  });

  let fullResponse = '';
  let chunkCount = 0;

  for await (const chunk of response) {
    const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
    if (chunkText) {
      chunkCount++;
      logger.debug(`YOUTUBE FLOW: Chunk ${chunkCount}, length: ${chunkText.length}`);
      fullResponse += chunkText;
      await onChunk(chunkText);
    }
  }

  logger.debug(`YOUTUBE FLOW: Streaming completed, chunks: ${chunkCount}, response length: ${fullResponse.length}`);
  return fullResponse;
}

/**
 * Get user-friendly error message for YouTube processing errors
 */
function getYouTubeErrorMessage(error: Error): string {
  const message = error.message.toLowerCase();

  if (message.includes('unavailable') || message.includes('not found')) {
    return 'That YouTube video is unavailable or has been removed.';
  } else if (message.includes('private') || message.includes('restricted')) {
    return 'That YouTube video is private or restricted and cannot be processed.';
  } else if (message.includes('invalid') || message.includes('malformed')) {
    return 'That doesn\'t appear to be a valid YouTube URL.';
  } else {
    return 'I had trouble processing that YouTube video. Please try again with a different video.';
  }
}