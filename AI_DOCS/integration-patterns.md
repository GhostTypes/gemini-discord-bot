# Integration Patterns Documentation

This document covers Discord.js integration patterns and your specific implementation details.

## Discord Bot Service Integration

### Basic Service Structure

```typescript
import { Client, Message, AttachmentBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { streamChatResponse } from '../flows/chatFlow.js';

export class DiscordBot {
  private client: Client;
  private readonly streamingHandlers = new Map<string, StreamingHandler>();

  constructor() {
    this.client = new Client({ 
      intents: ['GuildMessages', 'MessageContent', 'Guilds']
    });
  }

  async start(token: string): Promise<void> {
    this.setupEventHandlers();
    await this.client.login(token);
    logger.info('Discord bot started successfully');
  }

  private setupEventHandlers(): void {
    this.client.on('messageCreate', this.handleMessage.bind(this));
    this.client.on('error', this.handleError.bind(this));
  }
}
```

### Message Handling with Streaming

```typescript
private async handleMessage(message: Message): Promise<void> {
  // Ignore bot messages and non-mentions
  if (message.author.bot || !message.mentions.has(this.client.user!)) {
    return;
  }

  const content = message.content.replace(`<@${this.client.user!.id}>`, '').trim();
  if (!content) return;

  try {
    // Show typing indicator
    await message.channel.sendTyping();

    // Start streaming response
    await this.streamResponseToDiscord(message, content);
  } catch (error) {
    logger.error('Error handling message:', error);
    await message.reply('Sorry, I encountered an error processing your message.');
  }
}
```

### Streaming Response Implementation

```typescript
private async streamResponseToDiscord(message: Message, content: string): Promise<void> {
  const messageId = message.id;
  let streamingHandler = this.streamingHandlers.get(messageId);

  const onChunk = async (chunk: string): Promise<void> => {
    if (!streamingHandler) {
      // Create initial response message
      const initialMessage = await message.reply('...');
      streamingHandler = new StreamingHandler(initialMessage);
      this.streamingHandlers.set(messageId, streamingHandler);
    }

    await streamingHandler.appendChunk(chunk);
  };

  try {
    const fullResponse = await streamChatResponse({ message: content }, onChunk);
    
    // Finalize the streaming
    if (streamingHandler) {
      await streamingHandler.finalize();
      this.streamingHandlers.delete(messageId);
    }

    logger.info(`Completed response for message ${messageId}: ${fullResponse.length} chars`);
  } catch (error) {
    // Clean up on error
    this.streamingHandlers.delete(messageId);
    throw error;
  }
}
```

## Streaming Handler Implementation

### Core Streaming Handler

```typescript
export class StreamingHandler {
  private currentContent = '';
  private currentMessageIndex = 0;
  private messages: Message[] = [];
  private lastUpdateTime = 0;
  private readonly updateThrottleMs = 500; // Throttle updates to prevent rate limiting

  constructor(private initialMessage: Message) {
    this.messages.push(initialMessage);
  }

  async appendChunk(chunk: string): Promise<void> {
    this.currentContent += chunk;
    
    const now = Date.now();
    if (now - this.lastUpdateTime < this.updateThrottleMs) {
      return; // Throttle updates
    }

    await this.updateCurrentMessage();
    this.lastUpdateTime = now;
  }

  private async updateCurrentMessage(): Promise<void> {
    const messagesToSend = MessageSplitter.split(this.currentContent);
    
    // Update existing messages
    for (let i = 0; i < Math.min(messagesToSend.length, this.messages.length); i++) {
      if (this.messages[i].content !== messagesToSend[i]) {
        await this.messages[i].edit(messagesToSend[i]);
      }
    }

    // Create additional messages if needed
    while (messagesToSend.length > this.messages.length) {
      const newMessage = await this.initialMessage.channel.send(
        messagesToSend[this.messages.length]
      );
      this.messages.push(newMessage);
    }
  }

  async finalize(): Promise<void> {
    // Final update without throttling
    await this.updateCurrentMessage();
  }
}
```

### Message Splitting Utility

```typescript
export class MessageSplitter {
  private static readonly MAX_LENGTH = 2000;
  private static readonly SPLIT_PATTERNS = [
    /\n\n/g,    // Double newlines (paragraphs)
    /\n/g,      // Single newlines
    /\. /g,     // Sentences
    / /g        // Words
  ];

  static split(content: string): string[] {
    if (content.length <= this.MAX_LENGTH) {
      return [content];
    }

    const messages: string[] = [];
    let remaining = content;

    while (remaining.length > 0) {
      if (remaining.length <= this.MAX_LENGTH) {
        messages.push(remaining);
        break;
      }

      let bestSplit = this.MAX_LENGTH;
      
      // Find the best split point
      for (const pattern of this.SPLIT_PATTERNS) {
        const matches = [...remaining.substring(0, this.MAX_LENGTH).matchAll(pattern)];
        if (matches.length > 0) {
          const lastMatch = matches[matches.length - 1];
          bestSplit = lastMatch.index! + lastMatch[0].length;
          break;
        }
      }

      messages.push(remaining.substring(0, bestSplit).trim());
      remaining = remaining.substring(bestSplit).trim();
    }

    return messages.filter(msg => msg.length > 0);
  }
}
```

