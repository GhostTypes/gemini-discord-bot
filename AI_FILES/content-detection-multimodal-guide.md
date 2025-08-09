# Content Detection and Multimodal Processing Guide

## Executive Summary

The Content Detection and Multimodal Processing system provides comprehensive analysis and processing capabilities for diverse content types in Discord messages. This system serves as the intelligence layer that enables the bot to understand and appropriately handle images, videos, PDFs, web URLs, and other media types through sophisticated detection algorithms and specialized processing pipelines.

The ContentDetectionService.ts acts as the central analysis hub, working with specialized processors (MediaProcessor.ts, VideoProcessor.ts) and the message caching system to provide optimized content handling. The architecture emphasizes performance through caching, extensibility for new content types, and robust error handling for production reliability.

## Architecture Overview

### Core Components

#### ContentDetectionService (src/services/ContentDetectionService.ts)
Central content analysis service providing:
- **Generic Cached Attachment Detection**: Works with any attachment type for performance optimization
- **URL Detection and Categorization**: Identifies web URLs, YouTube links, and other online content
- **Video Content Analysis**: Format validation and processing requirement determination
- **PDF Document Detection**: Document identification and processing strategy selection
- **Multimodal Content Evaluation**: Comprehensive analysis combining text, media, and attachments
- **Cache Integration**: Seamless integration with MessageCacheService for attachment optimization

#### MediaProcessor (src/services/MediaProcessor.ts)
Specialized image and media processing service:
- **Image Format Support**: JPEG, PNG, WebP, GIF processing and conversion
- **Base64 Conversion**: Optimized encoding for AI model consumption
- **Size Validation**: Configurable size limits with intelligent compression
- **Format Normalization**: Consistent output format for downstream processing
- **Error Recovery**: Graceful handling of corrupted or unsupported media

#### VideoProcessor (src/services/VideoProcessor.ts)
Advanced video content processing:
- **Format Detection**: MP4, WebM, MOV, and other common video formats
- **Metadata Extraction**: Duration, resolution, codec information
- **Thumbnail Generation**: Frame extraction for preview and analysis
- **Streaming Support**: Efficient processing of large video files
- **YouTube Integration**: Specialized handling for YouTube content

### Content Analysis Pipeline

The content detection system implements a multi-stage analysis pipeline that provides comprehensive content understanding:

```typescript
export interface ContentAnalysis {
  // Basic content flags
  hasAttachments: boolean;
  hasUrls: boolean;
  isMultimodal: boolean;
  hasWebUrls: boolean;
  hasVideos: boolean;
  hasPDFs: boolean;
  
  // Detailed content arrays
  webUrls: string[];
  
  // Specialized detection results
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
  
  // Generic cached attachment optimization
  attachmentCache: {
    hasCachedData: boolean;
    cachedAttachments: ProcessedMedia[];
    attachmentsByType: Map<string, ProcessedMedia[]>;
  };
}
```

### Generic Attachment Caching System

#### Cache-First Architecture

The system implements a cache-first approach that dramatically improves performance:

```typescript
/**
 * Generic method to get all cached attachments as ProcessedMedia
 * Works with any attachment type and is easily extensible
 */
private async getCachedAttachmentsFromMessages(message: Message, referencedMessage: Message | null): Promise<{
  hasCachedData: boolean;
  cachedAttachments: ProcessedMedia[];
  attachmentsByType: Map<string, ProcessedMedia[]>;
}>
```

**Key Benefits:**
- **Zero Duplicate Downloads**: Attachments processed once during caching, then instantly available
- **Type Organization**: Cached attachments organized by type for specialized handling
- **Performance Optimization**: Single query retrieval with proper database indexing
- **Memory Efficiency**: Base64 data stored in database, not memory
- **Extensible Design**: Easy to add new attachment types without architectural changes

#### Attachment Type Classification

The system automatically classifies and organizes cached attachments:

```typescript
// Process cached attachments and organize by type
for (const attachment of cached) {
  if (attachment.data && attachment.type !== 'unsupported') {
    const processedMedia: ProcessedMedia = {
      type: attachment.type,           // 'image', 'pdf', 'video', etc.
      mimeType: attachment.mimeType,
      data: attachment.data,           // Base64 encoded content
      filename: attachment.filename,
      size: attachment.size
    };
    
    cachedAttachments.push(processedMedia);
    
    // Organize by type for specialized access
    const typeList = attachmentsByType.get(attachment.type) || [];
    typeList.push(processedMedia);
    attachmentsByType.set(attachment.type, typeList);
  }
}
```

## Content Detection Strategies

### URL Detection and Analysis

#### Web URL Identification
```typescript
// Comprehensive URL pattern matching
const urlPattern = /https?:\/\/[^\s<>(){}[\]]+/gi;
const detectedUrls = content.match(urlPattern) || [];

// Filter and validate URLs
const validUrls = detectedUrls.filter(url => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
});
```

