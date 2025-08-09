# Error Handling Documentation

This document covers error patterns, troubleshooting strategies, and best practices for handling failures across all AI features.

## Common Error Patterns

### Generic Google AI Error Handling

```typescript
export async function handleGoogleAIError(error: Error, context: string): Promise<Error> {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('safety')) {
    return new Error('Content violates safety policies. Please try a different prompt.');
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('deadline_exceeded')) {
    return new Error('Request timed out. Please try again with a shorter prompt.');
  }
  
  if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted')) {
    return new Error('Service quota exceeded. Please try again later.');
  }
  
  if (errorMessage.includes('invalid_argument')) {
    return new Error('Invalid input parameters. Please check your request.');
  }
  
  if (errorMessage.includes('permission_denied') || errorMessage.includes('unauthorized')) {
    return new Error('Authentication failed. Please check your API key.');
  }
  
  if (errorMessage.includes('not_found')) {
    return new Error('Requested resource not found. Please check the model name.');
  }
  
  return new Error(`${context} failed: ${error.message}`);
}
```

### Error Classification System

```typescript
export enum ErrorType {
  SAFETY = 'safety',
  QUOTA = 'quota',
  TIMEOUT = 'timeout',
  VALIDATION = 'validation',
  AUTHENTICATION = 'authentication',
  NETWORK = 'network',
  INTERNAL = 'internal'
}

export interface ClassifiedError {
  type: ErrorType;
  message: string;
  userMessage: string;
  retryable: boolean;
  retryAfter?: number; // seconds
}

export function classifyError(error: Error): ClassifiedError {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('safety')) {
    return {
      type: ErrorType.SAFETY,
      message: error.message,
      userMessage: 'Content violates safety policies. Please try rephrasing your request.',
      retryable: false
    };
  }
  
  if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted')) {
    return {
      type: ErrorType.QUOTA,
      message: error.message,
      userMessage: 'Service quota exceeded. Please try again in a few minutes.',
      retryable: true,
      retryAfter: 300 // 5 minutes
    };
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('deadline_exceeded')) {
    return {
      type: ErrorType.TIMEOUT,
      message: error.message,
      userMessage: 'Request timed out. Please try again with a shorter message.',
      retryable: true,
      retryAfter: 30
    };
  }
  
  if (errorMessage.includes('invalid_argument') || errorMessage.includes('bad_request')) {
    return {
      type: ErrorType.VALIDATION,
      message: error.message,
      userMessage: 'Invalid request format. Please check your input.',
      retryable: false
    };
  }
  
  if (errorMessage.includes('unauthorized') || errorMessage.includes('permission_denied')) {
    return {
      type: ErrorType.AUTHENTICATION,
      message: error.message,
      userMessage: 'Authentication failed. Please contact support.',
      retryable: false
    };
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('connection')) {
    return {
      type: ErrorType.NETWORK,
      message: error.message,
      userMessage: 'Network error. Please try again.',
      retryable: true,
      retryAfter: 60
    };
  }
  
  return {
    type: ErrorType.INTERNAL,
    message: error.message,
    userMessage: 'An unexpected error occurred. Please try again.',
    retryable: true,
    retryAfter: 30
  };
}
```

## Feature-Specific Error Handling

### TTS Error Handling

```typescript
export function handleTTSError(error: Error): Error {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('safety')) {
    return new Error('Content violates TTS safety policies. Please try a different prompt.');
  }
  
  if (errorMessage.includes('deadline_exceeded')) {
    return new Error('TTS generation timed out. Please try again with a shorter prompt.');
  }
  
  if (errorMessage.includes('quota_exceeded') || errorMessage.includes('resource_exhausted')) {
    return new Error('TTS service quota exceeded. Please try again later.');
  }
  
  if (errorMessage.includes('invalid_argument')) {
    return new Error('Invalid voice selection or prompt. Please check your input.');
  }
  
  if (errorMessage.includes('audio_generation_failed')) {
    return new Error('Audio generation failed. Please try rephrasing your text.');
  }
  
  return new Error(`TTS generation failed: ${error.message}`);
}
```

### Code Execution Error Handling

```typescript
export function handleCodeExecutionError(error: Error): Error {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('timeout') || errorMessage.includes('execution_timeout')) {
    return new Error('Code execution timed out. Please try with simpler code or shorter runtime.');
  }
  
  if (errorMessage.includes('memory') || errorMessage.includes('out_of_memory')) {
    return new Error('Code execution exceeded memory limits. Please optimize your code.');
  }
  
  if (errorMessage.includes('security') || errorMessage.includes('blocked')) {
    return new Error('Code execution blocked for security reasons. Please avoid restricted operations.');
  }
  
  if (errorMessage.includes('compilation_error') || errorMessage.includes('syntax_error')) {
    return new Error('Code compilation failed. Please check your syntax.');
  }
  
  if (errorMessage.includes('runtime_error') || errorMessage.includes('execution_error')) {
    return new Error('Code execution failed with runtime error. Please check your logic.');
  }
  
  return new Error(`Code execution failed: ${error.message}`);
}
```

