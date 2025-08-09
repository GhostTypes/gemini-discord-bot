# Discord Integration Patterns Guide

## Executive Summary

The Discord Integration Patterns Guide provides comprehensive documentation for the sophisticated Discord.js integration architecture that enables seamless real-time communication between the bot and Discord servers. This system implements advanced patterns for streaming responses, message editing, interaction handling, and error recovery while maintaining optimal user experience and system reliability.

The DiscordBot.ts service acts as the central orchestration point, coordinating between Discord.js client management, specialized service layers, and event-driven architecture. The integration emphasizes streaming response capabilities, graceful error handling, and maintainable event listener patterns that scale effectively across multiple servers and high-volume interactions.

## Architecture Overview

### Core Components

#### DiscordBot Service (src/services/DiscordBot.ts)
Central Discord client orchestration providing:
- **Discord.js Client Management**: Proper intent configuration and lifecycle management
- **Service Coordination**: Integration with CommandService, MessageHandler, and MessageCacheService
- **Event Listener Setup**: Modular event handling with clean separation of concerns
- **Graceful Lifecycle**: Startup sequence coordination and shutdown handling
- **Client State Management**: Discord client state synchronization across services

#### Event Listener Architecture (src/listeners/)
Modular event handling system:
- **readyListener.ts**: Bot initialization and command registration
- **messageCreateListener.ts**: Message processing and routing delegation
- **interactionCreateListener.ts**: Slash command and component interaction handling
- **errorListener.ts**: Global error handling and recovery mechanisms

#### MessageHandler (src/services/MessageHandler.ts)
Primary message processing coordinator:
- **Content Analysis Integration**: Works with ContentDetectionService for message understanding
- **Flow Orchestration**: Delegates to FlowOrchestrator for intelligent routing
- **Streaming Response Management**: Coordinates streaming AI responses with Discord message editing
- **Cache Integration**: Seamless integration with MessageCacheService for context management
- **Game Handler Coordination**: Manages game-specific message routing and state transitions

### Discord.js Client Configuration

#### Intent Management
The system uses precisely configured intents to minimize resource usage while enabling full functionality:

```typescript
export class DiscordBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,           // Essential for server operations
        GatewayIntentBits.GuildMessages,    // Required for message handling
        GatewayIntentBits.MessageContent,   // Necessary for content analysis
        GatewayIntentBits.DirectMessages,   // Support for DM interactions
      ],
    });
  }
}
```

**Intent Justification:**
- **Guilds**: Required for basic server operations and channel access
- **GuildMessages**: Enables message event reception and processing
- **MessageContent**: Critical for AI analysis and content detection
- **DirectMessages**: Supports private bot interactions

#### Service Integration Pattern
```typescript
constructor() {
  // Initialize core services with dependency injection
  this.messageCacheService = new MessageCacheService();
  this.commandService = new CommandService(this.client);
  this.messageHandler = new MessageHandler(
    this.messageCacheService, 
    this.client.user?.id || '', // Will be updated after login
    this.client
  );

  this.setupEventHandlers();
}
```

The constructor establishes the service dependency graph, ensuring proper initialization order and service communication channels.

## Event Handling Architecture

### Ready Event Processing

The ready event handles critical initialization that requires an authenticated Discord client:

```typescript
// In readyListener.ts
export async function handleReady(client: Client<true>, commandService: CommandService): Promise<void> {
  try {
    logger.info(`Discord bot ready! Logged in as ${client.user.tag}`);
    logger.info(`Bot is in ${client.guilds.cache.size} guilds`);

    // Register slash commands
    await commandService.registerCommands();
    logger.info('Slash commands registered successfully');

    // Set bot status
    client.user.setPresence({
      activities: [{
        name: 'conversations and games',
        type: ActivityType.Listening
      }],
      status: 'online'
    });

    logger.info('Discord bot initialization completed');
  } catch (error) {
    logger.error('Error during bot ready event:', error);
    throw error; // Critical failure - should stop bot startup
  }
}

// In DiscordBot.ts setupEventHandlers()
this.client.once(Events.ClientReady, async (readyClient) => {
  // CRITICAL: Update messageHandler with actual bot user ID after login
  this.messageHandler = new MessageHandler(
    this.messageCacheService, 
    readyClient.user.id, // Now we have the real bot user ID
    readyClient
  );
  
  // Initialize GameManager with Discord client
  const { initializeGameManager } = await import('../flows/gameFlow.js');
  initializeGameManager(readyClient);

  // Initialize GameHandler callback now that GameManager is ready
  this.messageHandler.initializeGameHandlerCallback();
  
  await handleReady(readyClient, this.commandService);
});
```

**Key Patterns:**
1. **Service Re-initialization**: MessageHandler is recreated with real bot user ID after authentication
2. **GameManager Initialization**: Game systems initialized only after Discord client is ready
3. **Callback Registration**: Cross-service callbacks established after all components are initialized
4. **Error Propagation**: Critical initialization errors are propagated to stop startup

### Message Processing Pipeline

The message creation event implements a sophisticated processing pipeline:

