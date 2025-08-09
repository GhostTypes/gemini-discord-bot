# Message Cache and Context Management System

## Executive Summary

The Message Cache and Context Management System implements a sophisticated sliding window conversation history cache that enables the Discord bot to maintain contextual awareness across conversations while optimizing performance through intelligent caching strategies. This system serves as the memory backbone of the bot, providing seamless conversation continuity, attachment preprocessing, and context optimization for AI interactions.

The MessageCacheService.ts implements a 64-message sliding window cache with automatic initialization, context optimization, and comprehensive attachment preprocessing. The system integrates closely with the database layer through Prisma and SQLite, providing reliable persistence with self-contained storage that eliminates external dependencies.

## Architecture Overview

### Core Components

#### MessageCacheService (src/services/MessageCacheService.ts)
The central caching service providing:
- **Sliding Window Cache**: Maintains 64-message conversation history with automatic cleanup
- **Automatic Context Initialization**: Backwards fetching from Discord to populate historical context
- **Generic Attachment Preprocessing**: Downloads and converts attachments during caching for instant future access
- **Context Optimization**: Relevance scoring and intelligent context window management
- **Foreign Key Relationship Handling**: Proper management of message replies and user references
- **Database Integration**: Seamless Prisma integration with optimized queries

#### Database Schema (prisma/schema.prisma)
Comprehensive relational schema supporting:
- **Users Table**: Discord user information with automatic creation
- **Channels Table**: Channel-specific settings and context window management
- **Messages Table**: Full message content with attachment data and relationships
- **Reply Relationships**: Proper foreign key handling for conversation threading
- **Indexing Strategy**: Optimized queries for cache operations and context retrieval

#### RelevanceScorer (src/services/RelevanceScorer.ts)
Advanced context optimization providing:
- **Message Relevance Analysis**: AI-powered scoring of message importance
- **Context Window Optimization**: Intelligent selection of most relevant messages
- **Token Budget Management**: Efficient use of context tokens for AI processing
- **Conversation Threading**: Understanding of reply relationships and conversation flow

### Sliding Window Cache Implementation

#### Core Cache Logic
```typescript
export class MessageCacheService {
  private readonly client: PrismaClient;
  private readonly cacheSize: number; // Default: 64 messages

  constructor(client: PrismaClient = prisma, cacheSize: number = parseInt(process.env.MESSAGE_CACHE_SIZE || '64')) {
    this.client = client;
    this.cacheSize = cacheSize;
  }
}
```

#### Cache Size Management
The system maintains a strict 64-message limit per channel with automatic cleanup:

```typescript
async maintainCacheSize(channelId: string): Promise<void> {
  // Count current messages in cache
  const messageCount = await this.client.message.count({
    where: { 
      channelId: channelId,
      createdAt: { gte: contextWindowStart } // Only count messages in current context window
    }
  });

  // If over limit, remove oldest messages
  if (messageCount > this.cacheSize) {
    const excessCount = messageCount - this.cacheSize;
    
    // Get oldest messages to remove
    const messagesToRemove = await this.client.message.findMany({
      where: { 
        channelId: channelId,
        createdAt: { gte: contextWindowStart }
      },
      orderBy: { createdAt: 'asc' },
      take: excessCount,
      select: { id: true, createdAt: true }
    });

    // Remove excess messages
    await this.client.message.deleteMany({
      where: {
        id: { in: messagesToRemove.map(m => m.id) }
      }
    });

    // Update context window start to exclude removed messages
    if (messagesToRemove.length > 0) {
      const newContextStart = messagesToRemove[messagesToRemove.length - 1].createdAt;
      await this.updateContextWindowStart(channelId, newContextStart);
    }

    logger.info('Cache size maintained', {
      channelId,
      removedCount: excessCount,
      newCacheSize: this.cacheSize
    });
  }
}
```

### Automatic Context Initialization

#### The Initialization Challenge
When a bot joins a channel or starts fresh, it needs historical context to provide meaningful responses. The initialization system solves this by fetching backwards from the current message until it reaches the desired cache size.

#### Backwards Fetching Implementation
```typescript
async initializeCacheIfNeeded(channel: any, currentMessage: DiscordMessage): Promise<void> {
  try {
    // Check if channel cache is already initialized
    const channelData = await this.client.channel.findUnique({
      where: { id: channel.id },
      select: { isInitialized: true, contextWindowStart: true }
    });

    if (channelData?.isInitialized) {
      return; // Already initialized
    }

    logger.info('Initializing message cache for channel', {
      channelId: channel.id,
      targetCacheSize: this.cacheSize
    });

    // Count current messages in cache
    const currentMessageCount = await this.client.message.count({
      where: { channelId: channel.id }
    });

    // Calculate how many more messages we need
    const messagesNeeded = this.cacheSize - currentMessageCount;
    
    if (messagesNeeded <= 0) {
      // Already have enough messages
      await this.markChannelInitialized(channel.id);
      return;
    }

    // Fetch historical messages backwards from current message
    const historicalMessages = await this.fetchDiscordHistoryBackwards(channel, messagesNeeded);
    
    if (historicalMessages.length > 0) {
      // Store historical messages in cache
      await this.storeHistoricalMessages(historicalMessages, channel.id);
      
      // CRITICAL: Update contextWindowStart to include historical messages
      const oldestHistoricalMessage = historicalMessages[0]; // First in chronological order
      await this.client.channel.update({
        where: { id: channel.id },
        data: { 
          contextWindowStart: oldestHistoricalMessage.createdAt,
          isInitialized: true 
        },
      });

      logger.info('Cache initialization completed', {
        channelId: channel.id,
        historicalMessagesFetched: historicalMessages.length,
        newContextWindowStart: oldestHistoricalMessage.createdAt
      });
    } else {
      // No historical messages available, just mark as initialized
      await this.markChannelInitialized(channel.id);
    }
  } catch (error) {
    logger.error('Cache initialization failed:', error);
    // Don't throw - graceful degradation
  }
}
```

