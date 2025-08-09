# Google AI and Genkit Libraries Documentation Cache

This document provides comprehensive documentation for the Google AI and Genkit libraries used in this Discord bot codebase, compiled for quick reference during development and debugging.

## Table of Contents

1. [Library Overview](#library-overview)
2. [@google/genai SDK Documentation](#googlegenai-sdk-documentation)
3. [Genkit Framework Documentation](#genkit-framework-documentation)
4. [@genkit-ai/googleai Plugin Documentation](#genkit-aigoogleai-plugin-documentation)
5. [Implementation Patterns](#implementation-patterns)
6. [Configuration Reference](#configuration-reference)
7. [Streaming Patterns](#streaming-patterns)
8. [Error Handling](#error-handling)
9. [Best Practices](#best-practices)

## Library Overview

### Primary Libraries Used

1. **@google/genai (v1.11.0)** - Modern Google AI SDK
   - Direct AI model interactions, streaming responses
   - Primary usage: `GoogleGenAI` client, `createUserContent`, `createPartFromUri`
   - Files: `flows/codeExecutionFlow.ts`, `flows/ttsFlow.ts`, `flows/videoProcessingFlow.ts`, `services/GenerativeService.ts`

2. **genkit (v1.14.0)** - AI flow orchestration framework
   - Core framework for AI flows
   - Primary usage: `genkit` function, `ai.defineFlow`, `ai.generate`, `ai.generateStream`
   - Configuration: `genkit.config.ts`

3. **@genkit-ai/googleai (v1.14.0)** - Genkit's Google AI integration
   - Genkit-specific Google AI provider
   - Primary usage: `googleAI` plugin, model configuration
   - Configuration: `genkit.config.ts`, `flows/imageGenerationFlow.ts`

## @google/genai SDK Documentation

### Core Classes and Initialization

#### GoogleGenAI Client

```typescript
import { GoogleGenAI } from '@google/genai';

// Basic initialization
const genaiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

// Vertex AI initialization
const genaiClient = new GoogleGenAI({
  vertexai: true,
  project: 'your-project-id',
  location: 'us-central1'
});

// Environment-based initialization
const genaiClient = new GoogleGenAI(); // Uses GOOGLE_API_KEY env var
```

#### GoogleGenAIOptions Interface

```typescript
interface GoogleGenAIOptions {
  apiKey?: string;                    // API Key for Gemini API clients (required on browser)
  apiVersion?: string;                // API version (optional)
  googleAuthOptions?: GoogleAuthOptions<JSONClient>; // For Vertex AI clients (Node only)
  httpOptions?: HttpOptions;          // HTTP request customization
  location?: string;                  // Google Cloud project location (Node only)
  project?: string;                   // Google Cloud project ID (Node only)
  vertexai?: boolean;                 // Use Vertex AI (true) or Gemini API (false)
}
```

### Content Generation Methods

#### generateContent - Basic Generation

```typescript
const response = await genaiClient.models.generateContent({
  model: 'gemini-2.0-flash-001',
  contents: [{ role: 'user', parts: [{ text: 'Hello, world!' }] }],
  config: {
    temperature: 0.7,
    maxOutputTokens: 4096,
    tools: [{ googleSearch: {} }]
  }
});

console.log(response.candidates[0].content.parts[0].text);
```

#### generateContentStream - Streaming Generation

```typescript
const stream = await genaiClient.models.generateContentStream({
  model: 'gemini-2.0-flash-001',
  contents: [{ role: 'user', parts: [{ text: 'Tell me a story' }] }],
  config: {
    temperature: 0.7,
    maxOutputTokens: 4096
  }
});

for await (const chunk of stream) {
  if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
    console.log(chunk.candidates[0].content.parts[0].text);
  }
}
```

### Generation Configuration

#### GenerationConfig Interface

```typescript
interface GenerationConfig {
  audioTimestamp?: boolean;           // Include audio timestamps
  candidateCount?: number;            // Number of response candidates
  enableAffectiveDialog?: boolean;    // Enable emotion detection
  frequencyPenalty?: number;          // Penalty for repeating tokens by frequency
  logprobs?: number;                  // Number of log probabilities to return
  maxOutputTokens?: number;           // Maximum output tokens
  mediaResolution?: MediaResolution;  // Media output resolution
  modelSelectionConfig?: ModelSelectionConfig; // Model selection config
  presencePenalty?: number;           // Penalty for repeating tokens by presence
  responseJsonSchema?: unknown;       // JSON schema for response validation
  responseLogprobs?: boolean;         // Include log probabilities
  responseMimeType?: string;          // Response MIME type ('text/plain', 'application/json')
  responseModalities?: Modality[];    // Response modalities
  responseSchema?: Schema;            // Response structure schema
  routingConfig?: GenerationConfigRoutingConfig; // Request routing config
  seed?: number;                      // Seed for reproducible generation
  speechConfig?: SpeechConfig;        // Speech synthesis config
  stopSequences?: string[];           // Sequences that stop generation
  temperature?: number;               // Controls randomness (0.0-1.0)
  thinkingConfig?: GenerationConfigThinkingConfig; // Thinking process config
  topK?: number;                      // Top-K sampling
  topP?: number;                      // Top-P (nucleus) sampling
}
```

#### ThinkingConfig for Advanced Reasoning

```typescript
interface GenerationConfigThinkingConfig {
  includeThoughts?: boolean;          // Include model thoughts in response
  thinkingBudget?: number;           // Budget for thinking process (-1 for dynamic)
}

// Usage example
const config = {
  thinkingConfig: {
    thinkingBudget: 4000,
    includeThoughts: true
  }
};
```

### Tool Configuration

#### Tools and Function Calling

```typescript
// Google Search tool
const tools = [{ googleSearch: {} }];

// Code execution tool
const tools = [{ codeExecution: {} }];

// Custom function calling
const tools = [{
  functionDeclarations: [{
    name: 'getWeather',
    description: 'Get current weather for a location',
    parameters: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City name' }
      },
      required: ['location']
    }
  }]
}];
```

### Multimodal Capabilities

#### Image and Video Processing

```typescript
// Image input
import { createPartFromUri } from '@google/genai';

const contents = [{
  role: 'user',
  parts: [
    { text: 'Describe this image' },
    await createPartFromUri('https://example.com/image.jpg', 'image/jpeg')
  ]
}];

// Video processing with local file
const videoFile = await fs.readFile('/path/to/video.mp4');
const contents = [{
  role: 'user',
  parts: [
    { text: 'Analyze this video' },
    {
      inlineData: {
        mimeType: 'video/mp4',
        data: videoFile.toString('base64')
      }
    }
  ]
}];
```

#### Text-to-Speech (TTS)

```typescript
const response = await genaiClient.models.generateContent({
  model: 'gemini-2.5-flash-preview-tts',
  contents: [{ parts: [{ text: 'Hello, world!' }] }],
  config: {
    responseModalities: ['AUDIO'],
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: 'Zephyr'
        }
      }
    }
  }
});

const audioData = response.candidates[0].content.parts[0].inlineData.data;
const audioBuffer = Buffer.from(audioData, 'base64');
```

## Genkit Framework Documentation

### Core Concepts

#### Genkit Initialization

```typescript
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

const ai = genkit({
  plugins: [googleAI()],
  model: 'gemini-2.0-flash'
});
```

#### Flow Definition

```typescript
import { z } from 'zod';

const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: z.object({
      message: z.string(),
      userId: z.string()
    }),
    outputSchema: z.object({
      response: z.string()
    })
  },
  async (input) => {
    const { text } = await ai.generate({
      prompt: `User: ${input.message}`,
      config: { temperature: 0.7, maxOutputTokens: 4096 }
    });
    
    return { response: text };
  }
);
```

### Generation Methods

#### Basic Generation

```typescript
const { text } = await ai.generate({
  prompt: 'Why is AI awesome?',
  config: {
    temperature: 0.7,
    maxOutputTokens: 4096
  }
});
```

#### Streaming Generation

```typescript
const { stream } = await ai.generateStream({
  prompt: 'Tell me a story',
  config: {
    temperature: 0.7,
    maxOutputTokens: 4096
  }
});

for await (const chunk of stream) {
  if (chunk.text) {
    console.log(chunk.text);
  }
}
```

#### Streaming with Callback (Critical for Discord Integration)

```typescript
// CRITICAL: Always await async callbacks in streaming loops
export async function streamChatResponse(
  input: ChatInputType,
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const { stream } = await ai.generateStream({
    prompt: input.message,
    config: GenerationConfigBuilder.build()
  });

  let fullResponse = '';
  
  for await (const chunk of stream) {
    if (chunk.text && !chunk.thoughts) {
      fullResponse += chunk.text;
      await onChunk(chunk.text); // CRITICAL: Must await async callbacks
    }
  }

  return fullResponse;
}
```

### Tool Definition

```typescript
const weatherTool = ai.defineTool(
  {
    name: 'getWeather',
    description: 'Get current weather for a location',
    inputSchema: z.object({
      location: z.string().describe('City name')
    }),
    outputSchema: z.string()
  },
  async (input) => {
    // Tool implementation
    return `Weather in ${input.location}: 72°F and sunny`;
  }
);

const { text } = await ai.generate({
  tools: [weatherTool],
  prompt: 'What\'s the weather in New York?'
});
```

## @genkit-ai/googleai Plugin Documentation

### Plugin Configuration

```typescript
import { googleAI, gemini15Flash } from '@genkit-ai/googleai';

const ai = genkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_API_KEY
    })
  ],
  model: gemini15Flash
});
```

### Available Models

```typescript
import {
  gemini15Flash,
  gemini15Pro,
  gemini20Flash,
  textEmbeddingGecko001
} from '@genkit-ai/googleai';

// Model usage
const response = await ai.generate({
  model: gemini20Flash,
  prompt: 'Hello, world!'
});
```

### Image Generation

```typescript
import { imagen2 } from '@genkit-ai/googleai';

const response = await ai.generate({
  model: imagen2,
  prompt: 'A beautiful sunset over mountains',
  config: {
    numberOfImages: 1,
    aspectRatio: '16:9'
  }
});
```

## Implementation Patterns

### Codebase Integration Patterns

#### 1. Genkit Configuration (genkit.config.ts)

```typescript
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';
import { botConfig } from './config/environment.js';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: botConfig.google.apiKey,
    }),
  ],
  model: googleAI.model(botConfig.google.model),
});
```

#### 2. Direct Google AI Client (GenerativeService.ts)

```typescript
import { GoogleGenAI } from '@google/genai';

export class GenerativeService {
  private readonly genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({ apiKey: botConfig.google.apiKey });
  }

  async generateSearchGroundedStream(prompt: string) {
    return await this.genAI.models.generateContentStream({
      model: botConfig.google.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ googleSearch: {} }],
        ...GenerationConfigBuilder.buildSearchGrounding()
      }
    });
  }
}
```

#### 3. Generation Configuration Builder

```typescript
export class GenerationConfigBuilder {
  static build(options: GenerationConfigOptions = {}): Record<string, unknown> {
    const generationConfig: Record<string, unknown> = {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      ...options,
    };

    // Add thinking configuration if enabled
    if (botConfig.thinking.enabled && botConfig.thinking.budget !== 0) {
      generationConfig.thinkingConfig = {
        thinkingBudget: botConfig.thinking.budget,
        includeThoughts: true,
      };
    }

    return generationConfig;
  }

  static buildSearchGrounding(options: GenerationConfigOptions = {}) {
    return this.build({
      temperature: 0.2,
      maxOutputTokens: 1500,
      ...options,
    });
  }
}
```

## Configuration Reference

### Environment Variables

```bash
# Google AI API Key
GOOGLE_API_KEY=your_api_key_here

# For Vertex AI
GCLOUD_PROJECT=your-project-id
GCLOUD_LOCATION=us-central1
GCLOUD_SERVICE_ACCOUNT_CREDS=path/to/credentials.json

# Model Selection
GOOGLE_MODEL=gemini-2.0-flash

# Thinking Configuration
THINKING_ENABLED=true
THINKING_BUDGET=4000  # -1 for dynamic
```

### Model Configuration Options

```typescript
interface BotConfig {
  google: {
    apiKey: string;
    model: string;
  };
  thinking: {
    enabled: boolean;
    budget: number; // -1 for dynamic allocation
  };
}
```

## Streaming Patterns

### Critical Streaming Implementation

#### Problem: Race Conditions in Streaming
When implementing real-time streaming from Genkit to Discord, chunks were being processed without waiting for async operations to complete, causing multiple messages instead of editing existing ones.

#### Solution: Proper Async Callback Handling

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

#### Complete Streaming Implementation

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

#### Code Execution Streaming

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

## Error Handling

### Common Error Patterns

```typescript
try {
  const response = await genaiClient.models.generateContent(params);
  return response;
} catch (error) {
  const errorMessage = (error as Error).message.toLowerCase();
  
  if (errorMessage.includes('safety')) {
    throw new Error('Content violates safety policies. Please try a different prompt.');
  }
  
  if (errorMessage.includes('timeout') || errorMessage.includes('deadline_exceeded')) {
    throw new Error('Request timed out. Please try again with a shorter prompt.');
  }
  
  if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted')) {
    throw new Error('Service quota exceeded. Please try again later.');
  }
  
  if (errorMessage.includes('invalid_argument')) {
    throw new Error('Invalid input parameters. Please check your request.');
  }
  
  throw new Error(`Generation failed: ${error instanceof Error ? error.message : String(error)}`);
}
```

### TTS-Specific Error Handling

```typescript
// TTS-specific error handling
if (error.message.includes('SAFETY')) {
  throw new Error('Content violates safety policies. Please try a different prompt.');
}
if (error.message.includes('DEADLINE_EXCEEDED')) {
  throw new Error('TTS generation timed out. Please try again with a shorter prompt.');
}
if (error.message.includes('QUOTA_EXCEEDED') || error.message.includes('RESOURCE_EXHAUSTED')) {
  throw new Error('TTS service quota exceeded. Please try again later.');
}
if (error.message.includes('INVALID_ARGUMENT')) {
  throw new Error('Invalid voice selection or prompt. Please check your input.');
}
```

## Best Practices

### 1. Package Preference Hierarchy

- **Primary**: Use `@google/genai` for direct AI functionality
- **Secondary**: Use `genkit` and `@genkit-ai/googleai` for flow orchestration
- **NEVER**: Use `@google/generative-ai` (deprecated package)

### 2. Model Selection

```typescript
// Recommended models by use case
const MODELS = {
  CHAT: 'gemini-2.0-flash',           // General conversation
  THINKING: 'gemini-2.5-flash',       // Complex reasoning tasks
  TTS: 'gemini-2.5-flash-preview-tts', // Text-to-speech
  CODE: 'gemini-2.0-flash',           // Code execution
  MULTIMODAL: 'gemini-2.0-flash'      // Image/video processing
};
```

### 3. Temperature Settings by Use Case

```typescript
const TEMPERATURE_CONFIGS = {
  CHAT: 0.7,           // Balanced creativity
  SEARCH: 0.2,         // Factual accuracy
  IMAGE_GEN: 0.8,      // Creative diversity
  CODE: 0.1,           // Deterministic output
  URL_CONTEXT: 0.3     // Conservative analysis
};
```

### 4. Token Limits by Use Case

```typescript
const TOKEN_LIMITS = {
  CHAT: 4096,          // Standard conversation
  SEARCH: 1500,        // Concise search results
  IMAGE_GEN: 2048,     // Image descriptions
  TTS: 2000,           // Audio generation
  CODE: 8192           // Code execution context
};
```

### 5. Async/Await Best Practices

```typescript
// ALWAYS await async callbacks in streaming loops
for await (const chunk of stream) {
  if (chunk.text) {
    await onChunk(chunk.text); // Critical for preventing race conditions
  }
}

// Use proper error handling in async operations
try {
  const result = await asyncOperation();
  return result;
} catch (error) {
  logger.error('Operation failed', { error });
  throw error;
}
```

### 6. State Management in Streaming

```typescript
// Use object existence rather than boolean flags for async state
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
```

### 7. Thinking Configuration Best Practices

```typescript
// Environment-based thinking configuration
if (botConfig.thinking.enabled && botConfig.thinking.budget !== 0) {
  config.thinkingConfig = {
    thinkingBudget: botConfig.thinking.budget, // -1 for dynamic
    includeThoughts: true
  };
}

// Filter thinking chunks in streaming
for await (const chunk of stream) {
  const chunkAny = chunk as any;
  if (chunk.text && !chunkAny.thoughts) {
    // Process user-facing content
    await onChunk(chunk.text);
  } else if (chunkAny.thoughts) {
    // Log thinking activity but don't stream to user
    logger.debug('Processing thinking chunk - not streaming to user');
  }
}
```

### 8. Multimodal Content Handling

```typescript
// Proper image processing
const processedImage = await createPartFromUri(imageUrl, mimeType);
const contents = [{
  role: 'user',
  parts: [
    { text: 'Analyze this image' },
    processedImage
  ]
}];

// Video processing with validation
if (video.duration && video.duration > MAX_VIDEO_DURATION) {
  throw new Error(`Video duration ${video.duration}s exceeds maximum ${MAX_VIDEO_DURATION}s`);
}
```

---

*This documentation cache is maintained for the Discord bot project and should be updated as the libraries evolve. Last updated: 2024-08-02*