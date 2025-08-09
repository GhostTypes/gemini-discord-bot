/**
 * @fileoverview Content detection and analysis service for Discord message processing.
 * 
 * Provides comprehensive analysis of Discord message content to determine
 * appropriate processing strategies. Key capabilities include:
 * - Generic cached attachment detection for all supported file types
 * - URL detection and categorization (web URLs, YouTube, etc.)
 * - Video content identification and format validation
 * - PDF document detection and processing requirements
 * - Multimodal content analysis combining text, media, and attachments
 * - Integration with MessageCacheService for attachment caching optimization
 * 
 * Content Analysis Features:
 * - Cached attachment retrieval organized by type (images, PDFs, videos, etc.)
 * - URL extraction and validation with specialized YouTube detection
 * - Video format support detection (MP4, WebM, MOV, etc.)
 * - PDF document identification and processing requirements
 * - Multimodal content flag determination for appropriate flow routing
 * 
 * The service works closely with FlowOrchestrator to provide detailed content
 * analysis that enables intelligent routing decisions and optimizes processing
 * by leveraging cached data when available.
 */

import { Message } from 'discord.js';
import { UrlDetector } from '../flows/schemas/webContext.js';
import { VideoProcessor, ProcessedVideo } from './VideoProcessor.js';
import { MediaProcessor, ProcessedMedia } from './MediaProcessor.js';
import { MessageCacheService } from './MessageCacheService.js';
import { logger } from '../utils/logger.js';

export interface ContentAnalysis {
  hasAttachments: boolean;
  hasUrls: boolean;
  isMultimodal: boolean;
  hasWebUrls: boolean;
  hasVideos: boolean;
  hasPDFs: boolean;
  webUrls: string[];
  videoDetection: {
    hasVideos: boolean;
    attachments: any[];
    videoUrls: string[];
    youtubeUrls: string[];
  };
  pdfDetection: {
    hasPDFs: boolean;
    pdfUrls: string[];
  };
  // Simplified generic attachment caching
  attachmentCache: {
    hasCachedData: boolean;
    cachedAttachments: ProcessedMedia[]; // All cached attachments as ProcessedMedia
    attachmentsByType: Map<string, ProcessedMedia[]>; // Organized by type for easy access
  };
}

export class ContentDetectionService {
  private messageCacheService: MessageCacheService;

  constructor(messageCacheService: MessageCacheService) {
    this.messageCacheService = messageCacheService;
  }

  /**
   * Generic method to get all cached attachments as ProcessedMedia
   * Works with any attachment type and is easily extensible
   */
  private async getCachedAttachmentsFromMessages(message: Message, referencedMessage: Message | null): Promise<{
    hasCachedData: boolean;
    cachedAttachments: ProcessedMedia[];
    attachmentsByType: Map<string, ProcessedMedia[]>;
  }> {
    const cachedAttachments: ProcessedMedia[] = [];
    const attachmentsByType = new Map<string, ProcessedMedia[]>();
    
    // Helper function to process cached attachments from a message
    const processCachedFromMessage = async (msg: Message) => {
      if (msg.attachments.size === 0) {
        return;
      }
      
      const cached = await this.messageCacheService.getCachedAttachments(msg.id);
      if (!cached) {
        return;
      }
      
      for (const attachment of cached) {
        // Only include attachments that have base64 data (successfully processed)
        if (attachment.data && attachment.type !== 'unsupported') {
          const processedMedia: ProcessedMedia = {
            type: attachment.type,
            mimeType: attachment.mimeType,
            data: attachment.data,
            filename: attachment.filename,
            size: attachment.size
          };
          
          cachedAttachments.push(processedMedia);
          
          // Organize by type for easy access
          if (!attachmentsByType.has(attachment.type)) {
            attachmentsByType.set(attachment.type, []);
          }
          attachmentsByType.get(attachment.type)!.push(processedMedia);
        }
      }
    };
    
    // Process both current and referenced messages
    await processCachedFromMessage(message);
    if (referencedMessage) {
      await processCachedFromMessage(referencedMessage);
    }
    
    const hasCachedData = cachedAttachments.length > 0;
    
    if (hasCachedData) {
      const typesSummary = Array.from(attachmentsByType.entries())
        .map(([type, items]) => `${type}: ${items.length}`)
        .join(', ');
      
      logger.debug('Found cached attachment data', {
        totalCached: cachedAttachments.length,
        typesSummary,
        currentMessageId: message.id,
        referencedMessageId: referencedMessage?.id
      });
    }
    
    return {
      hasCachedData,
      cachedAttachments,
      attachmentsByType
    };
  }