#### Discord History Fetching
```typescript
private async fetchDiscordHistoryBackwards(channel: any, limit: number): Promise<DiscordMessage[]> {
  try {
    const messages: DiscordMessage[] = [];
    let lastMessageId: string | undefined;
    let remainingLimit = limit;

    // Fetch messages in batches (Discord API limitation: 100 messages per request)
    while (remainingLimit > 0) {
      const batchSize = Math.min(remainingLimit, 100);
      
      const fetchOptions: any = { limit: batchSize };
      if (lastMessageId) {
        fetchOptions.before = lastMessageId; // Fetch messages before this ID (backwards)
      }

      const batch = await channel.messages.fetch(fetchOptions);
      
      if (batch.size === 0) {
        break; // No more messages available
      }

      // Convert Discord messages to array and add to collection
      const batchArray = Array.from(batch.values());
      messages.push(...batchArray);
      
      // Update pagination cursor to continue backwards
      lastMessageId = batchArray[batchArray.length - 1].id;
      remainingLimit -= batch.size;

      logger.debug('Fetched historical message batch', {
        channelId: channel.id,
        batchSize: batch.size,
        totalFetched: messages.length,
        remainingLimit
      });
    }

    // Return in chronological order (oldest first)
    return messages.reverse();
  } catch (error) {
    logger.error('Failed to fetch Discord history:', error);
    return [];
  }
}
```

### Generic Attachment Preprocessing System

#### Overview
The attachment preprocessing system downloads and converts all supported attachment types during the caching process, eliminating duplicate downloads and providing instant access to processed content for future AI interactions.

#### Supported Attachment Types
```typescript
/**
 * Processes attachments from Discord message into base64 format during caching
 * Downloads and converts all supported attachment types for optimized future access
 */
private async processAttachmentsForStorage(message: DiscordMessage): Promise<{
  processedAttachments: any[] | null; 
  hasAttachments: boolean;
}> {
  const attachments = Array.from(message.attachments.values());
  
  if (attachments.length === 0) {
    return { processedAttachments: null, hasAttachments: false };
  }

  const processedAttachments = [];
  
  for (const attachment of attachments) {
    try {
      let processed = null;
      
      // IMAGE PROCESSING
      if (attachment.contentType?.startsWith('image/')) {
        const { MediaProcessor } = await import('./MediaProcessor.js');
        processed = await MediaProcessor.processAttachment(attachment);
        if (processed) {
          logger.debug('Successfully processed image attachment for cache', { 
            filename: attachment.name,
            type: processed.type,
            originalSize: attachment.size,
            processedSize: processed.data.length 
          });
        }
      }
      
      // PDF PROCESSING
      else if (attachment.contentType === 'application/pdf') {
        const { downloadAndConvertPDFToBase64 } = await import('../flows/pdfFlow.js');
        const { data: pdfBase64, filename: pdfFilename } = await downloadAndConvertPDFToBase64(attachment.url);
        
        processed = {
          type: 'pdf' as const,
          mimeType: 'application/pdf',
          data: pdfBase64,
          filename: pdfFilename || attachment.name || 'document.pdf',
          size: attachment.size || 0,
        };
        
        logger.debug('Successfully processed PDF attachment for cache', { 
          filename: processed.filename,
          type: processed.type,
          originalSize: attachment.size,
          processedSize: pdfBase64.length 
        });
      }
      
      // EXTENSIBLE: Add more attachment types here
      // else if (attachment.contentType?.startsWith('video/')) {
      //   processed = await VideoProcessor.processAttachment(attachment);
      // }
      // else if (attachment.contentType?.startsWith('text/')) {
      //   processed = await TextProcessor.processAttachment(attachment);
      // }
      
      if (processed) {
        processedAttachments.push(processed);
      } else {
        // Store metadata for unsupported types (no base64 processing)
        const metadata = {
          type: 'unsupported' as const,
          mimeType: attachment.contentType || 'unknown',
          data: '', // No base64 data for unsupported types
          filename: attachment.name || 'unknown',
          size: attachment.size || 0,
          url: attachment.url, // Keep URL for potential future processing
        };
        processedAttachments.push(metadata);
      }
    } catch (error) {
      logger.error(`Attachment processing failed for ${attachment.name}:`, error);
      
      // Store error metadata to prevent reprocessing attempts
      processedAttachments.push({
        type: 'error' as const,
        mimeType: attachment.contentType || 'unknown',
        data: '',
        filename: attachment.name || 'error',
        size: attachment.size || 0,
        error: error.message,
        url: attachment.url
      });
    }
  }

  return { processedAttachments, hasAttachments: true };
}
```

