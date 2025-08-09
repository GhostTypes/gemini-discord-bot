/**
 * @fileoverview Secure media processing service for Discord attachments and whitelisted URLs.
 * 
 * This service handles the processing of image and media content from Discord messages,
 * providing secure download, validation, and conversion capabilities:
 * - Strict domain whitelisting for security (Discord CDN, Imgur, Tenor, Giphy)
 * - Size validation and timeout protection for downloads
 * - Base64 encoding for Genkit-compatible media processing
 * - Comprehensive error handling and logging for failed operations
 * - Support for common image formats (JPEG, PNG, WebP, GIF)
 * 
 * Key Security Features:
 * - Whitelist-only domain validation to prevent malicious URL processing
 * - File size limits aligned with Discord's constraints (8MB max)
 * - Download timeouts to prevent hanging operations
 * - MIME type validation for supported media formats
 * - Comprehensive logging for security auditing
 * 
 * Supported Domains:
 * - Discord CDN (cdn.discordapp.com, media.discordapp.net)
 * - Popular media platforms (Tenor, Giphy, Imgur)
 * - Strict hostname matching with subdomain support
 * 
 * Processing Pipeline:
 * 1. Detect media content in Discord messages
 * 2. Validate domains and file types
 * 3. Download with size and timeout limits
 * 4. Convert to base64 for AI processing
 * 5. Return ProcessedMedia interface for multimodal flows
 * 
 * Usage Context:
 * Core dependency for multimodal chat flows, called by DiscordBot service
 * to process images and media before sending to AI flows for analysis.
 */

import { Message, Attachment } from 'discord.js';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import { logger } from '../utils/logger.js';

/**
 * Configuration for media processing
 */
const CONFIG = {
  MAX_FILE_SIZE: 8 * 1024 * 1024, // 8MB - Discord's limit
  DOWNLOAD_TIMEOUT: 10000, // 10 seconds
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
  ],
  SUPPORTED_IMAGE_TYPES: [
    'image/jpeg',
    'image/jpg', 
    'image/png',
    'image/webp',
    'image/gif',
  ],
};

/**
 * Processed media content for Genkit
 */
export interface ProcessedMedia {
  type: 'image' | 'video' | 'pdf' | 'text';
  mimeType: string;
  data: string; // Base64 data
  filename?: string;
  size: number;
}

/**
 * Media detection results
 */
export interface MediaDetection {
  attachments: Attachment[];
  imageUrls: string[];
  hasMedia: boolean;
}

/**
 * MediaProcessor handles Discord attachments and URLs for multimodal content
 */
export class MediaProcessor {
  
  /**
   * Detect all media content in a Discord message
   */
  static detectMedia(message: Message): MediaDetection {
    const attachments = Array.from(message.attachments.values());
    const imageUrls = this.extractImageUrls(message.content);
    
    return {
      attachments,
      imageUrls, 
      hasMedia: attachments.length > 0 || imageUrls.length > 0,
    };
  }

  /**
   * Extract image URLs from message content (Discord CDN only for security)
   */
  private static extractImageUrls(content: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlRegex) || [];
    
    // Only allow image URLs from whitelisted domains
    return urls.filter(url => {
      // Check if it's from an allowed domain
      if (!this.isAllowedDomain(url)) {
        logger.warn('URL blocked - not from allowed domain', { url });
        return false;
      }
      
      // Check if it looks like an image URL or is from a media platform
      const imagePattern = /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i;
      const mediaPlatformPatterns = [
        /imgur\.com\/[a-zA-Z0-9]+/i,        // Imgur direct links
        /tenor\.com\/view\//i,              // Tenor GIF links
        /giphy\.com\/gifs\//i,              // Giphy GIF links
        /media\.giphy\.com\/media\//i,      // Giphy media links
      ];
      
      const isImage = imagePattern.test(url);
      const isMediaPlatform = mediaPlatformPatterns.some(pattern => pattern.test(url));
      
      if (!isImage && !isMediaPlatform) {
        logger.debug('URL skipped - not an image or media platform link', { url });
        return false;
      }
      
      return true;
    });
  }

  /**
   * Process Discord attachment into Genkit-compatible format
   */
  static async processAttachment(attachment: Attachment): Promise<ProcessedMedia | null> {
    try {
      // Validate file size
      if (attachment.size > CONFIG.MAX_FILE_SIZE) {
        logger.warn('Attachment too large', { 
          filename: attachment.name, 
          size: attachment.size 
        });
        return null;
      }

      // Check if it's a supported image type
      if (!CONFIG.SUPPORTED_IMAGE_TYPES.includes(attachment.contentType || '')) {
        logger.warn('Unsupported attachment type', { 
          filename: attachment.name, 
          contentType: attachment.contentType 
        });
        return null;
      }

      // Download and convert to base64
      const buffer = await this.downloadFromUrl(attachment.url);
      const base64Data = buffer.toString('base64');

      return {
        type: 'image',
        mimeType: attachment.contentType || 'image/jpeg',
        data: base64Data,
        filename: attachment.name,
        size: attachment.size,
      };

    } catch (error) {
      logger.error('Error processing attachment', { 
        filename: attachment.name, 
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Process image URL into Genkit-compatible format
   */
  static async processImageUrl(url: string): Promise<ProcessedMedia | null> {
    try {
      // Validate domain (strict security check)
      if (!this.isAllowedDomain(url)) {
        logger.warn('URL blocked - domain not in whitelist', { 
          url, 
          allowedDomains: CONFIG.ALLOWED_DOMAINS 
        });
        return null;
      }

      // Download image
      const buffer = await this.downloadFromUrl(url);
      
      // Validate size
      if (buffer.length > CONFIG.MAX_FILE_SIZE) {
        logger.warn('Downloaded image too large', { 
          url, 
          size: buffer.length 
        });
        return null;
      }

      // Detect MIME type from URL or default to JPEG
      const mimeType = this.detectMimeType(url);
      const base64Data = buffer.toString('base64');

      return {
        type: 'image',
        mimeType,
        data: base64Data,
        filename: this.extractFilename(url),
        size: buffer.length,
      };

    } catch (error) {
      logger.error('Error processing image URL', { 
        url, 
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Download content from URL with timeout and size limits
   */
  private static async downloadFromUrl(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const httpModule = parsedUrl.protocol === 'https:' ? https : http;
      
      const request = httpModule.get(url, { timeout: CONFIG.DOWNLOAD_TIMEOUT }, (response) => {
        // Check content length
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        if (contentLength > CONFIG.MAX_FILE_SIZE) {
          reject(new Error(`Content too large: ${contentLength} bytes`));
          return;
        }

        const chunks: Buffer[] = [];
        let totalSize = 0;

        response.on('data', (chunk: Buffer) => {
          totalSize += chunk.length;
          if (totalSize > CONFIG.MAX_FILE_SIZE) {
            reject(new Error(`Content too large: ${totalSize} bytes`));
            return;
          }
          chunks.push(chunk);
        });

        response.on('end', () => {
          const buffer = Buffer.concat(chunks);
          resolve(buffer);
        });

        response.on('error', reject);
      });

      request.on('error', reject);
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Download timeout'));
      });
    });
  }

  /**
   * Check if URL domain is allowed (strict whitelist for security)
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
   * Detect MIME type from URL extension
   */
  private static detectMimeType(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      default:
        return 'image/jpeg'; // Default fallback
    }
  }

  /**
   * Extract filename from URL
   */
  private static extractFilename(url: string): string {
    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname;
      return pathname.split('/').pop() || 'image';
    } catch {
      return 'image';
    }
  }
}