  /**
   * Get cached attachments as ProcessedMedia array for immediate use
   * Generic method that works with any attachment type
   */
  async getCachedAttachmentsAsProcessedMedia(message: Message, referencedMessage: Message | null): Promise<ProcessedMedia[]> {
    const cachedResult = await this.getCachedAttachmentsFromMessages(message, referencedMessage);
    return cachedResult.cachedAttachments;
  }

  async analyzeContent(message: Message, referencedMessage: Message | null, cleanMessage: string): Promise<ContentAnalysis> {
    // Detect multimodal content and URLs from both current and referenced messages
    const hasAttachments = message.attachments.size > 0 || (referencedMessage?.attachments.size || 0) > 0;
    const hasUrls = this.detectUrls(cleanMessage) || (referencedMessage ? this.detectUrls(referencedMessage.content) : false);
    const isMultimodal = hasAttachments || hasUrls;
    
    // Detect web context URLs (non-media URLs)
    const webUrls = UrlDetector.extractUrls(cleanMessage);
    const hasWebUrls = webUrls.length > 0;

    // Detect video content specifically from both current and referenced messages
    const videoDetection = this.detectVideosWithReplyContext(message, referencedMessage);
    const hasVideos = videoDetection.hasVideos;

    // Detect PDF content from both current and referenced messages (highest priority bypass)
    const pdfDetection = this.detectPDFsWithReplyContext(message, referencedMessage);
    const hasPDFs = pdfDetection.hasPDFs;

    // Check for cached attachments using generic system
    const attachmentCache = await this.getCachedAttachmentsFromMessages(message, referencedMessage);

    logger.debug('Media detection with cache analysis', { 
      hasAttachments, 
      hasUrls, 
      isMultimodal,
      hasVideos,
      hasPDFs,
      hasWebUrls,
      hasCachedData: attachmentCache.hasCachedData,
      attachmentCount: message.attachments.size,
      videoCount: videoDetection.attachments.length + videoDetection.videoUrls.length + videoDetection.youtubeUrls.length,
      pdfCount: pdfDetection.pdfUrls.length,
      cachedAttachmentCount: attachmentCache.cachedAttachments.length,
      cachedTypes: Array.from(attachmentCache.attachmentsByType.keys()).join(', '),
      webUrlCount: webUrls.length
    });

    return {
      hasAttachments,
      hasUrls,
      isMultimodal,
      hasWebUrls,
      hasVideos,
      hasPDFs,
      webUrls,
      videoDetection,
      pdfDetection,
      attachmentCache
    };
  }

  async processVideoContent(_message: Message, videoDetection: { attachments: any[], videoUrls: string[], youtubeUrls: string[] }): Promise<ProcessedVideo[]> {
    const processedVideos: ProcessedVideo[] = [];
    
    try {
      // Process Discord video attachments
      for (const attachment of videoDetection.attachments) {
        const processed = await VideoProcessor.processVideoAttachment(attachment);
        if (processed) {
          processedVideos.push(processed);
        }
      }
      
      // Process regular video URLs
      for (const url of videoDetection.videoUrls) {
        const processed = await VideoProcessor.processVideoUrl(url);
        if (processed) {
          processedVideos.push(processed);
        }
      }
      
      // Process YouTube URLs (no validation needed)
      for (const url of videoDetection.youtubeUrls) {
        const processed = await VideoProcessor.processVideoUrl(url);
        if (processed) {
          processedVideos.push(processed);
        }
      }
      
      return processedVideos;
      
    } catch (error) {
      logger.error('Error processing video content', { error });
      return [];
    }
  }