## Advanced Discord Integration Patterns

### File Attachment Handling

```typescript
private async handleFileAttachments(message: Message): Promise<string[]> {
  const attachmentContexts: string[] = [];

  for (const attachment of message.attachments.values()) {
    try {
      if (attachment.contentType?.startsWith('image/')) {
        const context = await this.processImageAttachment(attachment);
        attachmentContexts.push(`Image: ${context}`);
      } else if (attachment.contentType?.startsWith('video/')) {
        const context = await this.processVideoAttachment(attachment);
        attachmentContexts.push(`Video: ${context}`);
      } else if (attachment.contentType === 'application/pdf') {
        const context = await this.processDocumentAttachment(attachment);
        attachmentContexts.push(`Document: ${context}`);
      }
    } catch (error) {
      logger.error(`Failed to process attachment ${attachment.name}:`, error);
      attachmentContexts.push(`Failed to process attachment: ${attachment.name}`);
    }
  }

  return attachmentContexts;
}

private async processImageAttachment(attachment: Attachment): Promise<string> {
  const response = await processImage({
    imageUrl: attachment.url,
    prompt: 'Describe what you see in this image',
    mimeType: attachment.contentType!
  });
  
  return response.description;
}
```

### TTS Response Integration

```typescript
private async handleTTSRequest(message: Message, content: string): Promise<void> {
  try {
    const ttsResponse = await generateTTSResponse({
      message: content,
      voice: 'Zephyr'
    });

    const attachment = new AttachmentBuilder(ttsResponse.audioBuffer, {
      name: 'response.mp3',
      description: 'AI voice response'
    });

    await message.reply({
      content: `🔊 **Voice Response** (${ttsResponse.voice})\n*"${ttsResponse.originalText.substring(0, 100)}${ttsResponse.originalText.length > 100 ? '...' : ''}"*`,
      files: [attachment]
    });
  } catch (error) {
    logger.error('TTS generation failed:', error);
    await message.reply('Sorry, I couldn\'t generate a voice response. Here\'s the text instead:\n\n' + content);
  }
}
```

### Code Execution Response Formatting

```typescript
private async handleCodeExecutionResponse(
  message: Message,
  codeResult: CodeExecutionOutput
): Promise<void> {
  let response = codeResult.response;

  if (codeResult.hasCode && codeResult.executableCode) {
    response += '\n\n**Code:**\n```python\n' + codeResult.executableCode + '\n```';
  }

  if (codeResult.executionResult) {
    response += '\n\n**Output:**\n```\n' + codeResult.executionResult + '\n```';
  }

  // Use streaming for long responses
  if (response.length > 500) {
    await this.streamResponseToDiscord(message, response);
  } else {
    await message.reply(response);
  }
}
```

## Error Handling Patterns

### Graceful Error Recovery

```typescript
private async handleError(error: Error, message: Message): Promise<void> {
  logger.error('Discord bot error:', error);

  const errorMessage = this.formatErrorForUser(error);
  
  try {
    await message.reply(errorMessage);
  } catch (replyError) {
    logger.error('Failed to send error message:', replyError);
    
    // Try to send to channel if reply fails
    try {
      await message.channel.send(`Sorry ${message.author}, I encountered an error: ${errorMessage}`);
    } catch (channelError) {
      logger.error('Failed to send error to channel:', channelError);
    }
  }
}

private formatErrorForUser(error: Error): string {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('safety')) {
    return 'Sorry, I can\'t process that request due to safety policies. Please try rephrasing.';
  }
  
  if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted')) {
    return 'I\'m currently experiencing high demand. Please try again in a few minutes.';
  }
  
  if (errorMessage.includes('timeout')) {
    return 'The request timed out. Please try again with a shorter message.';
  }
  
  return 'I encountered an unexpected error. Please try again.';
}
```

### Rate Limiting Handling

```typescript
private readonly userCooldowns = new Map<string, number>();
private readonly COOLDOWN_MS = 5000; // 5 second cooldown per user

private checkUserCooldown(userId: string): boolean {
  const lastRequest = this.userCooldowns.get(userId);
  const now = Date.now();
  
  if (lastRequest && now - lastRequest < this.COOLDOWN_MS) {
    return false; // Still in cooldown
  }
  
  this.userCooldowns.set(userId, now);
  return true;
}

private async handleMessage(message: Message): Promise<void> {
  if (!this.checkUserCooldown(message.author.id)) {
    await message.reply('Please wait a moment before sending another message.');
    return;
  }

  // ... rest of message handling
}
```

