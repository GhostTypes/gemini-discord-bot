/**
 * @fileoverview Video processing flow with multimodal analysis and streaming support.
 * 
 * Provides comprehensive video content analysis using Google's multimodal AI
 * capabilities. Key features include:
 * - Direct video file processing from Discord attachments
 * - Temporary file management with automatic cleanup
 * - Google File API integration for large video processing
 * - Streaming responses with real-time video analysis feedback
 * - Support for multiple video formats (MP4, WebM, MOV, etc.)
 * - Intelligent video content understanding and description
 * 
 * Video Processing Pipeline:
 * 1. Download video from Discord CDN to temporary file
 * 2. Upload to Google File API for processing
 * 3. Analyze video content using Google's multimodal models
 * 4. Stream analysis results back to Discord with proper formatting
 * 5. Clean up temporary files and uploaded resources
 * 
 * Security and Resource Management:
 * - Automatic temporary file cleanup on completion or error
 * - Google File API resource management with proper deletion
 * - File size and duration limits for processing safety
 * - Comprehensive error handling with user-friendly messaging
 */

import { ai } from '../genkit.config.js';
import { z } from 'zod';
import { logger } from '../utils/logger.js';
import { ProcessedVideo } from '../services/VideoProcessor.js';
import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import { botConfig } from '../config/environment.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';

const ProcessedVideoSchema = z.object({
  type: z.enum(['video']),
  mimeType: z.string(),
  data: z.string(),
  filename: z.string().optional(),
  size: z.number(),
  duration: z.number().optional(),
  isYouTube: z.boolean(),
  videoId: z.string().optional(),
  url: z.string(),
});

const VideoProcessingInput = z.object({
  message: z.string(),
  userId: z.string(),
  processedVideos: z.array(ProcessedVideoSchema),
});

const VideoProcessingOutput = z.object({
  response: z.string(),
});

export type VideoProcessingInputType = z.infer<typeof VideoProcessingInput>;

export const videoProcessingFlow = ai.defineFlow(
  {
    name: 'videoProcessingFlow',
    inputSchema: VideoProcessingInput,
    outputSchema: VideoProcessingOutput,
  },
  async (input: VideoProcessingInputType) => {
    const { message, userId, processedVideos } = input;

    logger.info(`VIDEO FLOW: Processing ${processedVideos.length} videos`, { userId });

    if (processedVideos.length === 0) {
      return {
        response: 'No videos were provided for processing.',
      };
    }

    try {
      // Process the first video (prioritize YouTube URLs)
      const video = processedVideos.find(v => v.isYouTube) || processedVideos[0];
      
      let responseText: string;
      
      if (video.isYouTube) {
        responseText = await processYouTubeVideo(video, message);
      } else {
        responseText = await processRegularVideo(video, message);
      }

      return {
        response: responseText || 'Sorry, I couldn\'t analyze the video content.',
      };

    } catch (error) {
      logger.error('Video processing failed', { error, userId });
      return {
        response: getVideoErrorMessage(error as Error),
      };
    }
  }
);

// Streaming function for video processing
export async function streamVideoProcessingResponse(
  input: VideoProcessingInputType,
  onChunk: (chunk: string) => void
): Promise<string> {
  const { message, userId, processedVideos } = input;

  logger.info(`VIDEO FLOW: Streaming ${processedVideos.length} videos`, { userId });

  if (processedVideos.length === 0) {
    const errorResponse = 'No videos were provided for processing.';
    await onChunk(errorResponse);
    return errorResponse;
  }

  try {
    // Process the first video (prioritize YouTube URLs)
    const video = processedVideos.find(v => v.isYouTube) || processedVideos[0];
    
    let fullResponse: string;
    
    if (video.isYouTube) {
      fullResponse = await streamYouTubeVideoProcessing(video, message, onChunk);
    } else {
      fullResponse = await streamRegularVideoProcessing(video, message, onChunk);
    }

    logger.debug(`VIDEO FLOW: Streaming completed, response length: ${fullResponse.length}`);
    return fullResponse || 'Sorry, I couldn\'t analyze the video content.';

  } catch (error) {
    logger.error('Video streaming failed', { error, userId });
    const errorResponse = getVideoErrorMessage(error as Error);
    await onChunk(errorResponse);
    return errorResponse;
  }
}