  async processYouTubeContent(_message: Message, videoDetection: { attachments: any[], videoUrls: string[], youtubeUrls: string[] }): Promise<ProcessedVideo[]> {
    const processedVideos: ProcessedVideo[] = [];
    
    try {
      // Process only YouTube URLs (no validation needed as per legacy)
      for (const url of videoDetection.youtubeUrls) {
        const processed = await VideoProcessor.processVideoUrl(url);
        if (processed && processed.isYouTube) {
          processedVideos.push(processed);
        }
      }
      
      return processedVideos;
      
    } catch (error) {
      logger.error('Error processing YouTube content', { error });
      return [];
    }
  }

  async processMediaContent(message: Message, useCacheFirst: boolean = false): Promise<ProcessedMedia[]> {
    const processedMedia: ProcessedMedia[] = [];
    
    try {
      // If useCacheFirst is true, try to get cached data first
      if (useCacheFirst) {
        const cachedAttachments = await this.messageCacheService.getCachedAttachments(message.id);
        if (cachedAttachments && cachedAttachments.length > 0) {
          logger.debug('Using cached attachment data for message processing', {
            messageId: message.id,
            attachmentCount: cachedAttachments.length,
            attachmentTypes: cachedAttachments.map((a: any) => a.type)
          });
          
          // Convert cached attachments to ProcessedMedia format
          for (const attachment of cachedAttachments) {
            if (attachment.type === 'image' && attachment.data) {
              processedMedia.push({
                type: 'image',
                mimeType: attachment.mimeType,
                data: attachment.data,
                filename: attachment.filename,
                size: attachment.size
              });
            } else if (attachment.type === 'pdf' && attachment.data) {
              processedMedia.push({
                type: 'pdf',
                mimeType: attachment.mimeType,
                data: attachment.data,
                filename: attachment.filename,
                size: attachment.size
              });
            }
            // Skip unsupported types that don't have base64 data
          }
          
          // If we got cached data, return it
          if (processedMedia.length > 0) {
            logger.debug('Successfully used cached attachment data', {
              messageId: message.id,
              processedCount: processedMedia.length
            });
            return processedMedia;
          }
        }
        
        logger.debug('No cached attachment data found, processing fresh', {
          messageId: message.id
        });
      }
      
      // Fallback to fresh processing (original logic)
      const mediaDetection = MediaProcessor.detectMedia(message);
      
      // Process Discord attachments
      for (const attachment of mediaDetection.attachments) {
        const processed = await MediaProcessor.processAttachment(attachment);
        if (processed) {
          processedMedia.push(processed);
        }
      }
      
      // Process image URLs
      for (const url of mediaDetection.imageUrls) {
        const processed = await MediaProcessor.processImageUrl(url);
        if (processed) {
          processedMedia.push(processed);
        }
      }
      
      return processedMedia;
      
    } catch (error) {
      logger.error('Error processing media content', { error });
      return [];
    }
  }

  async processMediaContentWithReplyContext(message: Message, referencedMessage: Message | null): Promise<ProcessedMedia[]> {
    const processedMedia: ProcessedMedia[] = [];
    
    try {
      // Process current message media (always fresh - user just sent it)
      logger.debug('Processing current message attachments (fresh processing)', {
        messageId: message.id,
        attachmentCount: message.attachments.size
      });
      const currentMedia = await this.processMediaContent(message, false); // useCacheFirst = false
      processedMedia.push(...currentMedia);
      
      // Process referenced message media if it exists (use cache first - likely older message)
      if (referencedMessage) {
        logger.debug('Processing referenced message attachments (cache first)', {
          messageId: referencedMessage.id,
          attachmentCount: referencedMessage.attachments.size
        });
        const referencedMedia = await this.processMediaContent(referencedMessage, true); // useCacheFirst = true
        processedMedia.push(...referencedMedia);
      }
      
      logger.debug('Completed media processing with reply context', {
        currentMessageId: message.id,
        referencedMessageId: referencedMessage?.id,
        totalProcessedMedia: processedMedia.length,
        processedTypes: processedMedia.map(m => m.type)
      });
      
      return processedMedia;
      
    } catch (error) {
      logger.error('Error processing media content with reply context', { error });
      return [];
    }
  }