### Multimodal Error Handling

```typescript
export function handleMultimodalError(error: Error, context: { filePath?: string; mimeType?: string }): Error {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('file too large') || errorMessage.includes('size')) {
    const fileType = context.mimeType?.split('/')[0] || 'file';
    return new Error(`File too large. Please use a smaller ${fileType}.`);
  }
  
  if (errorMessage.includes('unsupported') || errorMessage.includes('format')) {
    return new Error(`Unsupported file format: ${context.mimeType || 'unknown'}. Please use a supported format.`);
  }
  
  if (errorMessage.includes('corrupted') || errorMessage.includes('invalid_file')) {
    return new Error('File appears to be corrupted or invalid. Please try a different file.');
  }
  
  if (errorMessage.includes('processing_failed') || errorMessage.includes('analysis_failed')) {
    return new Error('File processing failed. Please try again or use a different file.');
  }
  
  if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
    return new Error('Content violates safety policies. Please try with different content.');
  }
  
  if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted')) {
    return new Error('Service quota exceeded. Please try again later.');
  }
  
  return new Error(`File processing failed: ${error.message}`);
}
```

### Streaming Error Handling

```typescript
export function handleStreamingError(error: Error, context: { messageId?: string; chunkCount?: number }): Error {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('stream_interrupted') || errorMessage.includes('connection_lost')) {
    return new Error('Stream was interrupted. Please try again.');
  }
  
  if (errorMessage.includes('stream_timeout')) {
    return new Error('Stream timed out. Please try with a shorter prompt.');
  }
  
  if (errorMessage.includes('rate_limit') || errorMessage.includes('too_many_requests')) {
    return new Error('Too many requests. Please wait a moment before trying again.');
  }
  
  if (errorMessage.includes('buffer_overflow') || errorMessage.includes('message_too_long')) {
    return new Error('Response too long for streaming. Please try a more specific prompt.');
  }
  
  return new Error(`Streaming failed after ${context.chunkCount || 0} chunks: ${error.message}`);
}
```

## Retry Logic Patterns

### Exponential Backoff Retry

```typescript
export class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxAttempts?: number;
      baseDelay?: number;
      maxDelay?: number;
      errorHandler?: (error: Error) => Error;
    } = {}
  ): Promise<T> {
    const {
      maxAttempts = 3,
      baseDelay = 1000,
      maxDelay = 10000,
      errorHandler
    } = options;

    let attempts = 0;
    let lastError: Error;

    while (attempts < maxAttempts) {
      attempts++;
      
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        // Check if error is retryable
        const classified = classifyError(lastError);
        if (!classified.retryable || attempts >= maxAttempts) {
          throw errorHandler ? errorHandler(lastError) : lastError;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          baseDelay * Math.pow(2, attempts - 1),
          maxDelay
        );

        logger.warn(`Attempt ${attempts} failed, retrying in ${delay}ms`, {
          error: lastError.message
        });

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw errorHandler ? errorHandler(lastError!) : lastError!;
  }
}
```

### Retry with Circuit Breaker

```typescript
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private readonly threshold: number = 5,
    private readonly timeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime < this.timeout) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      
      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'OPEN';
      }
      
      throw error;
    }
  }
}
```

## Discord Integration Error Handling

### Message Send Error Recovery

```typescript
export class DiscordErrorHandler {
  static async handleMessageError(
    error: Error,
    message: Message,
    fallbackContent?: string
  ): Promise<void> {
    const errorMessage = error.message.toLowerCase();
    
    try {
      if (errorMessage.includes('missing permissions')) {
        logger.warn('Missing permissions to send message', {
          channelId: message.channel.id,
          guildId: message.guild?.id
        });
        return; // Can't send error message without permissions
      }
      
      if (errorMessage.includes('message too long')) {
        await message.reply('Response was too long. Please try a more specific request.');
        return;
      }
      
      if (errorMessage.includes('rate limit')) {
        await message.react('⏰'); // React instead of sending message
        return;
      }
      
      // Default error response
      const userError = classifyError(error);
      await message.reply(userError.userMessage);
      
    } catch (replyError) {
      logger.error('Failed to send error message:', replyError);
      
      // Last resort: try to react with error emoji
      try {
        await message.react('❌');
      } catch (reactError) {
        logger.error('Failed to react to message:', reactError);
      }
    }
  }

  static async handleStreamingError(
    error: Error,
    streamingHandler: StreamingHandler,
    messageId: string
  ): Promise<void> {
    try {
      const userError = handleStreamingError(error, { messageId });
      await streamingHandler.sendError(userError.message);
    } catch (sendError) {
      logger.error('Failed to send streaming error message:', sendError);
    } finally {
      // Always clean up the streaming handler
      streamingHandler.cleanup();
    }
  }
}
```

