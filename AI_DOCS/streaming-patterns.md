# Streaming Patterns Documentation

This document covers streaming implementation patterns and the critical race condition bug fix for Discord bot integration.

## Critical Streaming Implementation

### Problem: Race Conditions in Streaming

When implementing real-time streaming from Genkit to Discord, chunks were being processed without waiting for async operations to complete, causing multiple messages instead of editing existing ones.

**Symptoms:**
- Bot creates new message for each chunk instead of editing existing message
- Variable state not preserved between async callbacks
- Messages appear out of order or duplicated

**Root Cause:** Async callback race condition in stream processing

### Solution: Proper Async Callback Handling

```typescript
// BROKEN - Race condition
for await (const chunk of stream) {
  if (chunk.text) {
    onChunk(chunk.text); // Not awaited - next chunk fires before this completes
  }
}

// FIXED - Proper async handling
for await (const chunk of stream) {
  if (chunk.text) {
    await onChunk(chunk.text); // Wait for callback to complete before next chunk
  }
}
```

## Complete Streaming Implementation

### Genkit Streaming with Callback

```typescript
export async function streamChatResponse(
  input: ChatInputType,
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const { stream } = await ai.generateStream({
    prompt: input.message,
    config: GenerationConfigBuilder.build()
  });

  let fullResponse = '';
  let chunkCount = 0;
  
  for await (const chunk of stream) {
    // Filter out thinking chunks, only process final response text
    const chunkAny = chunk as any;
    if (chunk.text && !chunkAny.thoughts) {
      chunkCount++;
      logger.debug(`Processing response chunk ${chunkCount}, length: ${chunk.text.length}`);
      fullResponse += chunk.text;
      await onChunk(chunk.text); // CRITICAL: Must await
    } else if (chunkAny.thoughts) {
      logger.debug(`Processing thinking chunk (${chunkAny.thoughts.length} chars) - not streaming to user`);
    }
  }

  return fullResponse;
}
```

### Direct Google AI Client Streaming

```typescript
export async function streamSearchGroundedResponse(
  prompt: string,
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const stream = await genaiClient.models.generateContentStream({
    model: botConfig.google.model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      ...GenerationConfigBuilder.buildSearchGrounding()
    }
  });

  let fullResponse = '';
  
  for await (const chunk of stream) {
    if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
      const chunkText = chunk.candidates[0].content.parts[0].text;
      fullResponse += chunkText;
      await onChunk(chunkText); // CRITICAL: Must await
    }
  }

  return fullResponse;
}
```

## Advanced Streaming Patterns

### Code Execution Streaming

```typescript
export async function streamCodeExecutionResponse(
  input: CodeExecutionInput,
  onChunk: (chunk: { type: string; content: string; language?: string }) => Promise<void>
): Promise<CodeExecutionOutput> {
  const stream = await genaiClient.models.generateContentStream({
    model: botConfig.google.model,
    contents: [{ role: 'user', parts: [{ text: input.message }] }],
    config: {
      tools: [{ codeExecution: {} }]
    }
  });

  let fullText = '';
  let executableCode = '';
  let executionResult = '';

  for await (const chunk of stream) {
    const parts = chunk.candidates?.[0]?.content?.parts || [];
    
    for (const part of parts) {
      // Handle different part types
      if (part.text) {
        fullText += part.text;
        await onChunk({ type: 'text', content: part.text });
      }
      
      if (part.executableCode?.code) {
        executableCode += part.executableCode.code;
        await onChunk({ 
          type: 'code', 
          content: part.executableCode.code,
          language: part.executableCode.language || 'python'
        });
      }
      
      if (part.codeExecutionResult?.output) {
        executionResult += part.codeExecutionResult.output;
        await onChunk({ type: 'result', content: part.codeExecutionResult.output });
      }
    }
  }

  return {
    response: fullText.trim(),
    hasCode: !!executableCode,
    executableCode: executableCode.trim() || undefined,
    executionResult: executionResult.trim() || undefined
  };
}
```

### TTS Streaming (Non-text Response)

```typescript
export async function generateTTSResponse(input: TTSInput): Promise<TTSOutput> {
  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: input.message }] }],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: input.voice || 'Zephyr'
          }
        }
      }
    }
  });

  const audioData = response.candidates[0].content.parts[0].inlineData.data;
  const audioBuffer = Buffer.from(audioData, 'base64');
  
  return {
    audioBuffer,
    originalText: input.message,
    voice: input.voice || 'Zephyr'
  };
}
```

## State Management in Streaming

### Use Object Existence for Async State

```typescript
// GOOD - Use object existence rather than boolean flags
class StreamingHandler {
  private streamingHandler?: SomeHandler;

  async onChunk(chunk: string) {
    // Check object existence, not boolean flags
    if (!this.streamingHandler) {
      this.streamingHandler = await this.createHandler();
    }
    
    await this.streamingHandler.process(chunk);
  }
}

// BAD - Boolean flags can cause race conditions
class StreamingHandler {
  private isStreaming = false;

  async onChunk(chunk: string) {
    if (!this.isStreaming) {
      this.isStreaming = true; // Race condition: multiple chunks can pass this check
      // ... initialization
    }
  }
}
```

## Debugging Streaming Issues

### Logging for Troubleshooting

```typescript
export async function streamWithDebugLogging(
  stream: AsyncIterable<any>,
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  let fullResponse = '';
  let chunkCount = 0;
  let lastChunkTime = Date.now();
  
  for await (const chunk of stream) {
    const currentTime = Date.now();
    const timeSinceLastChunk = currentTime - lastChunkTime;
    
    if (chunk.text) {
      chunkCount++;
      logger.debug(`Chunk ${chunkCount}: ${chunk.text.length} chars, ${timeSinceLastChunk}ms gap`);
      
      fullResponse += chunk.text;
      
      const startTime = Date.now();
      await onChunk(chunk.text);
      const processingTime = Date.now() - startTime;
      
      logger.debug(`Chunk ${chunkCount} processed in ${processingTime}ms`);
      lastChunkTime = Date.now();
    }
  }
  
  logger.debug(`Streaming complete: ${chunkCount} chunks, ${fullResponse.length} total chars`);
  return fullResponse;
}
```

### Testing Approach

When debugging streaming issues:

1. **Add console.log to track chunk processing order**
2. **Check if state variables are preserved between async calls**
3. **Verify Discord message edit vs create behavior**
4. **Test with responses both under and over 2000 characters**
5. **Monitor timing between chunks and processing duration**

## Key Implementation Points

1. **Always await async callbacks** in streaming loops
2. **Use object existence** (`streamingHandler`) rather than boolean flags for async state
3. **Edit existing Discord messages** rather than creating new ones for each chunk
4. **Filter thinking chunks** in Genkit streams - only process final response text
5. **Handle different part types** in code execution and multimodal responses
6. **Message splitting** - Only create new messages when content exceeds Discord's 2000 character limit

## Related Documentation

- [integration-patterns.md](./integration-patterns.md) - Discord bot integration patterns
- [error-handling.md](./error-handling.md) - Error handling in streaming contexts
- [google-genai-client.md](./google-genai-client.md) - Basic client usage patterns