/**
 * Process YouTube video with direct URL (no file upload needed)
 */
async function processYouTubeVideo(video: ProcessedVideo, message: string): Promise<string> {
  logger.info('Processing YouTube video', { videoId: video.videoId, url: video.url });

  // Use direct Genkit generation for YouTube
  const prompt = [
    { text: message },
    {
      media: {
        url: video.data // YouTube URL stored in data field
      }
    }
  ];

  const { text } = await ai.generate({
    prompt: [
      { text: 'You are a helpful Discord bot assistant. Analyze this video content.' },
      ...prompt
    ],
    config: GenerationConfigBuilder.build({
      temperature: 0.5, // Lower for analysis tasks
      maxOutputTokens: 6144,
    }),
  });
  return text || 'YouTube video analysis completed but no response was generated.';
}

/**
 * Process regular video using Google File API
 */
async function processRegularVideo(video: ProcessedVideo, message: string): Promise<string> {
  let tempFilePath: string | null = null;
  let uploadedFileId: string | null = null;
  
  try {
    logger.info('Processing regular video with File API', { 
      filename: video.filename, 
      size: video.size,
      mimeType: video.mimeType 
    });

    // Create GoogleGenAI client
    const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });

    // Download video directly to temporary file (like legacy)
    tempFilePath = await downloadVideoToTempFile(video.data); // video.data is the URL

    // Determine MIME type from URL (like legacy)
    const mimeType = getMimeTypeFromUrl(video.data);

    // Upload video to Gemini File API
    logger.debug('Uploading video to Gemini File API');
    const videoFile = await genaiClient.files.upload({
      file: tempFilePath,
      config: { mimeType },
    });
    uploadedFileId = videoFile.name ?? null;
    logger.debug(`Video uploaded: ${videoFile.name}`);

    // Wait for processing to complete
    const fileName = videoFile.name;
    if (!fileName) {
      throw new Error('Failed to get uploaded file name from Gemini API');
    }

    let file = await genaiClient.files.get({ name: fileName });
    while (file.state === 'PROCESSING') {
      logger.debug('Waiting for video processing...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      file = await genaiClient.files.get({ name: fileName });
    }

    if (file.state === 'FAILED') {
      throw new Error(`Video processing failed: ${file.error ?? 'Unknown error'}`);
    }

    logger.debug(`Video processing complete: ${file.state}`);

    // Generate response with video context
    const response = await genaiClient.models.generateContent({
      model: botConfig.google.model,
      contents: createUserContent([
        createPartFromUri(file.uri ?? '', file.mimeType ?? video.mimeType),
        message,
      ]),
      config: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    return response.text ?? 'Video analysis completed but no response was generated.';

  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        logger.error('Failed to clean up temp video file', { tempFilePath, cleanupError });
      }
    }

    // Clean up uploaded file
    if (uploadedFileId) {
      try {
        const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });
        await genaiClient.files.delete({ name: uploadedFileId });
      } catch (cleanupError) {
        logger.error('Failed to clean up uploaded video file', { uploadedFileId, cleanupError });
      }
    }
  }
}

/**
 * Stream YouTube video processing
 */
