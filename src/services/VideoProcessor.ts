/**
 * @fileoverview Advanced video processing service with YouTube support and duration validation.
 * 
 * This service handles comprehensive video content processing for Discord messages,
 * including specialized YouTube handling and ffprobe-based validation:
 * - YouTube URL detection, validation, and normalization
 * - Regular video file processing with duration limits (30 seconds max)
 * - FFprobe integration for accurate video metadata extraction
 * - Temporary file management for validation operations
 * - Comprehensive error handling and cleanup for robust operations
 * 
 * Key Features:
 * - Multi-pattern YouTube URL detection with video ID extraction
 * - Duration validation using FFprobe to enforce content limits
 * - Temporary file download and cleanup for metadata analysis
 * - Support for multiple video formats (MP4, WebM, MOV, AVI, etc.)
 * - Separate processing pipelines for YouTube vs regular video content
 * 
 * Video Processing Pipeline:
 * 1. Detect video content in Discord messages (attachments + URLs)
 * 2. Classify as YouTube or regular video content
 * 3. For regular videos: Download, validate duration with FFprobe
 * 4. For YouTube: Extract video ID and normalize URL format
 * 5. Return ProcessedVideo interface for video-specific AI flows
 * 
 * Security and Validation:
 * - Domain whitelisting for non-YouTube video URLs
 * - File size limits (25MB for Discord Nitro users)
 * - Duration limits (30 seconds) to manage processing costs
 * - Temporary file cleanup to prevent storage leaks
 * 
 * YouTube Integration:
 * - Multiple URL pattern support (youtube.com, youtu.be, mobile variants)
 * - Video ID extraction and validation
 * - URL normalization to standard format
 * - No download required - direct processing via video flows
 * 
 * Usage Context:
 * Core dependency for video-specific flows (videoProcessingFlow, youtubeProcessingFlow),
 * called by DiscordBot service to process video content before AI analysis.
 */

import { Message, Attachment } from 'discord.js';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils/logger.js';

/**
 * Configuration for video processing
 */
const CONFIG = {
  MAX_FILE_SIZE: 25 * 1024 * 1024, // 25MB - Discord Nitro limit
  MAX_DURATION: 30, // 30 seconds
  DOWNLOAD_TIMEOUT: 30000, // 30 seconds
  ALLOWED_DOMAINS: [
    'cdn.discordapp.com',
    'media.discordapp.net',
    'tenor.com',
    'c.tenor.com',
    'giphy.com',
    'media.giphy.com',
    'i.giphy.com',
    'imgur.com',
    'i.imgur.com',
    // YouTube domains
    'youtube.com',
    'www.youtube.com',
    'youtu.be',
    'm.youtube.com',
  ],
  SUPPORTED_VIDEO_TYPES: [
    'video/mp4',
    'video/mpeg',
    'video/mov',
    'video/avi',
    'video/x-flv',
    'video/mpg',
    'video/webm',
    'video/wmv',
    'video/3gpp',
  ],
};

/**
 * YouTube URL patterns for detection
 */
const YOUTUBE_URL_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/g,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/g,
  /(?:https?:\/\/)?(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/g,
];

/**
 * Processed video content for Genkit
 */
export interface ProcessedVideo {
  type: 'video';
  mimeType: string;
  data: string; // Base64 data for regular videos, or file path for temp files
  filename?: string | undefined;
  size: number;
  duration?: number | undefined;
  isYouTube: boolean;
  videoId?: string | undefined; // YouTube video ID
  url: string;
}

/**
 * Video detection results
 */
export interface VideoDetection {
  attachments: Attachment[];
  videoUrls: string[];
  youtubeUrls: string[];
  hasVideos: boolean;
}

/**
 * Video duration validation result
 */
export interface VideoDurationValidation {
  isValid: boolean;
  duration?: number;
  error?: string;
}

/**
 * VideoProcessor handles Discord video attachments and URLs for multimodal content
 */
export class VideoProcessor {
  
  /**
   * Detect all video content in a Discord message
   */
  static detectVideos(message: Message): VideoDetection {
    const attachments = Array.from(message.attachments.values()).filter(
      attachment => attachment.contentType && this.isVideoContentType(attachment.contentType)
    );
    
    const allUrls = this.extractVideoUrls(message.content);
    const videoUrls = allUrls.filter(url => !this.isYouTubeURL(url));
    const youtubeUrls = allUrls.filter(url => this.isYouTubeURL(url));
    
    return {
      attachments,
      videoUrls,
      youtubeUrls,
      hasVideos: attachments.length > 0 || allUrls.length > 0,
    };
  }