### File Processing Error Recovery

```typescript
export async function processFileWithErrorHandling(
  attachment: Attachment,
  operation: (file: ProcessedFile) => Promise<any>
): Promise<any> {
  try {
    // Validate file size
    if (attachment.size > botConfig.discord.maxFileSize) {
      throw new Error(`File too large: ${attachment.size} bytes (max: ${botConfig.discord.maxFileSize})`);
    }

    // Validate file type
    if (!attachment.contentType) {
      throw new Error('Unknown file type');
    }

    // Download and process file
    const response = await fetch(attachment.url);
    if (!response.ok) {
      throw new Error(`Failed to download file: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const processedFile = {
      buffer,
      mimeType: attachment.contentType,
      name: attachment.name,
      size: attachment.size
    };

    return await operation(processedFile);

  } catch (error) {
    const handledError = handleMultimodalError(error as Error, {
      filePath: attachment.name,
      mimeType: attachment.contentType || undefined
    });
    
    throw handledError;
  }
}
```

## Error Monitoring and Logging

### Structured Error Logging

```typescript
export class ErrorLogger {
  static logError(
    error: Error,
    context: {
      operation: string;
      userId?: string;
      channelId?: string;
      messageId?: string;
      additional?: Record<string, any>;
    }
  ): void {
    const classified = classifyError(error);
    
    logger.error('Operation failed', {
      operation: context.operation,
      errorType: classified.type,
      errorMessage: error.message,
      stack: error.stack,
      userId: context.userId,
      channelId: context.channelId,
      messageId: context.messageId,
      retryable: classified.retryable,
      retryAfter: classified.retryAfter,
      ...context.additional
    });
  }

  static logWarning(
    message: string,
    context: Record<string, any> = {}
  ): void {
    logger.warn(message, context);
  }

  static logRecovery(
    operation: string,
    attempts: number,
    finalError?: Error
  ): void {
    if (finalError) {
      logger.error(`Operation failed after ${attempts} attempts`, {
        operation,
        attempts,
        finalError: finalError.message
      });
    } else {
      logger.info(`Operation succeeded after ${attempts} attempts`, {
        operation,
        attempts
      });
    }
  }
}
```

### Error Metrics Collection

```typescript
export class ErrorMetrics {
  private static errorCounts = new Map<string, number>();
  private static lastReset = Date.now();

  static recordError(errorType: ErrorType, operation: string): void {
    const key = `${errorType}:${operation}`;
    const current = this.errorCounts.get(key) || 0;
    this.errorCounts.set(key, current + 1);
  }

  static getErrorStats(): Record<string, number> {
    return Object.fromEntries(this.errorCounts);
  }

  static resetStats(): void {
    this.errorCounts.clear();
    this.lastReset = Date.now();
  }

  static shouldAlert(): boolean {
    const totalErrors = Array.from(this.errorCounts.values())
      .reduce((sum, count) => sum + count, 0);
    
    const timeWindow = Date.now() - this.lastReset;
    const errorsPerMinute = totalErrors / (timeWindow / 60000);
    
    return errorsPerMinute > 10; // Alert if > 10 errors per minute
  }
}
```

## Testing Error Scenarios

### Error Simulation for Testing

```typescript
export class ErrorSimulator {
  static simulateQuotaExceeded(): Error {
    return new Error('quota exceeded: too many requests');
  }

  static simulateTimeout(): Error {
    return new Error('deadline exceeded: request timeout');
  }

  static simulateSafety(): Error {
    return new Error('safety: content blocked by safety filters');
  }

  static simulateNetworkError(): Error {
    return new Error('network error: connection failed');
  }

  static simulateInvalidArgument(): Error {
    return new Error('invalid argument: bad request parameters');
  }
}
```

## Best Practices

### 1. Error Classification
- Always classify errors by type and severity
- Provide user-friendly error messages
- Log detailed technical errors for debugging
- Track retry patterns and success rates

### 2. Graceful Degradation
- Implement fallback mechanisms for critical features
- Provide alternative responses when primary methods fail
- Maintain service availability during partial failures

### 3. User Experience
- Never expose internal error details to users
- Provide actionable guidance in error messages
- Use visual indicators (reactions, emojis) when text fails
- Implement progressive retry with user feedback

### 4. Monitoring and Alerting
- Monitor error rates and patterns
- Set up alerts for critical error thresholds
- Track recovery success rates
- Log context for effective debugging

### 5. Testing
- Test error scenarios regularly
- Validate error message clarity
- Ensure retry logic works correctly
- Test graceful degradation paths

## Related Documentation

- [streaming-patterns.md](./streaming-patterns.md) - Streaming-specific error handling
- [integration-patterns.md](./integration-patterns.md) - Discord integration error patterns
- [advanced-features.md](./advanced-features.md) - Feature-specific error handling
- [configuration-examples.md](./configuration-examples.md) - Error handling configuration