async function streamYouTubeVideoProcessing(
  video: ProcessedVideo, 
  message: string, 
  onChunk: (chunk: string) => void
): Promise<string> {
  logger.info('Streaming YouTube video processing', { videoId: video.videoId });

  const prompt = [
    { text: message },
    {
      media: {
        url: video.data // YouTube URL
      }
    }
  ];

  const { stream } = await ai.generateStream({
    prompt: [
      { text: 'You are a helpful Discord bot assistant. Analyze this video content.' },
      ...prompt
    ],
    config: GenerationConfigBuilder.build({
      temperature: 0.5, // Lower for analysis tasks
      maxOutputTokens: 6144,
    }),
  });

  let fullResponse = '';
  let chunkCount = 0;
  
  for await (const chunk of stream) {
    // CRITICAL: Filter out thinking chunks, only process final response text
    const chunkAny = chunk as any;
    if (chunk.text && !chunkAny.thoughts) {
      chunkCount++;
      logger.debug(`VIDEO FLOW: YouTube response chunk ${chunkCount}, length: ${chunk.text.length}`);
      fullResponse += chunk.text;
      await onChunk(chunk.text);
    } else if (chunkAny.thoughts) {
      // Log thinking activity but don't stream to user
      logger.debug(`VIDEO FLOW: Processing thinking chunk (${chunkAny.thoughts.length} chars) - not streaming to user`);
    }
  }

  // Log thinking usage if enabled
  if (botConfig.thinking.enabled) {
    logger.info(`VIDEO FLOW: YouTube completed with thinking enabled (budget: ${botConfig.thinking.budget === -1 ? 'dynamic' : botConfig.thinking.budget})`);
  }

  logger.debug(`VIDEO FLOW: YouTube streaming completed, chunks: ${chunkCount}, response length: ${fullResponse.length}`);
  return fullResponse;
}

/**
 * Stream regular video processing using File API
 */
async function streamRegularVideoProcessing(
  video: ProcessedVideo, 
  message: string, 
  onChunk: (chunk: string) => void
): Promise<string> {
  let tempFilePath: string | null = null;
  let uploadedFileId: string | null = null;
  
  try {
    logger.info('Streaming regular video processing', { 
      filename: video.filename, 
      size: video.size 
    });

    // Create GoogleGenAI client
    const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });

    // Download video directly to temporary file (like legacy)
    tempFilePath = await downloadVideoToTempFile(video.data); // video.data is the URL

    // Determine MIME type from URL (like legacy)
    const mimeType = getMimeTypeFromUrl(video.data);

    // Upload video to Gemini File API
    logger.debug('Uploading video to Gemini File API');
    const videoFile = await genaiClient.files.upload({
      file: tempFilePath,
      config: { mimeType },
    });
    uploadedFileId = videoFile.name ?? null;
    logger.debug(`Video uploaded: ${videoFile.name ?? 'unknown'}`);

    // Wait for processing to complete
    const fileName = videoFile.name;
    if (!fileName) {
      throw new Error('Failed to get uploaded file name from Gemini API');
    }
    let file = await genaiClient.files.get({ name: fileName });
    while (file.state === 'PROCESSING') {
      logger.debug('Waiting for video processing...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      file = await genaiClient.files.get({ name: fileName });
    }

    if (file.state === 'FAILED') {
      throw new Error(`Video processing failed: ${file.error ?? 'Unknown error'}`);
    }

    logger.debug(`Video processing complete: ${file.state}`);

    // Stream response generation
    const response = await genaiClient.models.generateContentStream({
      model: botConfig.google.model,
      contents: createUserContent([
        createPartFromUri(file.uri ?? '', file.mimeType ?? video.mimeType),
        message,
      ]),
      config: {
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    });

    let fullResponse = '';
    let chunkCount = 0;

    for await (const chunk of response) {
      const chunkText = chunk.candidates?.[0]?.content?.parts?.[0]?.text;
      if (chunkText) {
        chunkCount++;
        logger.debug(`VIDEO FLOW: Regular video chunk ${chunkCount}, length: ${chunkText.length}`);
        fullResponse += chunkText;
        await onChunk(chunkText);
      }
    }

    logger.debug(`VIDEO FLOW: Regular video streaming completed, chunks: ${chunkCount}, response length: ${fullResponse.length}`);
    return fullResponse;

  } finally {
    // Clean up temporary file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (cleanupError) {
        logger.error('Failed to clean up temp video file', { tempFilePath, cleanupError });
      }
    }

    // Clean up uploaded file
    if (uploadedFileId) {
      try {
        const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });
        await genaiClient.files.delete({ name: uploadedFileId });
      } catch (cleanupError) {
        logger.error('Failed to clean up uploaded video file', { uploadedFileId, cleanupError });
      }
    }
  }
}