  async processMediaFromConversationContext(channelId: string): Promise<ProcessedMedia[]> {
    const processedMedia: ProcessedMedia[] = [];
    
    try {
      // Get recent messages with attachments
      const recentMessages = await this.messageCacheService.getRecentMessagesWithAttachments(channelId, 10);
      
      logger.debug('Processing media from conversation context', { 
        messageCount: recentMessages.length,
        channelId 
      });
      
      for (const dbMessage of recentMessages) {
        if (dbMessage.hasAttachments && dbMessage.processedAttachments) {
          const attachments = Array.isArray(dbMessage.processedAttachments) ? dbMessage.processedAttachments : [];
          
          logger.debug('Found pre-processed attachments in cached message', {
            messageId: dbMessage.id,
            attachmentCount: attachments.length,
            attachmentTypes: attachments.map((a: any) => a.type)
          });
          
          for (const attachment of attachments) {
            try {
              // Use pre-processed attachment data - no downloads needed!
              if (attachment.type === 'image' && attachment.data) {
                // Image already processed and stored as base64
                const processed: ProcessedMedia = {
                  type: 'image',
                  mimeType: attachment.mimeType,
                  data: attachment.data, // Pre-processed base64 data
                  filename: attachment.filename,
                  size: attachment.size
                };
                
                processedMedia.push(processed);
                logger.debug('Using cached base64 image data from conversation context', { 
                  filename: processed.filename,
                  type: processed.type,
                  dataSize: attachment.data.length
                });
              } else if (attachment.type === 'pdf' && attachment.data) {
                // PDF already processed and stored as base64
                const processed: ProcessedMedia = {
                  type: 'pdf',
                  mimeType: attachment.mimeType,
                  data: attachment.data, // Pre-processed base64 data
                  filename: attachment.filename,
                  size: attachment.size
                };
                
                processedMedia.push(processed);
                logger.debug('Using cached base64 PDF data from conversation context', { 
                  filename: processed.filename,
                  type: processed.type,
                  dataSize: attachment.data.length
                });
              } else if (attachment.type === 'unsupported' && attachment.url) {
                // Handle unsupported types that weren't pre-processed
                logger.debug('Unsupported attachment type found in conversation context', { 
                  filename: attachment.filename,
                  mimeType: attachment.mimeType,
                  url: attachment.url
                });
                // Skip unsupported types for now
              } else {
                logger.debug('Attachment has no cached base64 data', {
                  type: attachment.type,
                  filename: attachment.filename,
                  hasData: !!attachment.data
                });
              }
            } catch (error) {
              logger.debug('Failed to process cached attachment from conversation context', { 
                type: attachment.type,
                filename: attachment.filename,
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
        }
      }
      
      logger.info('Processed media from conversation context using cached data', { 
        mediaCount: processedMedia.length,
        channelId,
        processedTypes: processedMedia.map(m => m.type)
      });
      
      return processedMedia;
      
    } catch (error) {
      logger.error('Error processing media from conversation context', { error, channelId });
      return [];
    }
  }

  private detectUrls(content: string): boolean {
    // Only detect URLs from Discord CDN for security
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlRegex) || [];
    
    if (urls.length === 0) {
      return false;
    }
    
    // Allow safe media domains for GIFs, images, and videos
    const allowedDomains = [
      'cdn.discordapp.com',
      'media.discordapp.net',
      'tenor.com',
      'c.tenor.com',
      'giphy.com',
      'media.giphy.com',
      'i.giphy.com',
      'imgur.com',
      'i.imgur.com',
      // YouTube domains for video processing
      'youtube.com',
      'www.youtube.com',
      'youtu.be',
      'm.youtube.com',
    ];
    
    return urls.some(url => {
      try {
        const parsedUrl = new URL(url);
        const isAllowedDomain = allowedDomains.some(domain => 
          parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
        );
        
        if (!isAllowedDomain) {
          return false;
        }
        
        // Check for media file extensions or YouTube URLs
        const mediaPattern = /\.(jpg|jpeg|png|gif|webp|bmp|svg|mp4|webm|mov|avi|mkv|pdf)(\?|$)/i;
        const isYouTube = /(?:youtube\.com\/(?:[^/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/)|\S*?[?&]v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/i.test(url);
        return mediaPattern.test(url) || isYouTube;
      } catch {
        return false;
      }
    });
  }

  private detectPDFsWithReplyContext(message: Message, referencedMessage: Message | null): { hasPDFs: boolean; pdfUrls: string[] } {
    const pdfUrls: string[] = [];
    
    // Check current message attachments
    const currentAttachments = Array.from(message.attachments.values());
    currentAttachments.forEach(attachment => {
      if (this.isPDFAttachment(attachment)) {
        pdfUrls.push(attachment.url);
      }
    });
    
    // Check current message content for PDF URLs
    const currentPDFUrls = this.extractPDFUrls(message.content);
    pdfUrls.push(...currentPDFUrls);
    
    // Check referenced message if it exists
    if (referencedMessage) {
      const referencedAttachments = Array.from(referencedMessage.attachments.values());
      referencedAttachments.forEach(attachment => {
        if (this.isPDFAttachment(attachment)) {
          pdfUrls.push(attachment.url);
        }
      });
      
      const referencedPDFUrls = this.extractPDFUrls(referencedMessage.content);
      pdfUrls.push(...referencedPDFUrls);
    }
    
    return {
      hasPDFs: pdfUrls.length > 0,
      pdfUrls: [...new Set(pdfUrls)] // Remove duplicates
    };
  }

  private isPDFAttachment(attachment: { contentType?: string | null; name?: string | null }): boolean {
    return attachment.contentType === 'application/pdf' || 
           (attachment.name?.toLowerCase().endsWith('.pdf') ?? false);
  }

  private extractPDFUrls(content: string): string[] {
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const urls = content.match(urlRegex) || [];
    
    // Allowed Discord CDN domains for security
    const allowedDomains = [
      'cdn.discordapp.com',
      'media.discordapp.net',
      'attachments.discord.com'
    ];
    
    return urls.filter(url => {
      try {
        const parsedUrl = new URL(url);
        const isAllowedDomain = allowedDomains.some(domain => 
          parsedUrl.hostname === domain || parsedUrl.hostname.endsWith(`.${domain}`)
        );
        
        if (!isAllowedDomain) {
          return false;
        }
        
        // Check for PDF file extension
        return /\.pdf(\?|$)/i.test(url);
      } catch {
        return false;
      }
    });
  }

  private detectVideosWithReplyContext(message: Message, referencedMessage: Message | null): { hasVideos: boolean; attachments: any[]; videoUrls: string[]; youtubeUrls: string[] } {
    // Start with current message detection
    const currentDetection = VideoProcessor.detectVideos(message);
    
    if (!referencedMessage) {
      return currentDetection;
    }
    
    // Add referenced message detection
    const referencedDetection = VideoProcessor.detectVideos(referencedMessage);
    
    return {
      hasVideos: currentDetection.hasVideos || referencedDetection.hasVideos,
      attachments: [...currentDetection.attachments, ...referencedDetection.attachments],
      videoUrls: [...currentDetection.videoUrls, ...referencedDetection.videoUrls],
      youtubeUrls: [...currentDetection.youtubeUrls, ...referencedDetection.youtubeUrls]
    };
  }
}