```typescript
// In messageCreateListener.ts
export function handleMessageCreate(message: Message, messageHandler: MessageHandler): void {
  // Fire-and-forget pattern with comprehensive error handling
  handleMessageCreateAsync(message, messageHandler).catch(error => {
    logger.error('Unhandled error in message processing:', error);
  });
}

async function handleMessageCreateAsync(message: Message, messageHandler: MessageHandler): Promise<void> {
  try {
    // Ignore bot messages (prevent infinite loops)
    if (message.author.bot) {
      return;
    }

    // Delegate to MessageHandler for processing
    await messageHandler.handleMessage(message);
  } catch (error) {
    logger.error('Message handling failed:', error);
    
    // Attempt to send user-friendly error response
    try {
      await message.reply('I encountered an error processing your message. Please try again.');
    } catch (replyError) {
      logger.error('Failed to send error reply:', replyError);
    }
  }
}
```

#### MessageHandler Processing Flow

```typescript
// In MessageHandler.ts
async handleMessage(message: Message): Promise<void> {
  try {
    // 1. CACHE THE MESSAGE FIRST (for context building)
    await this.messageCacheService.cacheMessage(message);
    
    // 2. CHECK BOT MENTIONS AND RESPOND IMMEDIATELY IF NEEDED
    const botMention = `<@${this.botUserId}>`;
    if (message.content.includes(botMention)) {
      logger.info('Bot mentioned in message', {
        messageId: message.id,
        channelId: message.channelId,
        userId: message.author.id
      });
    }
    
    // 3. CLEAN MESSAGE CONTENT (remove mentions, normalize whitespace)
    const cleanMessage = this.cleanMessageContent(message.content);
    
    // 4. ANALYZE CONTENT FOR ROUTING DECISIONS
    const contentAnalysis = await this.contentDetectionService.analyzeContent(message, null);
    
    // 5. ROUTE TO APPROPRIATE PROCESSING FLOW
    await this.flowOrchestrator.routeMessage(message, cleanMessage, null, contentAnalysis);
    
  } catch (error) {
    logger.error('Message handling failed:', error);
    await this.handleMessageError(message, error);
  }
}

private cleanMessageContent(content: string): string {
  return content
    .replace(/<@!?\d+>/g, '') // Remove Discord user mentions
    .replace(/<#\d+>/g, '')   // Remove channel mentions  
    .replace(/<@&\d+>/g, '')  // Remove role mentions
    .replace(/<:\w+:\d+>/g, '') // Remove custom emojis
    .trim();
}
```

**Processing Pipeline Stages:**
1. **Message Caching**: Store message for context building before processing
2. **Mention Detection**: Identify and log bot mentions for analytics
3. **Content Cleaning**: Remove Discord-specific formatting for AI processing
4. **Content Analysis**: Comprehensive analysis for routing decisions
5. **Flow Routing**: Delegate to appropriate specialized processing flow

### Interaction Handling

The interaction system handles slash commands and component interactions:

```typescript
// In interactionCreateListener.ts
export function handleInteractionCreate(interaction: Interaction, commandService: CommandService): void {
  handleInteractionCreateAsync(interaction, commandService).catch(error => {
    logger.error('Unhandled error in interaction processing:', error);
  });
}

async function handleInteractionCreateAsync(interaction: Interaction, commandService: CommandService): Promise<void> {
  try {
    if (interaction.isChatInputCommand()) {
      // Handle slash commands
      await commandService.handleCommand(interaction);
    } else if (interaction.isButton()) {
      // Handle button interactions (games, confirmations, etc.)
      await commandService.handleButtonInteraction(interaction);
    } else if (interaction.isSelectMenu()) {
      // Handle select menu interactions
      await commandService.handleSelectMenuInteraction(interaction);
    } else if (interaction.isModalSubmit()) {
      // Handle modal form submissions
      await commandService.handleModalSubmission(interaction);
    } else {
      logger.warn('Unhandled interaction type', { 
        type: interaction.type,
        interactionId: interaction.id 
      });
    }
  } catch (error) {
    logger.error('Interaction handling failed:', error);
    
    // Attempt error response based on interaction state
    try {
      if (interaction.isRepliable()) {
        if (interaction.replied || interaction.deferred) {
          await interaction.editReply('An error occurred while processing your interaction.');
        } else {
          await interaction.reply({
            content: 'An error occurred while processing your interaction.',
            ephemeral: true
          });
        }
      }
    } catch (responseError) {
      logger.error('Failed to send interaction error response:', responseError);
    }
  }
}
```

## Streaming Response Implementation

### The Streaming Challenge

Real-time AI response streaming to Discord requires careful coordination between AI generation and Discord message editing to create smooth, responsive user experiences.

#### Core Streaming Architecture