## Configuration Integration

### Environment-Based Bot Configuration

```typescript
export interface DiscordBotConfig {
  token: string;
  clientId: string;
  enableTTS: boolean;
  enableCodeExecution: boolean;
  enableFileProcessing: boolean;
  maxFileSize: number;
  allowedChannels?: string[];
  ownerIds: string[];
}

export function loadDiscordConfig(): DiscordBotConfig {
  return {
    token: process.env.DISCORD_TOKEN!,
    clientId: process.env.DISCORD_CLIENT_ID!,
    enableTTS: process.env.ENABLE_TTS === 'true',
    enableCodeExecution: process.env.ENABLE_CODE_EXECUTION === 'true',
    enableFileProcessing: process.env.ENABLE_FILE_PROCESSING === 'true',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB default
    allowedChannels: process.env.ALLOWED_CHANNELS?.split(','),
    ownerIds: process.env.OWNER_IDS?.split(',') || []
  };
}
```

### Feature Toggle Integration

```typescript
private async processMessageWithFeatures(message: Message, content: string): Promise<void> {
  const config = loadDiscordConfig();
  
  // Check if channel is allowed
  if (config.allowedChannels && !config.allowedChannels.includes(message.channel.id)) {
    return;
  }

  // Handle TTS requests
  if (content.startsWith('/tts') && config.enableTTS) {
    const ttsContent = content.replace('/tts', '').trim();
    await this.handleTTSRequest(message, ttsContent);
    return;
  }

  // Handle code execution
  if (content.includes('```') && config.enableCodeExecution) {
    const codeResult = await executeCode({ message: content });
    await this.handleCodeExecutionResponse(message, codeResult);
    return;
  }

  // Handle file attachments
  if (message.attachments.size > 0 && config.enableFileProcessing) {
    const attachmentContexts = await this.handleFileAttachments(message);
    content = `${content}\n\nAttachments:\n${attachmentContexts.join('\n')}`;
  }

  // Default chat response
  await this.streamResponseToDiscord(message, content);
}
```

## Performance Optimization

### Connection Management

```typescript
export class DiscordBot {
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;

  private setupEventHandlers(): void {
    this.client.on('ready', () => {
      logger.info(`Discord bot logged in as ${this.client.user?.tag}`);
      this.reconnectAttempts = 0;
    });

    this.client.on('disconnect', () => {
      logger.warn('Discord bot disconnected');
    });

    this.client.on('error', (error) => {
      logger.error('Discord client error:', error);
    });

    this.client.on('shardError', (error) => {
      logger.error('Discord shard error:', error);
      this.handleReconnect();
    });
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached');
      process.exit(1);
    }

    this.reconnectAttempts++;
    const delay = Math.pow(2, this.reconnectAttempts) * 1000; // Exponential backoff
    
    logger.info(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      await this.client.login(process.env.DISCORD_TOKEN!);
    } catch (error) {
      logger.error('Reconnection failed:', error);
      await this.handleReconnect();
    }
  }
}
```

### Memory Management

```typescript
private cleanupStreamingHandlers(): void {
  const now = Date.now();
  const maxAge = 5 * 60 * 1000; // 5 minutes

  for (const [messageId, handler] of this.streamingHandlers.entries()) {
    if (now - handler.createdAt > maxAge) {
      this.streamingHandlers.delete(messageId);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(() => {
  this.cleanupStreamingHandlers();
}, 5 * 60 * 1000);
```

## Best Practices

### 1. State Management
- Use object existence (`streamingHandler`) rather than boolean flags
- Clean up handlers after completion or timeout
- Implement proper error recovery for interrupted streams

### 2. Rate Limiting
- Implement user cooldowns to prevent spam
- Throttle message updates during streaming
- Handle Discord API rate limits gracefully

### 3. Error Handling
- Provide user-friendly error messages
- Log detailed errors for debugging
- Implement fallback mechanisms for failed features

### 4. Performance
- Use typing indicators for better UX
- Implement message splitting for long responses
- Clean up resources regularly

### 5. Security
- Validate file types and sizes
- Implement channel restrictions
- Check user permissions for sensitive features

## Related Documentation

- [streaming-patterns.md](./streaming-patterns.md) - Core streaming implementation
- [error-handling.md](./error-handling.md) - Error handling patterns
- [configuration-examples.md](./configuration-examples.md) - Your specific config implementations
- [advanced-features.md](./advanced-features.md) - TTS, code execution, and other features