#### Attachment Retrieval for AI Flows
```typescript
/**
 * Retrieve cached attachments for a specific message
 * Returns processed attachments ready for AI consumption
 */
async getCachedAttachments(messageId: string): Promise<ProcessedAttachment[] | null> {
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
    
    // Filter out error and unsupported types, return only processable attachments
    return attachments
      .filter((attachment: any) => attachment.data && attachment.type !== 'error' && attachment.type !== 'unsupported')
      .map((attachment: any) => ({
        type: attachment.type,
        mimeType: attachment.mimeType,
        data: attachment.data, // Base64 encoded content
        filename: attachment.filename,
        size: attachment.size
      }));
  } catch (error) {
    logger.error('Failed to retrieve cached attachments:', error);
    return null;
  }
}
```

### Context Optimization and Relevance Scoring

#### Intelligent Context Selection
The system uses AI-powered relevance scoring to optimize context windows for maximum effectiveness within token limits:

```typescript
/**
 * Get optimized conversation context using relevance scoring
 * Returns the most relevant messages within token budget
 */
async getOptimizedContext(channelId: string, options: {
  maxTokens?: number;
  includeRelevanceScoring?: boolean;
  focusMessage?: string; // Message ID to focus relevance around
}): Promise<string> {
  const maxTokens = options.maxTokens || 4000;
  const includeScoring = options.includeRelevanceScoring ?? true;
  
  try {
    // Get all messages in current context window
    const channel = await this.getOrCreateChannel(channelId);
    const messages = await this.getFormattedContext(channelId);
    
    if (!includeScoring || messages.length <= 10) {
      // For small contexts, return all messages
      return messages;
    }
    
    // Use RelevanceScorer for optimization
    const relevanceScorer = new RelevanceScorer();
    const optimizedContext = await relevanceScorer.optimizeContext(
      messages, 
      maxTokens,
      options.focusMessage
    );
    
    logger.debug('Context optimized using relevance scoring', {
      channelId,
      originalMessageCount: messages.split('\n').length,
      optimizedMessageCount: optimizedContext.selectedMessages.length,
      tokenBudget: maxTokens,
      tokensUsed: optimizedContext.estimatedTokens,
      relevanceThreshold: optimizedContext.relevanceThreshold
    });
    
    return optimizedContext.content;
  } catch (error) {
    logger.error('Context optimization failed, falling back to basic context:', error);
    // Fallback to basic context
    return await this.getFormattedContext(channelId);
  }
}
```

#### Relevance Scoring Algorithm
```typescript
// RelevanceScorer implementation
export class RelevanceScorer {
  async optimizeContext(
    conversationText: string, 
    maxTokens: number, 
    focusMessageId?: string
  ): Promise<OptimizedContext> {
    // Parse conversation into individual messages
    const messages = this.parseConversationMessages(conversationText);
    
    // Score each message for relevance
    const scoredMessages = await this.scoreMessages(messages, focusMessageId);
    
    // Select messages that fit within token budget, prioritizing by relevance
    const selectedMessages = this.selectMessagesByRelevance(scoredMessages, maxTokens);
    
    // Reconstruct optimized context maintaining chronological order
    const optimizedContent = this.reconstructContext(selectedMessages);
    
    return {
      content: optimizedContent,
      selectedMessages: selectedMessages.map(m => m.id),
      estimatedTokens: this.estimateTokens(optimizedContent),
      relevanceThreshold: selectedMessages.length > 0 ? selectedMessages[selectedMessages.length - 1].relevanceScore : 0
    };
  }
  
  private async scoreMessages(messages: ParsedMessage[], focusMessageId?: string): Promise<ScoredMessage[]> {
    // Use AI to score message relevance based on multiple factors:
    // - Recency (newer messages get higher scores)
    // - User interactions (messages with replies get higher scores)
    // - Content similarity to focus message (if provided)
    // - Question/answer patterns (questions and their answers get higher scores)
    // - Bot mentions and direct interactions
    
    const scoringPrompt = this.buildScoringPrompt(messages, focusMessageId);
    
    try {
      const result = await ai.generate({
        model: gemini20FlashLite,
        prompt: scoringPrompt,
        config: new GenerationConfigBuilder()
          .temperature(0.1) // Low temperature for consistent scoring
          .maxOutputTokens(1000)
          .build(),
        output: { 
          schema: MessageRelevanceScoresSchema 
        }
      });
      
      return this.applyScoresToMessages(messages, result.output.scores);
    } catch (error) {
      logger.error('AI relevance scoring failed, using fallback scoring:', error);
      // Fallback to simple recency-based scoring
      return this.applyRecencyScoring(messages);
    }
  }
}
```

### Database Schema and Relationships

#### Complete Schema Definition
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = "file:./message_cache.db"
}

model User {
  id          String    @id
  username    String
  displayName String?
  bot         Boolean   @default(false)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relationships
  messages    Message[]

  @@map("users")
}

model Channel {
  id                   String    @id
  contextWindowStart   DateTime  @default(now())
  isInitialized        Boolean   @default(false)
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  
  // Relationships
  messages            Message[]

  @@map("channels")
}