  /**
   * Extract video URLs from message content
   */
  private static extractVideoUrls(content: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlRegex) || [];
    
    return urls.filter(url => {
      // Check if it's from an allowed domain
      if (!this.isAllowedDomain(url)) {
        logger.warn('Video URL blocked - not from allowed domain', { url });
        return false;
      }
      
      // Check if it looks like a video URL or is YouTube
      const videoPattern = /\.(mp4|mov|avi|webm|wmv|flv|mpg|mpeg|3gpp)(\\?|$)/i;
      const isVideoFile = videoPattern.test(url);
      const isYouTube = this.isYouTubeURL(url);
      
      if (!isVideoFile && !isYouTube) {
        logger.debug('URL skipped - not a video file or YouTube', { url });
        return false;
      }
      
      return true;
    });
  }

  /**
   * Process Discord video attachment
   */
  static async processVideoAttachment(attachment: Attachment): Promise<ProcessedVideo | null> {
    try {
      // Validate file size
      if (attachment.size > CONFIG.MAX_FILE_SIZE) {
        logger.warn('Video attachment too large', { 
          filename: attachment.name, 
          size: attachment.size 
        });
        return null;
      }

      // Check if it's a supported video type
      if (!attachment.contentType || !CONFIG.SUPPORTED_VIDEO_TYPES.includes(attachment.contentType)) {
        logger.warn('Unsupported video attachment type', { 
          filename: attachment.name, 
          contentType: attachment.contentType 
        });
        return null;
      }

      // Validate video duration
      const validation = await this.validateVideoDuration(attachment.url);
      if (!validation.isValid) {
        logger.warn('Video attachment duration validation failed', { 
          filename: attachment.name, 
          error: validation.error 
        });
        return null;
      }

      // For regular videos, just store the URL - we'll download directly in the flow
      return {
        type: 'video',
        mimeType: attachment.contentType,
        data: attachment.url, // Store URL instead of base64
        filename: attachment.name || undefined,
        size: attachment.size,
        duration: validation.duration || undefined,
        isYouTube: false,
        url: attachment.url,
      };

    } catch (error) {
      logger.error('Error processing video attachment', { 
        filename: attachment.name, 
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Process video URL
   */
  static async processVideoUrl(url: string): Promise<ProcessedVideo | null> {
    try {
      // Check if it's YouTube
      if (this.isYouTubeURL(url)) {
        return this.processYouTubeUrl(url);
      }

      // Validate domain
      if (!this.isAllowedDomain(url)) {
        logger.warn('Video URL blocked - domain not in whitelist', { url });
        return null;
      }

      // Validate video duration
      const validation = await this.validateVideoDuration(url);
      if (!validation.isValid) {
        logger.warn('Video URL duration validation failed', { 
          url, 
          error: validation.error 
        });
        return null;
      }

      // Detect MIME type from URL
      const mimeType = this.detectMimeType(url);

      return {
        type: 'video',
        mimeType,
        data: url, // Store URL instead of base64
        filename: this.extractFilename(url) || undefined,
        size: 0, // We'll get actual size during download in the flow
        duration: validation.duration || undefined,
        isYouTube: false,
        url,
      };

    } catch (error) {
      logger.error('Error processing video URL', { 
        url, 
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Process YouTube URL (no download needed)
   */
  private static processYouTubeUrl(url: string): ProcessedVideo {
    const videoId = this.extractYouTubeVideoId(url);
    const normalizedUrl = this.normalizeYouTubeURL(url);
    
    return {
      type: 'video',
      mimeType: 'video/youtube',
      data: normalizedUrl, // Store normalized URL instead of base64
      filename: videoId ? `youtube_${videoId}.mp4` : undefined,
      size: 0, // YouTube videos don't have a size
      isYouTube: true,
      videoId: videoId || undefined,
      url: normalizedUrl,
    };
  }

  /**
   * Validate video duration using ffprobe
   */
  static async validateVideoDuration(url: string): Promise<VideoDurationValidation> {
    let tempFilePath: string | null = null;
    
    try {
      // Skip duration validation for YouTube URLs
      if (this.isYouTubeURL(url)) {
        return { isValid: true };
      }

      // Download video to temporary file
      tempFilePath = await this.downloadVideoToTempFile(url);
      
      // Get duration using ffprobe
      const duration = await this.getVideoDurationWithFFProbe(tempFilePath);
      
      // Check duration limit
      if (duration > CONFIG.MAX_DURATION) {
        return {
          isValid: false,
          duration,
          error: `Video duration ${duration.toFixed(1)}s exceeds maximum of ${CONFIG.MAX_DURATION}s`
        };
      }
      
      return {
        isValid: true,
        duration
      };
      
    } catch (error) {
      logger.error('Video duration validation failed', { url, error });
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Duration validation failed'
      };
    } finally {
      // Clean up temporary file
      if (tempFilePath) {
        try {
          await fs.unlink(tempFilePath);
        } catch (cleanupError) {
          logger.error('Failed to clean up temp video file', { tempFilePath, cleanupError });
        }
      }
    }
  }

  /**
   * Download video to temporary file for ffprobe analysis
   */
  private static async downloadVideoToTempFile(url: string): Promise<string> {
    const tempDir = os.tmpdir();
    const fileName = `video_${Date.now()}_${Math.random().toString(36).substring(7)}.tmp`;
    const tempFilePath = path.join(tempDir, fileName);

    const parsedUrl = new URL(url);
    const httpModule = parsedUrl.protocol === 'https:' ? https : http;

    return new Promise((resolve, reject) => {
      const request = httpModule.get(url, (response) => {
        // Check HTTP status
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) {
          return reject(new Error(`HTTP ${response.statusCode}: Failed to download from ${url}`));
        }

        // Create write stream to temporary file
        const fileStream = createWriteStream(tempFilePath);

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          resolve(tempFilePath);
        });

        fileStream.on('error', (error: Error) => {
          reject(new Error(`File write error: ${error.message}`));
        });

        response.on('error', (error: Error) => {
          reject(new Error(`Response error: ${error.message}`));
        });
      });

      // Set timeout
      request.setTimeout(CONFIG.DOWNLOAD_TIMEOUT, () => {
        request.destroy();
        reject(new Error('Download timed out'));
      });

      // Handle request errors
      request.on('error', (error: Error) => {
        reject(new Error(`Request error: ${error.message}`));
      });
    });
  }

  /**
   * Get video duration using ffprobe
   */
  private static async getVideoDurationWithFFProbe(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      const ffprobe = spawn('ffprobe', [
        '-v', 'quiet',
        '-show_entries', 'format=duration',
        '-of', 'csv=p=0',
        filePath,
      ]);

      let output = '';
      let errorOutput = '';

      ffprobe.stdout.on('data', (data) => {
        output += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      ffprobe.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`ffprobe failed with code ${code}: ${errorOutput}`));
          return;
        }

        const duration = parseFloat(output.trim());
        if (isNaN(duration)) {
          reject(new Error(`Could not parse duration from ffprobe output: ${output}`));
          return;
        }

        resolve(duration);
      });

      ffprobe.on('error', (error) => {
        reject(new Error(`ffprobe spawn error: ${error.message}`));
      });
    });
  }


  /**
   * Check if content type is a video
   */
  private static isVideoContentType(contentType: string): boolean {
    return CONFIG.SUPPORTED_VIDEO_TYPES.includes(contentType);
  }

  /**
   * Check if URL domain is allowed
   */
  private static isAllowedDomain(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      return CONFIG.ALLOWED_DOMAINS.some(domain => 
        parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }

  /**
   * Check if URL is a YouTube URL
   */
  static isYouTubeURL(url: string): boolean {
    return YOUTUBE_URL_PATTERNS.some(pattern => {
      pattern.lastIndex = 0; // Reset regex state
      return pattern.test(url);
    });
  }

  /**
   * Extract YouTube video ID from URL
   */
  static extractYouTubeVideoId(url: string): string | null {
    for (const pattern of YOUTUBE_URL_PATTERNS) {
      pattern.lastIndex = 0; // Reset regex state
      const match = pattern.exec(url);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Normalize YouTube URL to standard format
   */
  static normalizeYouTubeURL(url: string): string {
    const videoId = this.extractYouTubeVideoId(url);
    if (!videoId) {
      return url; // Return original if we can't extract ID
    }
    return `https://www.youtube.com/watch?v=${videoId}`;
  }

  /**
   * Detect MIME type from URL extension
   */
  private static detectMimeType(url: string): string {
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
   * Extract filename from URL
   */
  private static extractFilename(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      return pathname.split('/').pop() || 'video';
    } catch {
      return 'video';
    }
  }
}