```typescript
// In streamingHandler.ts
export class StreamingHandler {
  private currentMessage: Message | null = null;
  private messageContent: string = '';
  private lastUpdateTime: number = 0;
  private updateThrottleMs: number = 500; // Minimum time between Discord API calls
  private maxContentLength: number = 1900; // Leave room for additional content

  async handleChunk(chunk: string, message: Message): Promise<void> {
    // CRITICAL: This method must be awaited in streaming loops
    // to prevent race conditions that create multiple messages
    
    this.messageContent += chunk;
    const now = Date.now();
    
    // Throttle updates to prevent Discord rate limiting
    if (now - this.lastUpdateTime < this.updateThrottleMs && 
        this.messageContent.length < this.maxContentLength) {
      return; // Skip update, will be sent with next chunk
    }
    
    try {
      if (!this.currentMessage) {
        // Create initial message
        this.currentMessage = await message.reply(this.messageContent);
        logger.debug('Created initial streaming message', {
          messageId: this.currentMessage.id,
          contentLength: this.messageContent.length
        });
      } else {
        // Edit existing message
        await this.currentMessage.edit(this.messageContent);
        logger.debug('Updated streaming message', {
          messageId: this.currentMessage.id,
          contentLength: this.messageContent.length
        });
      }
      
      this.lastUpdateTime = now;
      
      // Handle message splitting if content gets too long
      if (this.messageContent.length > this.maxContentLength) {
        await this.handleMessageSplit(message);
      }
    } catch (error) {
      logger.error('Streaming update failed:', error);
      
      // Reset streaming state on error
      this.reset();
      throw error;
    }
  }

  private async handleMessageSplit(originalMessage: Message): Promise<void> {
    // Split content at appropriate boundaries
    const { MessageSplitter } = await import('./messageSplitter.js');
    const parts = MessageSplitter.splitContent(this.messageContent, 2000);
    
    if (parts.length > 1) {
      try {
        // Update current message with first part
        await this.currentMessage!.edit(parts[0]);
        
        // Create new message for continuation
        const continuationMessage = await originalMessage.reply(parts[1]);
        
        // Update streaming state to continue on new message
        this.currentMessage = continuationMessage;
        this.messageContent = parts[1];
        
        logger.info('Message split during streaming', {
          originalMessageId: this.currentMessage!.id,
          continuationMessageId: continuationMessage.id,
          parts: parts.length
        });
      } catch (error) {
        logger.error('Message split failed:', error);
        throw error;
      }
    }
  }

  reset(): void {
    this.currentMessage = null;
    this.messageContent = '';
    this.lastUpdateTime = 0;
  }
}
```

#### AI Flow Integration

All AI flows implement consistent streaming patterns:

```typescript
// Example from chatFlow.ts
export async function streamChatResponse(
  message: Message,
  prompt: string,
  onChunk: (chunk: string) => Promise<void>
): Promise<void> {
  try {
    const stream = await ai.generateStream({
      model: gemini20FlashLite,
      prompt,
      config: new GenerationConfigBuilder()
        .temperature(0.7)
        .maxOutputTokens(4096)
        .build()
    });

    // CRITICAL: Always await onChunk to prevent race conditions
    for await (const chunk of stream) {
      if (chunk.text) {
        await onChunk(chunk.text); // This prevents multiple message creation
      }
    }
  } catch (error) {
    logger.error('Chat flow streaming error:', error);
    throw error;
  }
}

// Usage in FlowOrchestrator
private async handleConversation(
  message: Message, 
  cleanMessage: string, 
  isMultimodal: boolean, 
  referencedMessage: Message | null
): Promise<void> {
  const streamingHandler = new StreamingHandler();
  
  try {
    // Set up streaming callback
    const onChunk = async (chunk: string) => {
      await streamingHandler.handleChunk(chunk, message);
    };

    // Get conversation context
    const context = await this.messageCacheService.getOptimizedContext(message.channelId, {
      maxTokens: 2000,
      includeRelevanceScoring: true
    });

    const prompt = this.buildConversationPrompt(cleanMessage, context, isMultimodal);

    // Start streaming with proper error handling
    if (isMultimodal && contentAnalysis.attachmentCache.hasCachedData) {
      await streamMultimodalChatResponse(
        message, 
        prompt, 
        contentAnalysis.attachmentCache.cachedAttachments,
        onChunk
      );
    } else {
      await streamChatResponse(message, prompt, onChunk);
    }

  } catch (error) {
    logger.error('Conversation handling failed:', error);
    
    // Clean up streaming state
    streamingHandler.reset();
    
    // Send error message to user
    try {
      await message.reply('I encountered an error generating a response. Please try again.');
    } catch (replyError) {
      logger.error('Failed to send error reply:', replyError);
    }
  }
}
```

### Message Splitting Strategy

The system implements intelligent message splitting for content that exceeds Discord's limits:

```typescript
// In messageSplitter.ts
export class MessageSplitter {
  private static readonly MAX_MESSAGE_LENGTH = 2000;
  private static readonly PREFERRED_SPLIT_LENGTH = 1900; // Leave room for continuation indicators

  static splitContent(content: string, maxLength: number = this.MAX_MESSAGE_LENGTH): string[] {
    if (content.length <= maxLength) {
      return [content];
    }

    const parts: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= maxLength) {
        parts.push(remaining);
        break;
      }

      // Find best split point within the length limit
      const splitPoint = this.findBestSplitPoint(remaining, maxLength);
      
      if (splitPoint === -1) {
        // No good split point found, force split at maxLength
        parts.push(remaining.substring(0, maxLength - 3) + '...');
        remaining = '...' + remaining.substring(maxLength - 3);
      } else {
        parts.push(remaining.substring(0, splitPoint));
        remaining = remaining.substring(splitPoint).trim();
      }
    }

    return parts;
  }

  private static findBestSplitPoint(text: string, maxLength: number): number {
    // Priority order for split points (best to worst)
    const splitPatterns = [
      /\n\n/g,           // Double newlines (paragraph breaks)
      /\n/g,             // Single newlines
      /\. /g,            // Sentence endings
      /, /g,             // Comma separations
      / /g,              // Word boundaries
    ];

    for (const pattern of splitPatterns) {
      const matches = Array.from(text.matchAll(pattern));
      
      // Find the last match within our length limit
      for (let i = matches.length - 1; i >= 0; i--) {
        const match = matches[i];
        if (match.index && match.index <= maxLength - 50) { // 50 char buffer
          return match.index + match[0].length;
        }
      }
    }

    return -1; // No good split point found
  }

  static formatContinuation(part: string, partNumber: number, totalParts: number): string {
    if (totalParts === 1) {
      return part;
    }

    if (partNumber === 1) {
      return part + `\n\n*(continued...)*`;
    } else if (partNumber === totalParts) {
      return `*(continued from previous message)*\n\n` + part;
    } else {
      return `*(continued from previous message)*\n\n` + part + `\n\n*(continued...)*`;
    }
  }
}
```

## Error Handling and Recovery

### Comprehensive Error Recovery

The Discord integration implements multi-layered error handling with graceful degradation:

```typescript
// In errorListener.ts
export function handleError(error: Error): void {
  logger.error('Discord client error:', error);

  // Categorize and handle different error types
  if (error.message.includes('TOKEN_INVALID')) {
    logger.fatal('Invalid Discord bot token! Bot cannot continue.');
    process.exit(1); // Critical error - cannot recover
  }
  
  if (error.message.includes('RATE_LIMITED')) {
    logger.warn('Discord API rate limit exceeded', { error: error.message });
    // Rate limiting is handled automatically by Discord.js, just log
    return;
  }
  
  if (error.message.includes('MISSING_PERMISSIONS')) {
    logger.error('Bot missing required permissions', { error: error.message });
    // Continue running - specific operations will fail with user-friendly messages
    return;
  }
  
  // Generic error - log and continue
  logger.error('Unhandled Discord client error - continuing operation', error);
}
```

#### Service-Level Error Handling

Each service implements appropriate error boundaries:

```typescript
// In MessageHandler.ts
private async handleMessageError(message: Message, error: Error): Promise<void> {
  logger.error('Message processing error:', {
    messageId: message.id,
    channelId: message.channelId,
    userId: message.author.id,
    error: error.message,
    stack: error.stack
  });

  // Attempt user-friendly error response
  try {
    // Categorize error for user-appropriate response
    let userMessage = 'I encountered an error processing your message.';
    
    if (error.message.includes('rate limit')) {
      userMessage = 'I\'m currently rate limited. Please wait a moment and try again.';
    } else if (error.message.includes('permission')) {
      userMessage = 'I don\'t have the necessary permissions to process that request.';
    } else if (error.message.includes('attachment')) {
      userMessage = 'I had trouble processing an attachment in your message. Please try again.';
    }

    await message.reply(userMessage);
  } catch (replyError) {
    logger.error('Failed to send error reply:', replyError);
    
    // Last resort - try to react with error emoji
    try {
      await message.react('❌');
    } catch (reactionError) {
      logger.error('Failed to add error reaction:', reactionError);
      // Give up gracefully - don't let error handling cause more errors
    }
  }
}
```

### Connection Resilience

The system handles Discord API connection issues gracefully:

```typescript
// Enhanced DiscordBot with connection monitoring
export class DiscordBot {
  private reconnectAttempts: number = 0;
  private readonly maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 5000; // Start with 5 seconds

  async start(): Promise<void> {
    try {
      await this.connectWithRetry();
      logger.info('Discord bot started successfully');
    } catch (error) {
      logger.error('Failed to start Discord bot after all retry attempts:', error);
      throw error;
    }
  }

  private async connectWithRetry(): Promise<void> {
    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      try {
        await this.client.login(botConfig.discord.token);
        
        // Reset reconnect state on successful connection
        this.reconnectAttempts = 0;
        this.reconnectDelay = 5000;
        
        return; // Success!
      } catch (error) {
        this.reconnectAttempts++;
        
        logger.warn(`Discord connection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} failed:`, error);
        
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          logger.info(`Retrying connection in ${this.reconnectDelay}ms...`);
          await this.sleep(this.reconnectDelay);
          
          // Exponential backoff with jitter
          this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
          this.reconnectDelay += Math.random() * 1000; // Add jitter
        }
      }
    }
    
    throw new Error('Failed to connect to Discord after maximum retry attempts');
  }

  private setupConnectionMonitoring(): void {
    this.client.on(Events.Disconnect, () => {
      logger.warn('Discord client disconnected');
    });

    this.client.on(Events.Reconnecting, () => {
      logger.info('Discord client reconnecting...');
    });

    this.client.on(Events.Resume, (replayed: number) => {
      logger.info('Discord client resumed', { replayedEvents: replayed });
    });

    this.client.on(Events.Warn, (warning: string) => {
      logger.warn('Discord client warning:', warning);
    });
  }
}
```