#### YouTube-Specific Detection
```typescript
private isYouTubeUrl(url: string): boolean {
  const youtubePatterns = [
    /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/,
    /^https?:\/\/(www\.)?youtu\.be\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/embed\/[\w-]+/,
    /^https?:\/\/(www\.)?youtube\.com\/v\/[\w-]+/
  ];
  
  return youtubePatterns.some(pattern => pattern.test(url));
}
```

#### URL Validation and Accessibility
```typescript
export async function validateUrls(urls: string[]): Promise<string[]> {
  const validUrls: string[] = [];
  
  for (const url of urls) {
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        timeout: 5000,
        headers: {
          'User-Agent': 'Discord Bot Content Analyzer'
        }
      });
      
      if (response.ok) {
        validUrls.push(url);
      }
    } catch (error) {
      logger.warn(`URL validation failed: ${url}`, error);
    }
  }
  
  return validUrls;
}
```

### Video Content Detection

#### Attachment-Based Video Detection
```typescript
private detectVideoAttachments(message: Message): {
  hasVideos: boolean;
  attachments: any[];
} {
  const videoAttachments = Array.from(message.attachments.values()).filter(attachment => {
    const contentType = attachment.contentType?.toLowerCase();
    return contentType && this.isVideoFormat(contentType);
  });
  
  return {
    hasVideos: videoAttachments.length > 0,
    attachments: videoAttachments
  };
}

private isVideoFormat(mimeType: string): boolean {
  const supportedVideoFormats = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo', // AVI
    'video/x-ms-wmv',  // WMV
    'video/3gpp',      // 3GP
    'video/x-flv'      // FLV
  ];
  
  return supportedVideoFormats.includes(mimeType);
}
```

#### URL-Based Video Detection
```typescript
private detectVideoUrls(content: string): {
  videoUrls: string[];
  youtubeUrls: string[];
} {
  const urls = this.extractUrls(content);
  const videoUrls: string[] = [];
  const youtubeUrls: string[] = [];
  
  for (const url of urls) {
    if (this.isYouTubeUrl(url)) {
      youtubeUrls.push(url);
    } else if (this.isVideoUrl(url)) {
      videoUrls.push(url);
    }
  }
  
  return { videoUrls, youtubeUrls };
}

private isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.wmv', '.3gp', '.flv'];
  const urlPath = new URL(url).pathname.toLowerCase();
  return videoExtensions.some(ext => urlPath.endsWith(ext));
}
```

### PDF Document Detection

#### Multi-Source PDF Detection
```typescript
private detectPDFs(message: Message, content: string): {
  hasPDFs: boolean;
  pdfUrls: string[];
} {
  const pdfUrls: string[] = [];
  
  // Check message attachments
  for (const attachment of message.attachments.values()) {
    if (attachment.contentType === 'application/pdf') {
      pdfUrls.push(attachment.url);
    }
  }
  
  // Check URLs in content
  const urls = this.extractUrls(content);
  for (const url of urls) {
    if (this.isPDFUrl(url)) {
      pdfUrls.push(url);
    }
  }
  
  return {
    hasPDFs: pdfUrls.length > 0,
    pdfUrls
  };
}

private isPDFUrl(url: string): boolean {
  try {
    const urlPath = new URL(url).pathname.toLowerCase();
    return urlPath.endsWith('.pdf');
  } catch {
    return false;
  }
}
```

## Media Processing Implementation

### Image Processing Pipeline

#### MediaProcessor Implementation
```typescript
export class MediaProcessor {
  private static readonly MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB limit
  private static readonly SUPPORTED_FORMATS = [
    'image/jpeg', 'image/jpg', 'image/png', 
    'image/webp', 'image/gif', 'image/bmp'
  ];

  static async processAttachment(attachment: any): Promise<ProcessedMedia | null> {
    try {
      // Validate file size
      if (attachment.size > this.MAX_FILE_SIZE) {
        logger.warn(`Image too large: ${attachment.size} bytes`, { filename: attachment.name });
        return null;
      }

      // Validate format
      if (!this.SUPPORTED_FORMATS.includes(attachment.contentType)) {
        logger.warn(`Unsupported image format: ${attachment.contentType}`);
        return null;
      }

      // Download and convert
      const response = await fetch(attachment.url);
      if (!response.ok) {
        throw new Error(`Failed to download: ${response.status}`);
      }

      const buffer = await response.arrayBuffer();
      const base64Data = Buffer.from(buffer).toString('base64');

      return {
        type: 'image' as const,
        mimeType: attachment.contentType,
        data: base64Data,
        filename: attachment.name || 'image',
        size: attachment.size || buffer.byteLength,
      };
    } catch (error) {
      logger.error('Image processing failed:', error);
      return null;
    }
  }
}
```