model Message {
  id              String    @id
  content         String
  attachments     String?   // JSON string of processed attachments
  createdAt       DateTime
  updatedAt       DateTime  @updatedAt
  
  // Foreign keys
  authorId        String
  channelId       String
  replyToMessageId String?
  
  // Relationships
  author          User      @relation(fields: [authorId], references: [id])
  channel         Channel   @relation(fields: [channelId], references: [id])
  replyToMessage  Message?  @relation("MessageReplies", fields: [replyToMessageId], references: [id])
  replies         Message[] @relation("MessageReplies")
  
  // Indexes for performance
  @@index([channelId, createdAt])
  @@index([authorId])
  @@index([replyToMessageId])
  @@map("messages")
}
```

#### Foreign Key Relationship Handling
The system properly handles message reply relationships with graceful fallback for missing referenced messages:

```typescript
async cacheMessage(message: DiscordMessage): Promise<void> {
  try {
    // Create or get user first
    const author = await this.getOrCreateUser(message.author);
    
    // Create or get channel
    const channel = await this.getOrCreateChannel(message.channel.id);
    
    // Handle reply relationship
    let replyToMessageId: string | null = null;
    if (message.reference?.messageId) {
      // Check if referenced message exists in cache
      const referencedMessage = await this.client.message.findUnique({
        where: { id: message.reference.messageId },
        select: { id: true }
      });
      
      if (referencedMessage) {
        replyToMessageId = message.reference.messageId;
      } else {
        logger.debug('Referenced message not in cache, reply relationship will be null', {
          messageId: message.id,
          referencedMessageId: message.reference.messageId
        });
      }
    }
    
    // Process attachments during caching
    const { processedAttachments } = await this.processAttachmentsForStorage(message);
    
    // Create message with all relationships
    await this.client.message.create({
      data: {
        id: message.id,
        content: message.content,
        attachments: processedAttachments ? JSON.stringify(processedAttachments) : null,
        createdAt: message.createdAt,
        authorId: author.id,
        channelId: channel.id,
        replyToMessageId: replyToMessageId, // Null if referenced message not in cache
      },
    });
    
    // Initialize cache if needed
    await this.initializeCacheIfNeeded(message.channel, message);
    
    // Maintain cache size limit
    await this.maintainCacheSize(message.channel.id);
    
    logger.debug('Message cached successfully', {
      messageId: message.id,
      channelId: message.channel.id,
      hasAttachments: !!processedAttachments,
      hasReply: !!replyToMessageId
    });
  } catch (error) {
    logger.error('Failed to cache message:', error);
    throw error;
  }
}
```

### Context Formatting and Retrieval

#### Formatted Context Generation
The system provides well-formatted conversation context that includes user information, timestamps, reply relationships, and attachment metadata:

```typescript
/**
 * Get formatted conversation context for AI consumption
 * Includes user display names, timestamps, and reply relationships
 */