## Performance Optimization Patterns

### Event Handler Optimization

The system implements efficient event handling patterns:

```typescript
// Optimized event handler with batching
class OptimizedMessageHandler {
  private messageQueue: Message[] = [];
  private processingBatch: boolean = false;
  private readonly batchSize: number = 5;
  private readonly batchDelay: number = 100; // ms

  async handleMessage(message: Message): Promise<void> {
    // Add to processing queue
    this.messageQueue.push(message);
    
    // Start batch processing if not already running
    if (!this.processingBatch) {
      this.processingBatch = true;
      setTimeout(() => this.processBatch(), this.batchDelay);
    }
  }

  private async processBatch(): Promise<void> {
    try {
      while (this.messageQueue.length > 0) {
        // Process messages in small batches
        const batch = this.messageQueue.splice(0, this.batchSize);
        
        // Process batch concurrently (but limit concurrency)
        await Promise.all(
          batch.map(message => this.processMessage(message).catch(error => {
            logger.error('Batch message processing failed:', error);
          }))
        );
        
        // Small delay between batches to prevent overwhelming
        if (this.messageQueue.length > 0) {
          await this.sleep(10);
        }
      }
    } finally {
      this.processingBatch = false;
      
      // Check if more messages arrived during processing
      if (this.messageQueue.length > 0) {
        this.processingBatch = true;
        setTimeout(() => this.processBatch(), this.batchDelay);
      }
    }
  }
}
```

### Memory Management

Efficient memory usage patterns for high-volume servers:

```typescript
// Memory-efficient Discord integration
class MemoryEfficientBot {
  private messageCache = new LRUCache<string, Message>({ 
    max: 1000,  // Maximum cached messages
    ttl: 1000 * 60 * 10 // 10 minute TTL
  });

  async handleMessage(message: Message): Promise<void> {
    try {
      // Cache message for potential future reference
      this.messageCache.set(message.id, message);
      
      // Process message with memory monitoring
      const memBefore = process.memoryUsage().heapUsed;
      await this.processMessage(message);
      const memAfter = process.memoryUsage().heapUsed;
      
      // Log excessive memory usage
      const memDelta = memAfter - memBefore;
      if (memDelta > 50 * 1024 * 1024) { // 50MB
        logger.warn('High memory usage detected in message processing', {
          messageId: message.id,
          memoryDelta: Math.round(memDelta / 1024 / 1024) + 'MB',
          totalHeapUsed: Math.round(memAfter / 1024 / 1024) + 'MB'
        });
      }
      
      // Trigger garbage collection if memory usage is high
      if (memAfter > 500 * 1024 * 1024) { // 500MB
        if (global.gc) {
          global.gc();
          logger.debug('Triggered garbage collection');
        }
      }
    } catch (error) {
      logger.error('Memory-efficient message handling failed:', error);
    }
  }
}
```

### Rate Limiting Awareness

The integration implements proactive rate limit management:

```typescript
// Rate limit aware operations
class RateLimitManager {
  private rateLimitInfo = new Map<string, RateLimitInfo>();
  private readonly globalDelay = 1000; // Global rate limit delay

  async sendMessage(channel: any, content: string): Promise<Message> {
    // Check for rate limiting before attempting send
    await this.checkRateLimit('message', channel.id);
    
    try {
      const message = await channel.send(content);
      
      // Update rate limit tracking
      this.updateRateLimitInfo('message', channel.id);
      
      return message;
    } catch (error) {
      if (error.status === 429) {
        // Handle rate limit response
        const retryAfter = error.retry_after || this.globalDelay;
        
        logger.warn('Rate limited, retrying after delay', {
          channelId: channel.id,
          retryAfter
        });
        
        await this.sleep(retryAfter);
        return await this.sendMessage(channel, content); // Retry once
      }
      
      throw error;
    }
  }

  private async checkRateLimit(operation: string, resourceId: string): Promise<void> {
    const key = `${operation}:${resourceId}`;
    const rateLimitInfo = this.rateLimitInfo.get(key);
    
    if (rateLimitInfo && Date.now() < rateLimitInfo.resetTime) {
      const delay = rateLimitInfo.resetTime - Date.now();
      logger.debug('Pre-emptive rate limit delay', { operation, resourceId, delay });
      await this.sleep(delay);
    }
  }

  private updateRateLimitInfo(operation: string, resourceId: string): void {
    const key = `${operation}:${resourceId}`;
    
    // Conservative estimate: assume we can send 5 messages per 5 seconds per channel
    const resetTime = Date.now() + 1000; // 1 second delay between messages
    
    this.rateLimitInfo.set(key, {
      resetTime,
      remaining: 4 // Conservative estimate
    });
  }
}
```

## Advanced Integration Patterns

### Multi-Modal Response Handling

Sophisticated patterns for handling different response types:

```typescript
// Multi-modal response dispatcher
class ResponseDispatcher {
  async dispatchResponse(
    message: Message, 
    response: any, 
    responseType: 'text' | 'embed' | 'file' | 'reaction'
  ): Promise<void> {
    switch (responseType) {
      case 'text':
        await this.handleTextResponse(message, response);
        break;
        
      case 'embed':
        await this.handleEmbedResponse(message, response);
        break;
        
      case 'file':
        await this.handleFileResponse(message, response);
        break;
        
      case 'reaction':
        await this.handleReactionResponse(message, response);
        break;
        
      default:
        throw new Error(`Unsupported response type: ${responseType}`);
    }
  }

  private async handleEmbedResponse(message: Message, embedData: any): Promise<void> {
    try {
      // Validate embed data
      const validatedEmbed = this.validateEmbedData(embedData);
      
      // Send embed with error handling
      await message.reply({ embeds: [validatedEmbed] });
      
      logger.debug('Embed response sent successfully', {
        messageId: message.id,
        embedTitle: validatedEmbed.title
      });
    } catch (error) {
      logger.error('Embed response failed:', error);
      
      // Fallback to text response
      await message.reply('I had trouble formatting the response, but here\'s the information: ' + 
        this.extractEmbedText(embedData));
    }
  }

  private validateEmbedData(embedData: any): any {
    // Discord embed limits
    const limits = {
      title: 256,
      description: 4096,
      fieldName: 256,
      fieldValue: 1024,
      footerText: 2048,
      authorName: 256,
      totalCharacters: 6000
    };

    const validatedEmbed = { ...embedData };
    
    // Truncate fields that exceed limits
    if (validatedEmbed.title && validatedEmbed.title.length > limits.title) {
      validatedEmbed.title = validatedEmbed.title.substring(0, limits.title - 3) + '...';
    }
    
    if (validatedEmbed.description && validatedEmbed.description.length > limits.description) {
      validatedEmbed.description = validatedEmbed.description.substring(0, limits.description - 3) + '...';
    }
    
    // Validate total character count
    const totalChars = this.calculateEmbedCharacters(validatedEmbed);
    if (totalChars > limits.totalCharacters) {
      // Progressively truncate description to fit
      const excess = totalChars - limits.totalCharacters;
      const newDescriptionLength = Math.max(0, validatedEmbed.description.length - excess - 3);
      validatedEmbed.description = validatedEmbed.description.substring(0, newDescriptionLength) + '...';
    }
    
    return validatedEmbed;
  }
}
```

### Component Interaction Patterns

Sophisticated handling of Discord UI components:

```typescript
// Component interaction manager
class ComponentInteractionManager {
  private activeComponents = new Map<string, ComponentHandler>();

  registerComponent(
    messageId: string, 
    componentId: string, 
    handler: ComponentHandler, 
    expiresAt?: Date
  ): void {
    const key = `${messageId}:${componentId}`;
    
    this.activeComponents.set(key, {
      ...handler,
      expiresAt: expiresAt || new Date(Date.now() + 15 * 60 * 1000) // 15 minutes default
    });
    
    // Set up automatic cleanup
    if (expiresAt) {
      setTimeout(() => {
        this.activeComponents.delete(key);
      }, expiresAt.getTime() - Date.now());
    }
  }

  async handleComponentInteraction(interaction: any): Promise<void> {
    const messageId = interaction.message.id;
    const componentId = interaction.customId;
    const key = `${messageId}:${componentId}`;
    
    const handler = this.activeComponents.get(key);
    if (!handler) {
      await interaction.reply({
        content: 'This interaction has expired or is no longer valid.',
        ephemeral: true
      });
      return;
    }
    
    // Check expiration
    if (handler.expiresAt && Date.now() > handler.expiresAt.getTime()) {
      this.activeComponents.delete(key);
      await interaction.reply({
        content: 'This interaction has expired.',
        ephemeral: true
      });
      return;
    }
    
    try {
      await handler.handle(interaction);
    } catch (error) {
      logger.error('Component interaction handling failed:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: 'An error occurred while processing your interaction.',
          ephemeral: true
        });
      }
    }
  }
}
```

### Dynamic Content Updates

Patterns for updating Discord messages with dynamic content:

```typescript
// Dynamic content updater
class DynamicContentUpdater {
  private activeUpdates = new Map<string, UpdateHandler>();

  async startDynamicUpdate(
    message: Message, 
    contentGenerator: () => Promise<string>,
    updateInterval: number = 5000,
    maxUpdates: number = 60 // 5 minutes at 5-second intervals
  ): Promise<void> {
    const updateId = `${message.id}:${Date.now()}`;
    let updateCount = 0;
    
    const updateHandler: UpdateHandler = {
      intervalId: setInterval(async () => {
        try {
          updateCount++;
          
          if (updateCount > maxUpdates) {
            this.stopDynamicUpdate(updateId);
            return;
          }
          
          const newContent = await contentGenerator();
          await message.edit(newContent);
          
          logger.debug('Dynamic content updated', {
            messageId: message.id,
            updateCount,
            contentLength: newContent.length
          });
        } catch (error) {
          logger.error('Dynamic content update failed:', error);
          this.stopDynamicUpdate(updateId);
        }
      }, updateInterval),
      startTime: Date.now(),
      updateCount: 0
    };
    
    this.activeUpdates.set(updateId, updateHandler);
  }

  stopDynamicUpdate(updateId: string): void {
    const handler = this.activeUpdates.get(updateId);
    if (handler) {
      clearInterval(handler.intervalId);
      this.activeUpdates.delete(updateId);
      
      logger.debug('Dynamic update stopped', {
        updateId,
        totalUpdates: handler.updateCount,
        duration: Date.now() - handler.startTime
      });
    }
  }

  stopAllUpdates(): void {
    for (const [updateId, handler] of this.activeUpdates) {
      clearInterval(handler.intervalId);
    }
    this.activeUpdates.clear();
    
    logger.info('All dynamic updates stopped');
  }
}
```