#### Intelligent Format Handling
```typescript
// Automatic format detection and conversion
private static async normalizeImageFormat(buffer: ArrayBuffer, originalMimeType: string): Promise<{
  data: string;
  mimeType: string;
}> {
  // For unsupported formats, attempt conversion to PNG
  if (!this.SUPPORTED_FORMATS.includes(originalMimeType)) {
    try {
      const convertedBuffer = await this.convertToPNG(buffer);
      return {
        data: Buffer.from(convertedBuffer).toString('base64'),
        mimeType: 'image/png'
      };
    } catch (error) {
      logger.warn('Format conversion failed, using original:', error);
    }
  }
  
  // Use original format if supported
  return {
    data: Buffer.from(buffer).toString('base64'),
    mimeType: originalMimeType
  };
}
```

### Video Processing Pipeline

#### VideoProcessor Architecture
```typescript
export class VideoProcessor {
  private static readonly MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB limit
  private static readonly PROCESSING_TIMEOUT = 60000; // 60 second timeout

  static async processVideoAttachment(attachment: any): Promise<ProcessedVideo | null> {
    try {
      // Pre-processing validation
      const validation = await this.validateVideoAttachment(attachment);
      if (!validation.isValid) {
        logger.warn(`Video validation failed: ${validation.reason}`);
        return null;
      }

      // Extract metadata
      const metadata = await this.extractVideoMetadata(attachment.url);
      
      // Generate thumbnail for preview
      const thumbnail = await this.generateThumbnail(attachment.url);

      return {
        type: 'video' as const,
        mimeType: attachment.contentType,
        filename: attachment.name || 'video',
        size: attachment.size,
        duration: metadata.duration,
        resolution: metadata.resolution,
        thumbnail: thumbnail, // Base64 encoded thumbnail
        url: attachment.url // Keep original URL for streaming
      };
    } catch (error) {
      logger.error('Video processing failed:', error);
      return null;
    }
  }

  private static async validateVideoAttachment(attachment: any): Promise<{
    isValid: boolean;
    reason?: string;
  }> {
    // Size validation
    if (attachment.size > this.MAX_VIDEO_SIZE) {
      return {
        isValid: false,
        reason: `Video too large: ${attachment.size} bytes`
      };
    }

    // Format validation
    if (!this.isVideoFormat(attachment.contentType)) {
      return {
        isValid: false,
        reason: `Unsupported video format: ${attachment.contentType}`
      };
    }

    // Accessibility check
    try {
      const response = await fetch(attachment.url, { method: 'HEAD' });
      if (!response.ok) {
        return {
          isValid: false,
          reason: `Video not accessible: ${response.status}`
        };
      }
    } catch (error) {
      return {
        isValid: false,
        reason: `Network error accessing video: ${error.message}`
      };
    }

    return { isValid: true };
  }
}
```

#### Thumbnail Generation
```typescript
private static async generateThumbnail(videoUrl: string): Promise<string> {
  try {
    // Use video processing library to extract frame at 10% duration
    const frameBuffer = await this.extractVideoFrame(videoUrl, 0.1);
    
    // Convert frame to base64 for storage
    const base64Thumbnail = Buffer.from(frameBuffer).toString('base64');
    
    logger.debug('Thumbnail generated successfully', {
      videoUrl: videoUrl.substring(0, 50) + '...',
      thumbnailSize: base64Thumbnail.length
    });
    
    return base64Thumbnail;
  } catch (error) {
    logger.error('Thumbnail generation failed:', error);
    
    // Return placeholder thumbnail
    return this.getPlaceholderThumbnail();
  }
}
```

### PDF Processing Integration

#### PDF Detection and Caching
```typescript
// Integration with PDF flow for caching
private async processPDFsForCache(message: DiscordMessage): Promise<ProcessedMedia[]> {
  const pdfAttachments: ProcessedMedia[] = [];
  
  for (const attachment of message.attachments.values()) {
    if (attachment.contentType === 'application/pdf') {
      try {
        // Use existing PDF flow for processing
        const { downloadAndConvertPDFToBase64 } = await import('../flows/pdfFlow.js');
        const { data: pdfBase64, filename: pdfFilename } = await downloadAndConvertPDFToBase64(attachment.url);
        
        const processedPDF: ProcessedMedia = {
          type: 'pdf' as const,
          mimeType: 'application/pdf',
          data: pdfBase64,
          filename: pdfFilename || attachment.name || 'document.pdf',
          size: attachment.size || 0,
        };
        
        pdfAttachments.push(processedPDF);
        
        logger.debug('PDF processed for cache', { 
          filename: processedPDF.filename,
          originalSize: attachment.size,
          processedSize: pdfBase64.length 
        });
      } catch (error) {
        logger.error(`PDF processing failed for ${attachment.name}:`, error);
      }
    }
  }
  
  return pdfAttachments;
}
```

## Multimodal Content Analysis

### Comprehensive Multimodal Detection

The system provides sophisticated multimodal content detection that considers all content types:

```typescript
async analyzeContent(message: Message, referencedMessage: Message | null): Promise<ContentAnalysis> {
  // Start with basic content extraction
  const content = message.content;
  
  // Cached attachment analysis (highest priority)
  const attachmentCache = await this.getCachedAttachmentsFromMessages(message, referencedMessage);
  
  // URL detection and categorization
  const webUrls = this.extractWebUrls(content);
  
  // Video content detection
  const videoDetection = this.detectVideoContent(message, content);
  
  // PDF detection
  const pdfDetection = this.detectPDFs(message, content);
  
  // Determine multimodal status
  const isMultimodal = this.determineMultimodalStatus(
    attachmentCache,
    message.attachments.size > 0,
    webUrls.length > 0,
    videoDetection.hasVideos
  );
  
  return {
    hasAttachments: message.attachments.size > 0,
    hasUrls: webUrls.length > 0,
    isMultimodal,
    hasWebUrls: webUrls.length > 0,
    hasVideos: videoDetection.hasVideos,
    hasPDFs: pdfDetection.hasPDFs,
    webUrls,
    videoDetection,
    pdfDetection,
    attachmentCache
  };
}
```

### Multimodal Status Determination
```typescript
private determineMultimodalStatus(
  attachmentCache: any,
  hasAttachments: boolean,
  hasUrls: boolean,
  hasVideos: boolean
): boolean {
  // Consider cached visual content
  if (attachmentCache.hasCachedData) {
    const visualTypes = ['image', 'video', 'pdf'];
    const hasVisualContent = Array.from(attachmentCache.attachmentsByType.keys())
      .some(type => visualTypes.includes(type));
    
    if (hasVisualContent) {
      return true;
    }
  }
  
  // Consider direct attachments
  if (hasAttachments || hasVideos) {
    return true;
  }
  
  // Consider URLs that might contain visual content
  if (hasUrls) {
    // Future: Could analyze URLs to determine if they contain visual content
    return true;
  }
  
  return false;
}
```

## Performance Optimization Strategies

### Caching Architecture

#### Database Integration
```typescript
// Efficient cached attachment retrieval
async getCachedAttachments(messageId: string): Promise<ProcessedMedia[] | null> {
  try {
    const message = await this.client.message.findUnique({
      where: { id: messageId },
      select: { attachments: true }
    });
    
    if (!message?.attachments) {
      return null;
    }
    
    // Parse stored attachment data
    const attachments = JSON.parse(message.attachments);
    
    // Convert to ProcessedMedia format
    return attachments.map((attachment: any) => ({
      type: attachment.type,
      mimeType: attachment.mimeType,
      data: attachment.data, // Base64 encoded
      filename: attachment.filename,
      size: attachment.size
    }));
  } catch (error) {
    logger.error('Failed to retrieve cached attachments:', error);
    return null;
  }
}
```

#### Cache Hit Optimization
```typescript
// Prioritize cached content in analysis
async analyzeContent(message: Message, referencedMessage: Message | null): Promise<ContentAnalysis> {
  const startTime = Date.now();
  
  // Check cache first for performance
  const attachmentCache = await this.getCachedAttachmentsFromMessages(message, referencedMessage);
  
  if (attachmentCache.hasCachedData) {
    logger.info('Cache hit - using cached attachments', {
      messageId: message.id,
      cachedCount: attachmentCache.cachedAttachments.length,
      cacheRetrievalTime: Date.now() - startTime
    });
    
    // Fast path - minimal additional analysis needed
    return this.buildCacheOptimizedAnalysis(message, attachmentCache);
  }
  
  // Cache miss - full analysis required
  logger.debug('Cache miss - performing full content analysis', {
    messageId: message.id,
    hasAttachments: message.attachments.size > 0
  });
  
  return this.performFullContentAnalysis(message, referencedMessage);
}
```

### Memory Management

#### Streaming Processing for Large Files
```typescript
// Handle large files with streaming
async processLargeAttachment(attachment: any): Promise<ProcessedMedia | null> {
  if (attachment.size > this.STREAMING_THRESHOLD) {
    return await this.processWithStreaming(attachment);
  } else {
    return await this.processInMemory(attachment);
  }
}

private async processWithStreaming(attachment: any): Promise<ProcessedMedia | null> {
  const stream = await fetch(attachment.url).then(res => res.body);
  if (!stream) {
    throw new Error('Failed to create stream');
  }
  
  // Process in chunks to avoid memory issues
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      chunks.push(value);
      
      // Check memory usage and implement backpressure if needed
      if (this.shouldApplyBackpressure(chunks)) {
        await this.applyBackpressure();
      }
    }
    
    // Combine chunks and process
    const fullBuffer = this.combineChunks(chunks);
    return await this.processBuffer(fullBuffer, attachment);
  } finally {
    reader.releaseLock();
  }
}
```

### Concurrent Processing

#### Parallel Attachment Processing
```typescript
// Process multiple attachments concurrently
async processMultipleAttachments(attachments: any[]): Promise<ProcessedMedia[]> {
  const concurrencyLimit = 3; // Prevent overwhelming the system
  const results: ProcessedMedia[] = [];
  
  // Process in batches for memory efficiency
  for (let i = 0; i < attachments.length; i += concurrencyLimit) {
    const batch = attachments.slice(i, i + concurrencyLimit);
    
    const batchPromises = batch.map(async (attachment) => {
      try {
        return await this.processAttachment(attachment);
      } catch (error) {
        logger.error(`Batch processing failed for ${attachment.name}:`, error);
        return null;
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults.filter(result => result !== null));
  }
  
  return results;
}
```