async getFormattedContext(channelId: string): Promise<string> {
  try {
    const channel = await this.getOrCreateChannel(channelId);
    
    // Get messages within current context window
    const messages = await this.client.message.findMany({
      where: { 
        channelId: channelId,
        createdAt: { gte: channel.contextWindowStart }
      },
      include: {
        author: true,
        replyToMessage: {
          include: { author: true }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    if (messages.length === 0) {
      return '';
    }

    // Format messages for AI consumption
    const formattedMessages = messages.map(message => {
      const authorName = message.author.displayName || message.author.username;
      const timestamp = message.createdAt.toISOString();
      
      // Handle reply context
      let replyContext = '';
      if (message.replyToMessage) {
        const replyAuthor = message.replyToMessage.author.displayName || message.replyToMessage.author.username;
        const replyPreview = message.replyToMessage.content.length > 50 
          ? message.replyToMessage.content.substring(0, 50) + '...' 
          : message.replyToMessage.content;
        replyContext = `[Replying to ${replyAuthor}: "${replyPreview}"] `;
      }
      
      // Include attachment information
      let attachmentInfo = '';
      if (message.attachments) {
        try {
          const attachments = JSON.parse(message.attachments);
          const attachmentTypes = attachments
            .filter((att: any) => att.type !== 'unsupported' && att.type !== 'error')
            .map((att: any) => `${att.type}:${att.filename}`)
            .join(', ');
          
          if (attachmentTypes) {
            attachmentInfo = ` [Attachments: ${attachmentTypes}]`;
          }
        } catch (error) {
          logger.warn('Failed to parse attachment data for context', { messageId: message.id });
        }
      }
      
      return `[${timestamp}] ${authorName}: ${replyContext}${message.content}${attachmentInfo}`;
    });

    const context = formattedMessages.join('\n');
    
    logger.debug('Formatted context generated', {
      channelId,
      messageCount: messages.length,
      contextLength: context.length,
      contextWindowStart: channel.contextWindowStart
    });
    
    return context;
  } catch (error) {
    logger.error('Failed to get formatted context:', error);
    return '';
  }
}
```

### Performance Optimization Strategies

#### Database Query Optimization
```typescript
// Optimized query patterns for cache operations
async getMessagesInWindow(channelId: string, windowStart: Date, limit: number = 100): Promise<MessageWithAuthor[]> {
  return await this.client.message.findMany({
    where: { 
      channelId: channelId,
      createdAt: { 
        gte: windowStart 
      }
    },
    include: {
      author: {
        select: {
          id: true,
          username: true,
          displayName: true,
          bot: true
        }
      },
      replyToMessage: {
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true
            }
          }
        }
      }
    },
    orderBy: { createdAt: 'asc' },
    take: limit
  });
}
```

#### Attachment Storage Optimization
```typescript
// Efficient attachment storage and retrieval
private async storeAttachmentOptimized(messageId: string, attachments: ProcessedAttachment[]): Promise<void> {
  // Store attachments as compressed JSON to save space
  const compressedAttachments = this.compressAttachmentData(attachments);
  
  await this.client.message.update({
    where: { id: messageId },
    data: {
      attachments: JSON.stringify(compressedAttachments)
    }
  });
}

private compressAttachmentData(attachments: ProcessedAttachment[]): any[] {
  return attachments.map(attachment => ({
    // Store only essential data to minimize storage
    type: attachment.type,
    mimeType: attachment.mimeType,
    data: attachment.data, // Base64 data - largest component
    filename: attachment.filename,
    size: attachment.size,
    // Omit redundant metadata to save space
  }));
}
```

#### Memory Management
```typescript
// Efficient memory usage for large contexts
async getContextWithMemoryManagement(channelId: string, maxMemoryMB: number = 50): Promise<string> {
  const maxBytes = maxMemoryMB * 1024 * 1024;
  let currentBytes = 0;
  const contextParts: string[] = [];
  
  // Get messages in reverse order (newest first) to prioritize recent context
  const messages = await this.client.message.findMany({
    where: { 
      channelId: channelId,
      createdAt: { gte: await this.getContextWindowStart(channelId) }
    },
    include: { author: true, replyToMessage: { include: { author: true } } },
    orderBy: { createdAt: 'desc' } // Newest first
  });
  
  // Add messages until memory limit reached
  for (const message of messages) {
    const formattedMessage = this.formatSingleMessage(message);
    const messageBytes = Buffer.byteLength(formattedMessage, 'utf8');
    
    if (currentBytes + messageBytes > maxBytes) {
      logger.debug('Context memory limit reached', {
        channelId,
        messagesIncluded: contextParts.length,
        memoryUsedMB: currentBytes / (1024 * 1024),
        limitMB: maxMemoryMB
      });
      break;
    }
    
    contextParts.unshift(formattedMessage); // Add to beginning to maintain chronological order
    currentBytes += messageBytes;
  }
  
  return contextParts.join('\n');
}
```

### Error Handling and Recovery

#### Database Connection Resilience
```typescript
// Robust database operations with retry logic
async performDatabaseOperation<T>(operation: () => Promise<T>, operationName: string): Promise<T | null> {
  const maxRetries = 3;
  const baseDelay = 1000;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      logger.warn(`Database operation '${operationName}' failed (attempt ${attempt}/${maxRetries}):`, error);
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        await this.sleep(delay);
      } else {
        logger.error(`Database operation '${operationName}' failed after ${maxRetries} attempts:`, error);
        return null;
      }
    }
  }
  
  return null;
}
```

#### Cache Corruption Recovery
```typescript
// Handle cache corruption and rebuild if necessary
async validateAndRepairCache(channelId: string): Promise<boolean> {
  try {
    // Check cache integrity
    const issues = await this.detectCacheIssues(channelId);
    
    if (issues.length === 0) {
      return true; // Cache is healthy
    }
    
    logger.warn('Cache issues detected, attempting repair', {
      channelId,
      issues: issues.map(issue => issue.type)
    });
    
    // Attempt to repair each issue
    for (const issue of issues) {
      try {
        await this.repairCacheIssue(channelId, issue);
      } catch (repairError) {
        logger.error(`Failed to repair cache issue '${issue.type}':`, repairError);
      }
    }
    
    // Revalidate after repair
    const remainingIssues = await this.detectCacheIssues(channelId);
    
    if (remainingIssues.length > 0) {
      logger.warn('Cache repair incomplete, rebuilding cache', {
        channelId,
        remainingIssues: remainingIssues.map(issue => issue.type)
      });
      
      await this.rebuildCache(channelId);
    }
    
    return true;
  } catch (error) {
    logger.error('Cache validation and repair failed:', error);
    return false;
  }
}

