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
import { flowLogger } from '../debug/flow-logger.js';
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
  onChunk: (chunk: string) => void,
  flowId?: string
): Promise<string> {
  const { message, userId, processedVideos } = input;

  logger.info(`VIDEO FLOW: Streaming ${processedVideos.length} videos`, { userId });

  if (flowId) {
    flowLogger.logFlow(flowId, `Starting video processing streaming`, 'info', {
      userId,
      videoCount: processedVideos.length,
      videos: processedVideos.map(v => ({
        type: v.type,
        filename: v.filename,
        size: v.size,
        duration: v.duration,
        isYouTube: v.isYouTube,
        videoId: v.videoId,
        url: v.url
      })), // FULL VIDEO LIST - not trimmed!
      query: message,
      queryLength: message.length,
      videoProcessingEnabled: true
    });
  }

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
      fullResponse = await streamYouTubeVideoProcessing(video, message, onChunk, flowId);
    } else {
      fullResponse = await streamRegularVideoProcessing(video, message, onChunk, flowId);
    }

    logger.debug(`VIDEO FLOW: Streaming completed, response length: ${fullResponse.length}`);
    return fullResponse || 'Sorry, I couldn\'t analyze the video content.';

  } catch (error) {
    logger.error('Video streaming failed', { error, userId });
    
    // Log error for flow monitoring
    if (flowId) {
      flowLogger.onFlowError(flowId, error as Error, {
        userId,
        videoCount: processedVideos.length,
        query: message,
        flowType: 'video-processing',
        streamingError: true
      });
    }
    
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
  onChunk: (chunk: string) => void,
  flowId?: string
): Promise<string> {
  logger.info('Streaming YouTube video processing', { videoId: video.videoId });

  if (flowId) {
    flowLogger.logFlow(flowId, `Starting YouTube video streaming analysis`, 'info', {
      videoId: video.videoId,
      videoUrl: video.data,
      filename: video.filename,
      size: video.size,
      duration: video.duration,
      query: message,
      queryLength: message.length,
      youTubeProcessing: true,
      directUrlAccess: true
    });
  }

  const prompt = [
    { text: message },
    {
      media: {
        url: video.data // YouTube URL
      }
    }
  ];

  if (flowId) {
    flowLogger.logFlow(flowId, `Starting AI model streaming call for YouTube video analysis`, 'info', {
      model: 'googleai/gemini-2.0-flash-lite (implicit)',
      temperature: 0.5,
      maxOutputTokens: 6144,
      systemPrompt: 'You are a helpful Discord bot assistant. Analyze this video content.',
      userMessage: message,
      fullPrompt: [
        { text: 'You are a helpful Discord bot assistant. Analyze this video content.' },
        ...prompt
      ], // FULL PROMPT - not trimmed!
      videoUrl: video.data,
      videoId: video.videoId,
      thinkingEnabled: botConfig.thinking.enabled,
      thinkingBudget: botConfig.thinking.budget,
      configUsed: GenerationConfigBuilder.build({ temperature: 0.5, maxOutputTokens: 6144 })
    });
  }

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
  let thinkingChunkCount = 0;
  let allThinkingContent = '';
  
  for await (const chunk of stream) {
    // CRITICAL: Filter out thinking chunks, only process final response text
    const chunkAny = chunk as any;
    if (chunk.text && !chunkAny.thoughts) {
      chunkCount++;
      logger.debug(`VIDEO FLOW: YouTube response chunk ${chunkCount}, length: ${chunk.text.length}`);
      fullResponse += chunk.text;
      await onChunk(chunk.text);

      // Log each response chunk for flow monitoring
      if (flowId) {
        flowLogger.logFlow(flowId, `AI response chunk #${chunkCount} received`, 'debug', {
          chunkNumber: chunkCount,
          chunkLength: chunk.text.length,
          fullChunkContent: chunk.text, // FULL CHUNK - not trimmed!
          totalResponseLength: fullResponse.length,
          videoProcessingType: 'youtube'
        });
      }
    } else if (chunkAny.thoughts) {
      // Log thinking activity but don't stream to user
      thinkingChunkCount++;
      allThinkingContent += chunkAny.thoughts;
      logger.debug(`VIDEO FLOW: Processing thinking chunk ${thinkingChunkCount} (${chunkAny.thoughts.length} chars) - not streaming to user`);
      
      // Log thinking chunks for flow monitoring
      if (flowId) {
        flowLogger.logFlow(flowId, `AI thinking chunk #${thinkingChunkCount} received`, 'debug', {
          thinkingChunkNumber: thinkingChunkCount,
          thinkingChunkLength: chunkAny.thoughts.length,
          fullThinkingContent: chunkAny.thoughts, // FULL THINKING - not trimmed!
          totalThinkingLength: allThinkingContent.length,
          videoProcessingType: 'youtube'
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
      videoId: video.videoId,
      videoUrl: video.data,
      temperature: 0.5,
      maxOutputTokens: 6144,
      thinkingEnabled: botConfig.thinking.enabled,
      streamingCompleted: true,
      videoProcessingType: 'youtube'
    });
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
  onChunk: (chunk: string) => void,
  flowId?: string
): Promise<string> {
  let tempFilePath: string | null = null;
  let uploadedFileId: string | null = null;
  
  try {
    logger.info('Streaming regular video processing', { 
      filename: video.filename, 
      size: video.size 
    });

    if (flowId) {
      flowLogger.logFlow(flowId, `Starting regular video streaming analysis with File API`, 'info', {
        filename: video.filename,
        size: video.size,
        mimeType: video.mimeType,
        duration: video.duration,
        videoUrl: video.url,
        query: message,
        queryLength: message.length,
        regularVideoProcessing: true,
        fileApiUploadRequired: true
      });
    }

    // Create GoogleGenAI client
    const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });

    // Download video directly to temporary file (like legacy)
    tempFilePath = await downloadVideoToTempFile(video.data); // video.data is the URL

    // Determine MIME type from URL (like legacy)
    const mimeType = getMimeTypeFromUrl(video.data);

    // Upload video to Gemini File API
    logger.debug('Uploading video to Gemini File API');
    
    if (flowId) {
      flowLogger.logFlow(flowId, `Starting video upload to Gemini File API`, 'info', {
        tempFilePath: tempFilePath,
        mimeType: mimeType,
        fileSize: video.size,
        filename: video.filename
      });
    }
    
    const videoFile = await genaiClient.files.upload({
      file: tempFilePath,
      config: { mimeType },
    });
    uploadedFileId = videoFile.name ?? null;
    logger.debug(`Video uploaded: ${videoFile.name ?? 'unknown'}`);

    if (flowId) {
      flowLogger.logFlow(flowId, `Video upload to Gemini File API completed`, 'info', {
        uploadedFileId: uploadedFileId,
        fileName: videoFile.name,
        fileState: 'uploading',
        mimeType: mimeType
      });
    }

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

    if (flowId) {
      flowLogger.logFlow(flowId, `Video processing by Gemini completed, starting AI analysis streaming`, 'info', {
        fileName: fileName,
        fileUri: file.uri,
        fileMimeType: file.mimeType,
        fileState: file.state,
        processingCompleted: true
      });
    }

    if (flowId) {
      flowLogger.logFlow(flowId, `Starting AI model streaming call for regular video analysis`, 'info', {
        model: botConfig.google.model,
        temperature: 0.7,
        maxOutputTokens: 4096,
        videoUri: file.uri,
        videoMimeType: file.mimeType,
        userMessage: message,
        fullContents: createUserContent([
          createPartFromUri(file.uri ?? '', file.mimeType ?? video.mimeType),
          message,
        ]), // FULL CONTENTS - not trimmed!
        fileName: video.filename,
        fileSize: video.size
      });
    }

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

        // Log each response chunk for flow monitoring
        if (flowId) {
          flowLogger.logFlow(flowId, `AI response chunk #${chunkCount} received`, 'debug', {
            chunkNumber: chunkCount,
            chunkLength: chunkText.length,
            fullChunkContent: chunkText, // FULL CHUNK - not trimmed!
            totalResponseLength: fullResponse.length,
            videoProcessingType: 'regular'
          });
        }
      }
    }

    // Log completion of AI model call with comprehensive statistics
    if (flowId) {
      flowLogger.logFlow(flowId, `AI model streaming call completed`, 'info', {
        model: botConfig.google.model,
        totalResponseChunks: chunkCount,
        finalResponseLength: fullResponse.length,
        fullFinalResponse: fullResponse, // FULL RESPONSE - not trimmed!
        fileName: video.filename,
        fileSize: video.size,
        videoUri: file.uri,
        videoMimeType: file.mimeType,
        temperature: 0.7,
        maxOutputTokens: 4096,
        streamingCompleted: true,
        videoProcessingType: 'regular'
      });
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