## Error Handling and Recovery

### Graceful Degradation

#### Attachment Processing Failures
```typescript
// Robust attachment processing with fallbacks
async processAttachmentWithFallbacks(attachment: any): Promise<ProcessedMedia | null> {
  const processingStrategies = [
    () => this.processWithOptimizedSettings(attachment),
    () => this.processWithReducedQuality(attachment),
    () => this.processAsPlainFile(attachment)
  ];
  
  for (const [index, strategy] of processingStrategies.entries()) {
    try {
      const result = await strategy();
      if (result) {
        if (index > 0) {
          logger.warn(`Attachment processed with fallback strategy ${index}`, {
            filename: attachment.name,
            strategy: strategy.name
          });
        }
        return result;
      }
    } catch (error) {
      logger.warn(`Processing strategy ${index} failed:`, error);
      
      // If this was the last strategy, log the final failure
      if (index === processingStrategies.length - 1) {
        logger.error('All processing strategies failed for attachment:', {
          filename: attachment.name,
          size: attachment.size,
          contentType: attachment.contentType,
          finalError: error
        });
      }
    }
  }
  
  return null; // All strategies failed
}
```

#### Network Resilience
```typescript
// Retry mechanism for network operations
async downloadWithRetry(url: string, maxRetries: number = 3): Promise<ArrayBuffer> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        timeout: 30000 + (attempt * 5000), // Increasing timeout
        headers: {
          'User-Agent': 'Discord Bot Content Processor'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      return await response.arrayBuffer();
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff
        logger.warn(`Download attempt ${attempt} failed, retrying in ${delay}ms:`, error);
        await this.sleep(delay);
      }
    }
  }
  
  throw new Error(`Download failed after ${maxRetries} attempts: ${lastError?.message}`);
}
```

### Validation and Safety

#### Content Safety Checks
```typescript
// Comprehensive content validation
async validateContent(content: any, contentType: string): Promise<{
  isValid: boolean;
  issues: string[];
  sanitizedContent?: any;
}> {
  const issues: string[] = [];
  let sanitizedContent = content;
  
  // Size validation
  if (content.size > this.getMaxSizeForType(contentType)) {
    issues.push(`Content exceeds maximum size for type ${contentType}`);
  }
  
  // Format validation
  if (!this.isSupportedFormat(contentType)) {
    issues.push(`Unsupported content format: ${contentType}`);
  }
  
  // Security scanning
  const securityScan = await this.performSecurityScan(content);
  if (!securityScan.isSafe) {
    issues.push(`Security concerns: ${securityScan.concerns.join(', ')}`);
  }
  
  // Content sanitization if possible
  if (issues.length === 0) {
    sanitizedContent = await this.sanitizeContent(content, contentType);
  }
  
  return {
    isValid: issues.length === 0,
    issues,
    sanitizedContent: issues.length === 0 ? sanitizedContent : undefined
  };
}
```

#### Rate Limiting and Resource Protection
```typescript
// Protect against resource exhaustion
class ContentProcessingLimiter {
  private readonly concurrentProcessing = new Map<string, number>();
  private readonly userLimits = new Map<string, number>();
  private readonly maxConcurrentPerUser = 2;
  private readonly maxConcurrentGlobal = 10;

  async acquireProcessingSlot(userId: string): Promise<boolean> {
    // Check global limit
    const globalConcurrent = Array.from(this.concurrentProcessing.values())
      .reduce((sum, count) => sum + count, 0);
    
    if (globalConcurrent >= this.maxConcurrentGlobal) {
      return false;
    }
    
    // Check user limit
    const userConcurrent = this.concurrentProcessing.get(userId) || 0;
    if (userConcurrent >= this.maxConcurrentPerUser) {
      return false;
    }
    
    // Acquire slot
    this.concurrentProcessing.set(userId, userConcurrent + 1);
    return true;
  }

  releaseProcessingSlot(userId: string): void {
    const current = this.concurrentProcessing.get(userId) || 0;
    if (current > 1) {
      this.concurrentProcessing.set(userId, current - 1);
    } else {
      this.concurrentProcessing.delete(userId);
    }
  }
}
```

## Integration Patterns

### MessageCacheService Integration

#### Seamless Cache Coordination
```typescript
// ContentDetectionService integrates closely with MessageCacheService
constructor(messageCacheService: MessageCacheService) {
  this.messageCacheService = messageCacheService;
}

async analyzeContent(message: Message, referencedMessage: Message | null): Promise<ContentAnalysis> {
  // Leverage MessageCacheService for attachment optimization
  const attachmentCache = await this.getCachedAttachmentsFromMessages(message, referencedMessage);
  
  // MessageCacheService handles the complex caching logic
  // ContentDetectionService focuses on analysis and organization
  return this.buildContentAnalysis(message, referencedMessage, attachmentCache);
}
```