private async detectCacheIssues(channelId: string): Promise<CacheIssue[]> {
  const issues: CacheIssue[] = [];
  
  // Check for orphaned messages (messages without valid authors)
  const orphanedMessages = await this.client.message.findMany({
    where: {
      channelId,
      author: null
    },
    select: { id: true }
  });
  
  if (orphanedMessages.length > 0) {
    issues.push({
      type: 'ORPHANED_MESSAGES',
      count: orphanedMessages.length,
      details: { messageIds: orphanedMessages.map(m => m.id) }
    });
  }
  
  // Check for corrupted attachment data
  const messagesWithAttachments = await this.client.message.findMany({
    where: {
      channelId,
      attachments: { not: null }
    },
    select: { id: true, attachments: true }
  });
  
  const corruptedAttachments = messagesWithAttachments.filter(message => {
    try {
      JSON.parse(message.attachments!);
      return false;
    } catch {
      return true;
    }
  });
  
  if (corruptedAttachments.length > 0) {
    issues.push({
      type: 'CORRUPTED_ATTACHMENTS',
      count: corruptedAttachments.length,
      details: { messageIds: corruptedAttachments.map(m => m.id) }
    });
  }
  
  // Check for invalid reply relationships
  const invalidReplies = await this.client.message.findMany({
    where: {
      channelId,
      replyToMessageId: { not: null },
      replyToMessage: null
    },
    select: { id: true, replyToMessageId: true }
  });
  
  if (invalidReplies.length > 0) {
    issues.push({
      type: 'INVALID_REPLIES',
      count: invalidReplies.length,
      details: { messageIds: invalidReplies.map(m => m.id) }
    });
  }
  
  return issues;
}
```

### Integration with Discord API

#### Discord Message Fetching
```typescript
// Robust Discord API integration with rate limiting awareness
async fetchDiscordMessage(channelId: string, messageId: string): Promise<DiscordMessage | null> {
  try {
    const channel = await this.discordClient.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      return null;
    }
    
    const message = await channel.messages.fetch(messageId);
    return message;
  } catch (error) {
    if (error.status === 404) {
      logger.debug('Discord message not found', { channelId, messageId });
      return null;
    } else if (error.status === 429) {
      logger.warn('Discord API rate limit hit, retrying after delay', { channelId, messageId });
      await this.sleep(error.retry_after || 5000);
      return await this.fetchDiscordMessage(channelId, messageId);
    } else {
      logger.error('Discord API error:', error);
      return null;
    }
  }
}
```

#### Bulk Message Operations
```typescript
// Efficient bulk operations for cache initialization
async bulkCacheDiscordMessages(channel: any, messages: DiscordMessage[]): Promise<number> {
  let cachedCount = 0;
  const batchSize = 10;
  
  // Process in batches to avoid overwhelming the database
  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    
    try {
      // Process all attachments in the batch concurrently
      const processedBatch = await Promise.all(
        batch.map(async (message) => {
          const { processedAttachments } = await this.processAttachmentsForStorage(message);
          return {
            message,
            processedAttachments
          };
        })
      );
      
      // Bulk insert the batch
      await this.client.message.createMany({
        data: processedBatch.map(({ message, processedAttachments }) => ({
          id: message.id,
          content: message.content,
          attachments: processedAttachments ? JSON.stringify(processedAttachments) : null,
          createdAt: message.createdAt,
          authorId: message.author.id,
          channelId: channel.id,
          // Note: Reply relationships handled separately due to foreign key constraints
        })),
        skipDuplicates: true // Avoid conflicts with existing messages
      });
      
      cachedCount += batch.length;
      
      logger.debug('Bulk cached message batch', {
        channelId: channel.id,
        batchSize: batch.length,
        totalCached: cachedCount,
        progress: `${i + batch.length}/${messages.length}`
      });
      
      // Small delay to avoid overwhelming the database
      if (i + batchSize < messages.length) {
        await this.sleep(100);
      }
    } catch (error) {
      logger.error(`Failed to bulk cache batch ${i}-${i + batch.length}:`, error);
    }
  }
  
  return cachedCount;
}
```

## Debugging and Troubleshooting

### Cache Initialization Issues

#### Debugging Context Window Problems
```typescript
// Debug helper for context window issues
async debugContextWindow(channelId: string): Promise<void> {
  try {
    const channel = await this.client.channel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        contextWindowStart: true,
        isInitialized: true,
        createdAt: true
      }
    });
    
    const messageStats = await this.client.message.aggregate({
      where: { channelId },
      _count: { id: true },
      _min: { createdAt: true },
      _max: { createdAt: true }
    });
    
    const messagesInWindow = await this.client.message.count({
      where: {
        channelId,
        createdAt: { gte: channel?.contextWindowStart || new Date(0) }
      }
    });
    
    logger.info('Context window debug info', {
      channelId,
      channel: {
        exists: !!channel,
        isInitialized: channel?.isInitialized,
        contextWindowStart: channel?.contextWindowStart,
        channelCreated: channel?.createdAt
      },
      messages: {
        totalInCache: messageStats._count.id,
        inCurrentWindow: messagesInWindow,
        oldestMessage: messageStats._min.createdAt,
        newestMessage: messageStats._max.createdAt
      },
      analysis: {
        windowTooRecent: channel?.contextWindowStart && messageStats._min.createdAt && 
          channel.contextWindowStart > messageStats._min.createdAt,
        needsReinitialization: !channel?.isInitialized && messageStats._count.id > 0
      }
    });
  } catch (error) {
    logger.error('Context window debugging failed:', error);
  }
}
```

#### Common Initialization Problems and Solutions

**Issue**: Bot shows "I don't have access to past conversations" despite having messages in cache
**Cause**: Context window start is too recent, filtering out cached messages
**Solution**: Update context window start to include all cached messages

```typescript
// Fix context window to include all cached messages
async fixContextWindow(channelId: string): Promise<void> {
  try {
    const oldestMessage = await this.client.message.findFirst({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true }
    });
    
    if (oldestMessage) {
      await this.client.channel.update({
        where: { id: channelId },
        data: {
          contextWindowStart: oldestMessage.createdAt,
          isInitialized: true
        }
      });
      
      logger.info('Context window fixed', {
        channelId,
        newContextWindowStart: oldestMessage.createdAt
      });
    }
  } catch (error) {
    logger.error('Failed to fix context window:', error);
  }
}
```

**Issue**: Cache initialization fetches no historical messages
**Cause**: Trying to fetch "before" the first message in channel
**Solution**: Fetch backwards from current message position

```typescript
// Correct backwards fetching implementation
private async fetchDiscordHistoryBackwards(channel: any, limit: number): Promise<DiscordMessage[]> {
  const messages: DiscordMessage[] = [];
  let before: string | undefined;
  
  // Start from most recent messages and go backwards
  while (messages.length < limit) {
    const batchSize = Math.min(limit - messages.length, 100);
    
    const fetchOptions: any = { limit: batchSize };
    if (before) {
      fetchOptions.before = before; // Fetch messages before this message ID
    }
    
    const batch = await channel.messages.fetch(fetchOptions);
    if (batch.size === 0) {
      break; // No more messages
    }
    
    const batchArray = Array.from(batch.values());
    messages.push(...batchArray);
    
    // Set pagination cursor to the oldest message in this batch
    before = batchArray[batchArray.length - 1].id;
  }
  
  // Return in chronological order (oldest first)
  return messages.reverse();
}
```

### Attachment Processing Issues

#### Debugging Attachment Cache Misses
```typescript
// Debug attachment caching issues
async debugAttachmentCaching(messageId: string): Promise<void> {
  try {
    const message = await this.client.message.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        attachments: true,
        createdAt: true
      }
    });
    
    if (!message) {
      logger.info('Message not found in cache', { messageId });
      return;
    }
    
    let attachmentData = null;
    let parsedAttachments = null;
    let parseError = null;
    
    if (message.attachments) {
      try {
        parsedAttachments = JSON.parse(message.attachments);
        attachmentData = {
          count: parsedAttachments.length,
          types: parsedAttachments.map((att: any) => att.type),
          sizes: parsedAttachments.map((att: any) => att.size),
          hasData: parsedAttachments.map((att: any) => !!att.data && att.data.length > 0)
        };
      } catch (error) {
        parseError = error.message;
      }
    }
    
    logger.info('Attachment caching debug', {
      messageId,
      message: {
        exists: true,
        createdAt: message.createdAt,
        hasAttachmentsField: !!message.attachments,
        attachmentsFieldLength: message.attachments?.length || 0
      },
      attachments: attachmentData,
      parseError
    });
  } catch (error) {
    logger.error('Attachment debugging failed:', error);
  }
}
```

#### Attachment Processing Recovery
```typescript
// Reprocess failed attachments
async reprocessFailedAttachments(channelId: string): Promise<number> {
  try {
    // Find messages with error attachments or unsupported types that might now be supported
    const messages = await this.client.message.findMany({
      where: { 
        channelId,
        attachments: { not: null }
      },
      select: { id: true, attachments: true }
    });
    
    let reprocessedCount = 0;
    
    for (const message of messages) {
      try {
        const attachments = JSON.parse(message.attachments!);
        const failedAttachments = attachments.filter((att: any) => 
          att.type === 'error' || (att.type === 'unsupported' && att.url)
        );
        
        if (failedAttachments.length > 0) {
          logger.info('Reprocessing failed attachments', {
            messageId: message.id,
            failedCount: failedAttachments.length
          });
          
          // Attempt to reprocess failed attachments
          const reprocessedAttachments = [];
          for (const attachment of attachments) {
            if (attachment.type === 'error' || attachment.type === 'unsupported') {
              if (attachment.url) {
                // Try to reprocess the attachment
                const mockAttachment = {
                  url: attachment.url,
                  contentType: attachment.mimeType,
                  name: attachment.filename,
                  size: attachment.size
                };
                
                const reprocessed = await this.reprocessSingleAttachment(mockAttachment);
                if (reprocessed) {
                  reprocessedAttachments.push(reprocessed);
                  logger.debug('Successfully reprocessed attachment', {
                    filename: attachment.filename,
                    newType: reprocessed.type
                  });
                } else {
                  reprocessedAttachments.push(attachment); // Keep original if reprocessing fails
                }
              } else {
                reprocessedAttachments.push(attachment); // Keep original if no URL
              }
            } else {
              reprocessedAttachments.push(attachment); // Keep successful attachments
            }
          }
          
          // Update message with reprocessed attachments
          await this.client.message.update({
            where: { id: message.id },
            data: {
              attachments: JSON.stringify(reprocessedAttachments)
            }
          });
          
          reprocessedCount++;
        }
      } catch (error) {
        logger.warn(`Failed to reprocess attachments for message ${message.id}:`, error);
      }
    }
    
    logger.info('Attachment reprocessing completed', {
      channelId,
      reprocessedMessages: reprocessedCount
    });
    
    return reprocessedCount;
  } catch (error) {
    logger.error('Attachment reprocessing failed:', error);
    return 0;
  }
}
```

### Performance Monitoring

#### Cache Performance Metrics
```typescript
// Performance monitoring for cache operations
class CachePerformanceMonitor {
  private metrics = new Map<string, CacheMetrics>();
  