## Testing and Development Patterns

### Mock Discord Client for Testing

Comprehensive mocking patterns for unit testing:

```typescript
// Mock Discord client for testing
class MockDiscordClient {
  private messageHandler: MessageHandler;
  private sentMessages: Array<{ channelId: string; content: string; embeds?: any[] }> = [];
  private reactions: Array<{ messageId: string; emoji: string }> = [];

  constructor(messageHandler: MessageHandler) {
    this.messageHandler = messageHandler;
  }

  async simulateMessage(
    content: string,
    userId: string = 'test-user-123',
    channelId: string = 'test-channel-456',
    attachments: any[] = []
  ): Promise<void> {
    const mockMessage = {
      id: `test-message-${Date.now()}`,
      content,
      author: {
        id: userId,
        bot: false,
        username: 'TestUser',
        displayName: 'Test User'
      },
      channel: {
        id: channelId,
        type: 0, // Guild text channel
        send: async (content: string) => this.mockSend(channelId, content)
      },
      attachments: new Map(attachments.map((att, i) => [`att-${i}`, att])),
      reply: async (content: string | any) => this.mockReply(channelId, content),
      react: async (emoji: string) => this.mockReact(`test-message-${Date.now()}`, emoji),
      createdAt: new Date(),
      mentions: {
        users: new Map()
      },
      reference: null
    } as any;

    await this.messageHandler.handleMessage(mockMessage);
  }

  private async mockSend(channelId: string, content: string | any): Promise<any> {
    if (typeof content === 'string') {
      this.sentMessages.push({ channelId, content });
    } else {
      this.sentMessages.push({
        channelId,
        content: content.content || '',
        embeds: content.embeds
      });
    }

    return {
      id: `sent-message-${Date.now()}`,
      edit: async (newContent: string) => {
        // Update the last sent message
        const lastMessage = this.sentMessages[this.sentMessages.length - 1];
        if (lastMessage) {
          lastMessage.content = newContent;
        }
      }
    };
  }

  private async mockReply(channelId: string, content: string | any): Promise<any> {
    return await this.mockSend(channelId, content);
  }

  private async mockReact(messageId: string, emoji: string): Promise<void> {
    this.reactions.push({ messageId, emoji });
  }

  // Test helper methods
  getSentMessages(): Array<{ channelId: string; content: string; embeds?: any[] }> {
    return [...this.sentMessages];
  }

  getLastSentMessage(): { channelId: string; content: string; embeds?: any[] } | null {
    return this.sentMessages.length > 0 ? this.sentMessages[this.sentMessages.length - 1] : null;
  }

  clearSentMessages(): void {
    this.sentMessages = [];
  }

  getReactions(): Array<{ messageId: string; emoji: string }> {
    return [...this.reactions];
  }
}
```

### Integration Testing Patterns

```typescript
// Integration test helper
class DiscordIntegrationTester {
  private testBot: DiscordBot;
  private mockClient: MockDiscordClient;

  async setup(): Promise<void> {
    // Initialize test bot with mocked dependencies
    this.testBot = new DiscordBot();
    
    // Inject mock services
    const mockMessageCacheService = new MockMessageCacheService();
    const mockContentDetectionService = new MockContentDetectionService();
    
    this.mockClient = new MockDiscordClient(
      new MessageHandler(mockMessageCacheService, 'test-bot-id', null as any)
    );
  }

  async testStreamingResponse(): Promise<void> {
    // Test streaming message handling
    await this.mockClient.simulateMessage('Tell me about TypeScript');
    
    // Wait for streaming to complete
    await this.waitForStreamingCompletion();
    
    const messages = this.mockClient.getSentMessages();
    expect(messages.length).toBeGreaterThan(0);
    
    const lastMessage = this.mockClient.getLastSentMessage();
    expect(lastMessage?.content).toContain('TypeScript');
  }

  async testAttachmentHandling(): Promise<void> {
    const mockAttachment = {
      id: 'test-attachment-123',
      name: 'test-image.png',
      contentType: 'image/png',
      size: 1024,
      url: 'https://example.com/test-image.png'
    };

    await this.mockClient.simulateMessage('Analyze this image', 'test-user', 'test-channel', [mockAttachment]);
    
    // Verify attachment processing was triggered
    const messages = this.mockClient.getSentMessages();
    expect(messages.some(m => m.content.toLowerCase().includes('image'))).toBe(true);
  }

  private async waitForStreamingCompletion(timeout: number = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const checkCompletion = () => {
        if (Date.now() - startTime > timeout) {
          reject(new Error('Streaming completion timeout'));
          return;
        }
        
        const messages = this.mockClient.getSentMessages();
        if (messages.length > 0 && !messages[messages.length - 1].content.endsWith('...')) {
          resolve();
        } else {
          setTimeout(checkCompletion, 100);
        }
      };
      
      checkCompletion();
    });
  }
}
```