#### Cache Strategy Coordination
```typescript
// Helper function that processes cached attachments from a message
const processCachedFromMessage = async (msg: Message) => {
  if (msg.attachments.size === 0) {
    return;
  }
  
  // Use MessageCacheService's caching mechanisms
  const cached = await this.messageCacheService.getCachedAttachments(msg.id);
  if (!cached) {
    return; // No cached data available
  }
  
  // Process and organize cached attachments by type
  for (const attachment of cached) {
    if (attachment.data && attachment.type !== 'unsupported') {
      // Convert to ProcessedMedia format for consistency
      const processedMedia: ProcessedMedia = {
        type: attachment.type,
        mimeType: attachment.mimeType,
        data: attachment.data,
        filename: attachment.filename,
        size: attachment.size
      };
      
      // Organize by type for specialized handling
      this.organizeAttachmentByType(processedMedia, attachmentsByType);
    }
  }
};
```

### FlowOrchestrator Integration

#### Analysis-Driven Routing
```typescript
// ContentDetectionService provides analysis for intelligent routing
export class FlowOrchestrator {
  constructor(messageCacheService: MessageCacheService, contentDetectionService: ContentDetectionService) {
    this.contentDetectionService = contentDetectionService;
  }

  async routeMessage(message: Message, cleanMessage: string, referencedMessage: Message | null): Promise<void> {
    // Get comprehensive content analysis
    const contentAnalysis = await this.contentDetectionService.analyzeContent(message, referencedMessage);
    
    // Route based on analysis results
    if (contentAnalysis.attachmentCache.hasCachedData) {
      // Cached data available - optimized routing
      await this.handleCachedContent(message, cleanMessage, contentAnalysis);
    } else if (contentAnalysis.hasVideos) {
      // Video content - specialized processing
      await this.handleVideoContent(message, cleanMessage, contentAnalysis.videoDetection);
    }
    // ... additional routing logic
  }
}
```

### AI Flow Integration

#### Structured Content Preparation
```typescript
// Prepare content for AI flows with proper formatting
async prepareContentForAI(contentAnalysis: ContentAnalysis): Promise<{
  textContent: string;
  mediaItems: ProcessedMedia[];
  contextMetadata: any;
}> {
  const mediaItems: ProcessedMedia[] = [];
  const contextMetadata: any = {
    hasUrls: contentAnalysis.hasUrls,
    hasVideos: contentAnalysis.hasVideos,
    hasPDFs: contentAnalysis.hasPDFs
  };
  
  // Include cached attachments
  if (contentAnalysis.attachmentCache.hasCachedData) {
    mediaItems.push(...contentAnalysis.attachmentCache.cachedAttachments);
    
    // Add type-specific metadata
    for (const [type, attachments] of contentAnalysis.attachmentCache.attachmentsByType) {
      contextMetadata[`${type}Count`] = attachments.length;
    }
  }
  
  // Prepare text content with URL context
  let textContent = contentAnalysis.originalText || '';
  if (contentAnalysis.hasWebUrls) {
    textContent += `\n\nReferenced URLs:\n${contentAnalysis.webUrls.join('\n')}`;
  }
  
  return {
    textContent,
    mediaItems,
    contextMetadata
  };
}
```

## Extension Points for New Content Types

### Adding Support for New Attachment Types

The architecture is designed for easy extension. Here's how to add support for new content types:

#### 1. Extend Content Analysis Interface
```typescript
// Add new content type to ContentAnalysis interface
export interface ContentAnalysis {
  // ... existing fields
  
  // New content type detection
  hasDocuments: boolean;
  documentDetection: {
    hasDocuments: boolean;
    documentUrls: string[];
    supportedFormats: string[];
  };
}
```

#### 2. Implement Type Detection
```typescript
// Add detection logic in ContentDetectionService
private detectDocuments(message: Message, content: string): {
  hasDocuments: boolean;
  documentUrls: string[];
  supportedFormats: string[];
} {
  const documentUrls: string[] = [];
  const supportedFormats: string[] = [];
  
  // Check attachments
  for (const attachment of message.attachments.values()) {
    if (this.isDocumentFormat(attachment.contentType)) {
      documentUrls.push(attachment.url);
      supportedFormats.push(attachment.contentType);
    }
  }
  
  // Check URLs in content
  const urls = this.extractUrls(content);
  for (const url of urls) {
    if (this.isDocumentUrl(url)) {
      documentUrls.push(url);
    }
  }
  
  return {
    hasDocuments: documentUrls.length > 0,
    documentUrls,
    supportedFormats
  };
}
```