/**
 * Download video to temporary file for File API upload (from legacy)
 */
async function downloadVideoToTempFile(url: string): Promise<string> {
  logger.debug('Starting video download', { url });
  
  const tempDir = os.tmpdir();
  const fileName = `video_${Date.now()}_${Math.random().toString(36).substring(7)}.tmp`;
  const tempFilePath = path.join(tempDir, fileName);

  logger.debug('Download configuration', { tempDir, fileName, tempFilePath });

  const parsedUrl = new URL(url);
  const httpModule = parsedUrl.protocol === 'https:' ? https : http;
  
  logger.debug('HTTP module selected', { protocol: parsedUrl.protocol, hostname: parsedUrl.hostname });

  return new Promise((resolve, reject) => {
    let fileStream: any = null;
    let resolved = false;

    const cleanup = async () => {
      if (fileStream) {
        fileStream.destroy();
      }
      try {
        await fs.unlink(tempFilePath);
      } catch {
        // Ignore cleanup errors
      }
    };

    logger.debug('Making HTTP request', { url });
    
    const request = httpModule.get(url, (response) => {
      logger.debug('HTTP response received', { 
        statusCode: response.statusCode, 
        headers: Object.keys(response.headers) 
      });
      
      // Check HTTP status
      if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
        cleanup();
        return reject(new Error(`HTTP ${response.statusCode}: Failed to download from ${url}`));
      }

      logger.debug('Creating file stream', { tempFilePath });
      // Create write stream to temporary file
      fileStream = createWriteStream(tempFilePath);

      response.pipe(fileStream);

      fileStream.on('finish', () => {
        if (!resolved) {
          resolved = true;
          resolve(tempFilePath);
        }
      });

      fileStream.on('error', (error: Error) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`File write error: ${error.message}`));
        }
      });

      response.on('error', (error: Error) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error(`Response error: ${error.message}`));
        }
      });
    });

    // Set timeout (30 seconds for video downloads)
    request.setTimeout(30000, () => {
      if (!resolved) {
        resolved = true;
        request.destroy();
        cleanup();
        reject(new Error('Download timed out after 30 seconds'));
      }
    });

    // Handle request errors
    request.on('error', (error: Error) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`Request error: ${error.message}`));
      }
    });
  });
}

/**
 * Determine MIME type from video URL (from legacy)
 */
function getMimeTypeFromUrl(url: string): string {
  const extension = url.split('.').pop()?.toLowerCase();

  switch (extension) {
    case 'mp4':
      return 'video/mp4';
    case 'mov':
      return 'video/mov';
    case 'avi':
      return 'video/avi';
    case 'webm':
      return 'video/webm';
    case 'wmv':
      return 'video/wmv';
    case 'flv':
      return 'video/x-flv';
    case 'mpg':
    case 'mpeg':
      return 'video/mpeg';
    case '3gpp':
      return 'video/3gpp';
    default:
      return 'video/mp4'; // Default fallback
  }
}

/**
 * Get user-friendly error message for video processing errors
 */
function getVideoErrorMessage(error: Error): string {
  const message = error.message.toLowerCase();

  if (message.includes('duration')) {
    return 'That video is too long. Please use videos shorter than 30 seconds.';
  } else if (message.includes('format') || message.includes('type')) {
    return 'That video format isn\'t supported. Please use MP4, MOV, WebM, or other common video formats.';
  } else if (message.includes('size') || message.includes('large')) {
    return 'That video file is too large. Please use videos smaller than 25MB.';
  } else if (message.includes('network') || message.includes('download')) {
    return 'I had trouble downloading that video. Please check the URL and try again.';
  } else if (message.includes('timeout')) {
    return 'The video processing took too long. Please try a shorter video.';
  } else if (message.includes('youtube') && (message.includes('unavailable') || message.includes('not found'))) {
    return 'That YouTube video is unavailable or has been removed.';
  } else if (message.includes('youtube') && (message.includes('private') || message.includes('restricted'))) {
    return 'That YouTube video is private or restricted and cannot be processed.';
  } else {
    return 'I had trouble processing that video. Please try again with a different video.';
  }
}