  async trackOperation<T>(
    operation: string,
    channelId: string,
    operation_func: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage().heapUsed;
    
    try {
      const result = await operation_func();
      
      this.recordSuccess(operation, channelId, startTime, startMemory);
      return result;
    } catch (error) {
      this.recordFailure(operation, channelId, startTime, error);
      throw error;
    }
  }
  
  private recordSuccess(operation: string, channelId: string, startTime: number, startMemory: number): void {
    const endTime = Date.now();
    const endMemory = process.memoryUsage().heapUsed;
    
    const key = `${operation}:${channelId}`;
    const existing = this.metrics.get(key) || {
      operation,
      channelId,
      totalOperations: 0,
      successfulOperations: 0,
      totalTime: 0,
      averageTime: 0,
      maxTime: 0,
      memoryUsage: 0,
      errors: []
    };
    
    const operationTime = endTime - startTime;
    const memoryDelta = endMemory - startMemory;
    
    existing.totalOperations++;
    existing.successfulOperations++;
    existing.totalTime += operationTime;
    existing.averageTime = existing.totalTime / existing.successfulOperations;
    existing.maxTime = Math.max(existing.maxTime, operationTime);
    existing.memoryUsage = Math.max(existing.memoryUsage, memoryDelta);
    
    this.metrics.set(key, existing);
    
    // Log slow operations
    if (operationTime > 5000) { // 5 seconds
      logger.warn('Slow cache operation detected', {
        operation,
        channelId,
        duration: operationTime,
        memoryDelta
      });
    }
  }
  