#### 3. Create Specialized Processor
```typescript
// Implement DocumentProcessor similar to MediaProcessor
export class DocumentProcessor {
  private static readonly SUPPORTED_FORMATS = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'text/plain', // .txt
    'application/json', // .json
    'application/xml', // .xml
    'text/csv' // .csv
  ];

  static async processAttachment(attachment: any): Promise<ProcessedMedia | null> {
    try {
      // Validation
      if (!this.SUPPORTED_FORMATS.includes(attachment.contentType)) {
        return null;
      }

      // Download and process
      const response = await fetch(attachment.url);
      const buffer = await response.arrayBuffer();
      
      // Extract text content based on format
      const textContent = await this.extractTextContent(buffer, attachment.contentType);
      
      return {
        type: 'document' as const,
        mimeType: attachment.contentType,
        data: Buffer.from(buffer).toString('base64'), // Raw file
        textContent, // Extracted text for AI processing
        filename: attachment.name || 'document',
        size: attachment.size || buffer.byteLength,
      };
    } catch (error) {
      logger.error('Document processing failed:', error);
      return null;
    }
  }

  private static async extractTextContent(buffer: ArrayBuffer, mimeType: string): Promise<string> {
    switch (mimeType) {
      case 'text/plain':
        return Buffer.from(buffer).toString('utf8');
      
      case 'application/json':
        return JSON.stringify(JSON.parse(Buffer.from(buffer).toString('utf8')), null, 2);
      
      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await this.extractFromDocx(buffer);
      
      // Add more format handlers as needed
      default:
        return Buffer.from(buffer).toString('utf8');
    }
  }
}
```

#### 4. Update MessageCacheService
```typescript
// Add document processing to attachment caching
private async processAttachmentsForStorage(message: DiscordMessage): Promise<{ processedAttachments: any[] | null; hasAttachments: boolean }> {
  // ... existing code

  for (const attachment of attachments) {
    try {
      let processed = null;
      
      // ... existing image and PDF processing

      // Add document processing
      else if (this.isDocumentFormat(attachment.contentType)) {
        const { DocumentProcessor } = await import('./DocumentProcessor.js');
        processed = await DocumentProcessor.processAttachment(attachment);
        if (processed) {
          logger.debug('Successfully processed document attachment for cache', { 
            filename: attachment.name,
            type: processed.type,
            size: attachment.size
          });
        }
      }

      // ... rest of processing logic
    } catch (error) {
      logger.error(`Attachment processing failed for ${attachment.name}:`, error);
    }
  }

  return { processedAttachments, hasAttachments: true };
}
```

#### 5. Update FlowOrchestrator Routing
```typescript
// Add document-specific routing in FlowOrchestrator
async routeMessage(message: Message, cleanMessage: string, referencedMessage: Message | null, contentAnalysis: ContentAnalysis): Promise<void> {
  // ... existing routing logic

  else if (contentAnalysis.hasDocuments) {
    logger.info('Message routed to document processing', { 
      documentCount: contentAnalysis.documentDetection.documentUrls.length 
    });
    await this.handleDocumentProcessing(message, cleanMessage, contentAnalysis.documentDetection);
  }

  // ... rest of routing
}
```

## Debugging and Troubleshooting

### Content Analysis Debugging

#### Comprehensive Analysis Logging
```typescript
// Debug helper for detailed content analysis
private logContentAnalysisDebug(analysis: ContentAnalysis, messageId: string): void {
  logger.debug('Content analysis complete', {
    messageId,
    hasAttachments: analysis.hasAttachments,
    attachmentCount: analysis.attachmentCache.cachedAttachments.length,
    attachmentTypes: Array.from(analysis.attachmentCache.attachmentsByType.keys()),
    hasUrls: analysis.hasUrls,
    urlCount: analysis.webUrls.length,
    hasVideos: analysis.hasVideos,
    videoCount: analysis.videoDetection.attachments.length + analysis.videoDetection.videoUrls.length,
    youtubeCount: analysis.videoDetection.youtubeUrls.length,
    hasPDFs: analysis.hasPDFs,
    pdfCount: analysis.pdfDetection.pdfUrls.length,
    isMultimodal: analysis.isMultimodal,
    cacheHit: analysis.attachmentCache.hasCachedData
  });
}
```

#### Cache Analysis Tools
```typescript
// Debug cache effectiveness
async debugCacheEffectiveness(channelId: string): Promise<void> {
  const stats = await this.messageCacheService.getCacheStatistics(channelId);
  
  logger.info('Cache effectiveness analysis', {
    channelId,
    totalMessages: stats.totalMessages,
    messagesWithAttachments: stats.messagesWithAttachments,
    cacheHitRate: stats.cacheHitRate,
    averageAttachmentSize: stats.averageAttachmentSize,
    totalStoredData: stats.totalStoredData,
    supportedTypes: stats.supportedTypes,
    processingFailureRate: stats.processingFailureRate
  });
}
```

### Performance Monitoring