## Monitoring and Analytics

### Discord Integration Metrics

Comprehensive monitoring for production deployments:

```typescript
// Discord integration metrics collector
class DiscordMetrics {
  private metrics = {
    messages: {
      received: 0,
      processed: 0,
      failed: 0,
      averageProcessingTime: 0
    },
    interactions: {
      commands: 0,
      buttons: 0,
      selectMenus: 0,
      modals: 0,
      successful: 0,
      failed: 0
    },
    streaming: {
      sessionsStarted: 0,
      sessionsCompleted: 0,
      averageSessionDuration: 0,
      chunksProcessed: 0,
      messagesSplit: 0
    },
    errors: {
      rateLimits: 0,
      permissions: 0,
      network: 0,
      other: 0
    }
  };

  recordMessageProcessing(startTime: number, success: boolean): void {
    this.metrics.messages.received++;
    
    if (success) {
      this.metrics.messages.processed++;
      
      const processingTime = Date.now() - startTime;
      this.metrics.messages.averageProcessingTime = 
        (this.metrics.messages.averageProcessingTime * (this.metrics.messages.processed - 1) + processingTime) / 
        this.metrics.messages.processed;
    } else {
      this.metrics.messages.failed++;
    }
  }

  recordStreamingSession(duration: number, chunksProcessed: number, messagesSplit: number): void {
    this.metrics.streaming.sessionsStarted++;
    this.metrics.streaming.sessionsCompleted++;
    this.metrics.streaming.chunksProcessed += chunksProcessed;
    this.metrics.streaming.messagesSplit += messagesSplit;
    
    this.metrics.streaming.averageSessionDuration =
      (this.metrics.streaming.averageSessionDuration * (this.metrics.streaming.sessionsCompleted - 1) + duration) /
      this.metrics.streaming.sessionsCompleted;
  }

  recordError(errorType: 'rate_limit' | 'permission' | 'network' | 'other'): void {
    switch (errorType) {
      case 'rate_limit':
        this.metrics.errors.rateLimits++;
        break;
      case 'permission':
        this.metrics.errors.permissions++;
        break;
      case 'network':
        this.metrics.errors.network++;
        break;
      default:
        this.metrics.errors.other++;
    }
  }

  generateReport(): any {
    const total = this.metrics.messages.received;
    const successRate = total > 0 ? (this.metrics.messages.processed / total * 100).toFixed(2) : '0';
    
    return {
      summary: {
        totalMessages: total,
        successRate: `${successRate}%`,
        averageProcessingTime: `${Math.round(this.metrics.messages.averageProcessingTime)}ms`,
        totalInteractions: this.metrics.interactions.commands + this.metrics.interactions.buttons + 
                          this.metrics.interactions.selectMenus + this.metrics.interactions.modals,
        streamingSessions: this.metrics.streaming.sessionsCompleted,
        averageStreamingDuration: `${Math.round(this.metrics.streaming.averageSessionDuration)}ms`
      },
      errors: {
        total: this.metrics.errors.rateLimits + this.metrics.errors.permissions + 
               this.metrics.errors.network + this.metrics.errors.other,
        breakdown: {
          rateLimits: this.metrics.errors.rateLimits,
          permissions: this.metrics.errors.permissions,
          network: this.metrics.errors.network,
          other: this.metrics.errors.other
        }
      },
      performance: {
        messagesPerMinute: this.calculateMessagesPerMinute(),
        errorRate: this.calculateErrorRate(),
        streamingEfficiency: this.calculateStreamingEfficiency()
      }
    };
  }
}
```

## Conclusion

The Discord Integration Patterns Guide provides a comprehensive foundation for building sophisticated, production-ready Discord bots with advanced streaming capabilities, robust error handling, and scalable architecture patterns. The integration emphasizes user experience through real-time streaming responses, intelligent message handling, and graceful error recovery.

Key architectural strengths:
- **Streaming Response Architecture**: Real-time AI response streaming with proper message editing and splitting
- **Modular Event Handling**: Clean separation of concerns with specialized event listeners
- **Comprehensive Error Recovery**: Multi-layered error handling with graceful degradation and user-friendly feedback
- **Performance Optimized**: Efficient memory usage, rate limiting awareness, and batched processing
- **Connection Resilience**: Automatic reconnection with exponential backoff and connection monitoring
- **Component Integration**: Sophisticated handling of Discord UI components and interactions
- **Testing Support**: Comprehensive mocking and testing patterns for development workflow
- **Production Monitoring**: Detailed metrics collection and performance monitoring capabilities

The patterns documented here enable the creation of Discord bots that provide excellent user experiences while maintaining reliability and scalability in production environments. The architecture's emphasis on streaming responses, intelligent error handling, and comprehensive monitoring ensures that bots built with these patterns can handle high-volume interactions while providing responsive, engaging user experiences.