  async generatePerformanceReport(): Promise<void> {
    logger.info('Cache Performance Report', {
      metrics: Array.from(this.metrics.values()).map(metric => ({
        operation: metric.operation,
        channelId: metric.channelId,
        totalOperations: metric.totalOperations,
        successRate: (metric.successfulOperations / metric.totalOperations * 100).toFixed(2) + '%',
        averageTime: Math.round(metric.averageTime) + 'ms',
        maxTime: metric.maxTime + 'ms',
        peakMemoryUsage: Math.round(metric.memoryUsage / 1024 / 1024) + 'MB',
        errorCount: metric.errors.length
      }))
    });
  }
}
```

## Extension Points and Future Enhancements

### Adding New Attachment Types

The generic attachment processing system is designed for easy extension:

```typescript
// Example: Adding support for audio files
private async processAudioAttachments(message: DiscordMessage): Promise<ProcessedAttachment[]> {
  const audioAttachments: ProcessedAttachment[] = [];
  
  for (const attachment of message.attachments.values()) {
    if (attachment.contentType?.startsWith('audio/')) {
      try {
        // Process audio file
        const { AudioProcessor } = await import('./AudioProcessor.js');
        const processed = await AudioProcessor.processAttachment(attachment);
        
        if (processed) {
          audioAttachments.push({
            type: 'audio' as const,
            mimeType: attachment.contentType,
            data: processed.data, // Base64 encoded audio
            filename: attachment.name || 'audio',
            size: attachment.size || 0,
            metadata: {
              duration: processed.duration,
              format: processed.format,
              sampleRate: processed.sampleRate
            }
          });
          
          logger.debug('Successfully processed audio attachment for cache', { 
            filename: attachment.name,
            duration: processed.duration,
            size: attachment.size
          });
        }
      } catch (error) {
        logger.error(`Audio processing failed for ${attachment.name}:`, error);
      }
    }
  }
  
  return audioAttachments;
}
```

### Context Intelligence Enhancements

Future enhancements could include more sophisticated context management:

```typescript
// Example: Semantic context clustering
class SemanticContextManager {
  async clusterMessagesByTopic(messages: ParsedMessage[]): Promise<MessageCluster[]> {
    // Use AI to identify conversation topics and cluster related messages
    const topics = await this.identifyConversationTopics(messages);
    
    return topics.map(topic => ({
      topic: topic.name,
      relevanceScore: topic.score,
      messages: messages.filter(msg => 
        this.calculateTopicSimilarity(msg.content, topic.keywords) > 0.7
      ),
      timeRange: {
        start: topic.firstMessage.createdAt,
        end: topic.lastMessage.createdAt
      }
    }));
  }
  
  async getContextForTopic(channelId: string, topic: string, maxTokens: number): Promise<string> {
    // Retrieve context focused on a specific conversation topic
    const messages = await this.getRelevantMessagesForTopic(channelId, topic);
    const optimizedContext = await this.optimizeForTokenBudget(messages, maxTokens);
    
    return optimizedContext;
  }
}
```

### Advanced Cache Strategies

Potential improvements to caching strategies:

```typescript
// Example: Predictive caching based on conversation patterns
class PredictiveCacheManager {
  async predictRelevantHistory(channelId: string, currentMessage: string): Promise<string[]> {
    // Use AI to predict which historical messages are likely to be relevant
    const conversationPattern = await this.analyzeConversationPattern(channelId);
    const messageEmbeddings = await this.generateMessageEmbeddings(currentMessage);
    
    // Find historically similar conversations and cache relevant context
    const similarConversations = await this.findSimilarConversationContexts(
      messageEmbeddings,
      conversationPattern
    );
    
    return similarConversations.map(conv => conv.contextId);
  }
  
  async prefetchRelevantContext(channelId: string, predictedContextIds: string[]): Promise<void> {
    // Prefetch and cache context that's likely to be needed
    for (const contextId of predictedContextIds) {
      await this.cacheContextInMemory(channelId, contextId);
    }
  }
}
```

## Conclusion

The Message Cache and Context Management System provides a robust, intelligent foundation for maintaining conversation history and context in Discord bot applications. Its sophisticated sliding window cache, automatic initialization, and comprehensive attachment preprocessing create an optimal balance between performance and functionality.

Key architectural strengths:
- **Intelligent Sliding Window**: Maintains optimal context size while preserving conversation continuity
- **Automatic Initialization**: Seamless backwards fetching to populate historical context without manual intervention
- **Generic Attachment Processing**: Extensible preprocessing system that eliminates duplicate downloads and provides instant access
- **Context Optimization**: AI-powered relevance scoring ensures the most valuable context is preserved within token budgets
- **Robust Error Handling**: Comprehensive recovery mechanisms and graceful degradation
- **Database Integration**: Efficient Prisma/SQLite integration with proper relationships and indexing
- **Performance Optimized**: Memory management, query optimization, and caching strategies minimize resource usage

The system's modular design and extensive debugging capabilities make it maintainable and extensible, while its integration with the broader Discord bot architecture ensures seamless operation across all bot functions. This foundation enables sophisticated conversational AI capabilities while maintaining excellent performance characteristics suitable for production deployment.