#### Processing Time Tracking
```typescript
// Track processing performance for optimization
async processAttachmentWithMetrics(attachment: any): Promise<{
  result: ProcessedMedia | null;
  metrics: ProcessingMetrics;
}> {
  const startTime = Date.now();
  const metrics: ProcessingMetrics = {
    filename: attachment.name,
    size: attachment.size,
    contentType: attachment.contentType,
    startTime,
    endTime: 0,
    processingTime: 0,
    success: false,
    errorType: null,
    cacheHit: false
  };

  try {
    // Check cache first
    const cached = await this.checkCache(attachment.url);
    if (cached) {
      metrics.cacheHit = true;
      metrics.success = true;
      return { result: cached, metrics: this.finalizeMetrics(metrics) };
    }

    // Process attachment
    const result = await this.processAttachment(attachment);
    metrics.success = !!result;
    
    return { result, metrics: this.finalizeMetrics(metrics) };
  } catch (error) {
    metrics.success = false;
    metrics.errorType = error.constructor.name;
    logger.error('Attachment processing failed with metrics:', { attachment: attachment.name, error, metrics });
    
    return { result: null, metrics: this.finalizeMetrics(metrics) };
  }
}
```

### Common Issues and Solutions

#### Issue: Cached Attachments Not Being Detected
**Symptoms**: Content shows hasAttachments=true but attachmentCache.hasCachedData=false
**Debugging Steps**:
```typescript
// Add debug logging to cache retrieval
async getCachedAttachmentsFromMessages(message: Message, referencedMessage: Message | null) {
  logger.debug('Checking cache for message attachments', {
    messageId: message.id,
    attachmentCount: message.attachments.size,
    referencedMessageId: referencedMessage?.id
  });

  const cached = await this.messageCacheService.getCachedAttachments(message.id);
  logger.debug('Cache lookup result', {
    messageId: message.id,
    hasCachedData: !!cached,
    cachedCount: cached?.length || 0
  });

  // ... rest of method
}
```

**Common Causes and Solutions**:
1. **Timing Issue**: Message processed before caching complete - ensure caching completes before content analysis
2. **Database Issue**: Cached data corrupted or not properly stored - check database integrity
3. **Format Issue**: Attachment format not supported by caching - verify supported formats list

#### Issue: Video Processing Failures
**Symptoms**: Videos detected but processing fails consistently
**Debugging Steps**:
```typescript
// Enhanced video processing debugging
static async processVideoAttachment(attachment: any): Promise<ProcessedVideo | null> {
  logger.debug('Starting video processing', {
    filename: attachment.name,
    size: attachment.size,
    contentType: attachment.contentType,
    url: attachment.url.substring(0, 50) + '...'
  });

  try {
    // Step-by-step validation with logging
    const validation = await this.validateVideoAttachment(attachment);
    logger.debug('Video validation result', { validation });
    
    if (!validation.isValid) {
      return null;
    }

    // ... continue with detailed logging at each step
  } catch (error) {
    logger.error('Video processing error with details', {
      filename: attachment.name,
      error: error.message,
      stack: error.stack
    });
    return null;
  }
}
```

#### Issue: Memory Issues with Large Files
**Symptoms**: Out of memory errors or slow processing for large attachments
**Solutions**:
1. **Implement Streaming**: Use streaming processing for files > 50MB
2. **Add Size Limits**: Enforce reasonable size limits per content type
3. **Optimize Memory Usage**: Process files in chunks rather than loading entirely into memory

```typescript
// Memory-safe large file processing
private async processLargeFile(attachment: any): Promise<ProcessedMedia | null> {
  const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
  
  try {
    const response = await fetch(attachment.url);
    const reader = response.body?.getReader();
    
    if (!reader) {
      throw new Error('Unable to create stream reader');
    }

    let processedSize = 0;
    const chunks: Uint8Array[] = [];
    
    while (true) {
      const { done, value } = await reader.read();
      
      if (done) break;
      
      chunks.push(value);
      processedSize += value.length;
      
      // Memory pressure check
      if (processedSize > this.MAX_MEMORY_USAGE) {
        logger.warn('File too large for memory processing', {
          filename: attachment.name,
          processedSize
        });
        return null;
      }
    }
    
    // Combine chunks and complete processing
    const fullBuffer = this.combineChunks(chunks);
    return await this.finalizeProcessing(fullBuffer, attachment);
  } catch (error) {
    logger.error('Large file processing failed:', error);
    return null;
  }
}
```

## Conclusion

The Content Detection and Multimodal Processing system provides a robust, extensible foundation for handling diverse content types in Discord bot applications. Its sophisticated caching architecture, comprehensive error handling, and modular design enable reliable processing of images, videos, PDFs, and other media types while maintaining optimal performance through intelligent optimization strategies.

Key architectural strengths:
- **Generic Caching System**: Eliminates duplicate processing and provides instant access to processed content
- **Extensible Design**: Easy addition of new content types without architectural changes
- **Performance Optimized**: Intelligent caching, streaming processing, and concurrent handling
- **Robust Error Handling**: Comprehensive fallback mechanisms and graceful degradation
- **Type-Safe Integration**: Structured interfaces and validation throughout the processing pipeline
- **Resource Protection**: Rate limiting and memory management prevent system overload

The system's integration with MessageCacheService and FlowOrchestrator creates a cohesive architecture that efficiently routes and processes multimodal content while providing excellent debugging and monitoring capabilities for production deployment.