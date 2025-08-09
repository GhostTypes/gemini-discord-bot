# AI/Genkit Integration Best Practices Guide

## Executive Summary

The AI/Genkit Integration Best Practices Guide provides comprehensive documentation for implementing robust, production-ready AI integrations using Google Genkit framework and Gemini models. This guide establishes critical patterns for structured input/output handling, schema compatibility, streaming implementations, and error handling that ensure reliable AI-powered Discord bot functionality.

The architecture emphasizes mandatory structured schemas, Gemini API compatibility requirements, proper streaming patterns, and comprehensive error boundaries. These patterns prevent common integration pitfalls while enabling sophisticated AI capabilities including multimodal processing, intent routing, and real-time response generation.

## Architecture Overview

### Core Integration Components

#### Genkit Configuration (src/genkit.config.ts)
Central AI framework configuration providing:
- **Google AI Integration**: Direct connection to Gemini models via @google/genai package
- **Model Registry**: Centralized model configuration and access patterns
- **Configuration Management**: Environment-based settings and model parameters
- **Plugin Integration**: Google AI plugin registration and initialization

#### AI Flows (src/flows/)
Specialized processing flows implementing:
- **Structured Input/Output**: Mandatory Zod schema validation for all AI interactions
- **Streaming Support**: Real-time response generation with proper async handling
- **Multimodal Capabilities**: Image, video, PDF, and mixed media processing
- **Intent Classification**: Intelligent routing based on user intent analysis
- **Error Boundaries**: Comprehensive error handling with graceful degradation

#### Schema Management (src/flows/schemas/)
Type-safe schema definitions providing:
- **Gemini API Compatibility**: Schemas designed specifically for Gemini's OpenAPI 3.0 requirements
- **Input Validation**: Comprehensive validation of user inputs and system parameters
- **Output Structures**: Well-defined response formats for consistent processing
- **Extension Patterns**: Reusable schema patterns for new flow development

### Mandatory Structured Input/Output Pattern

**CRITICAL REQUIREMENT**: All AI/Genkit integrations in this codebase MUST use structured input and output schemas. Manual JSON strings or unstructured data handling is strictly prohibited.

#### Why Structured Schemas Are Required

```typescript
// ❌ NEVER DO THIS - Manual JSON handling
const prompt = `Return your response as JSON: {"response": "...", "confidence": 0.9}`;
const result = await ai.generate(prompt);
const parsed = JSON.parse(result.text()); // Fragile and error-prone

// ✅ ALWAYS DO THIS - Structured schemas
const result = await ai.generate({
  model: gemini20FlashLite,
  prompt: userQuery,
  output: { schema: ResponseSchema } // Structured output generation
});
const typedResult: ResponseOutput = result.output; // Type-safe and validated
```

**Benefits of Structured Approach:**
- **Type Safety**: Compile-time type checking prevents runtime errors
- **Automatic Validation**: Input/output validation handled by Zod schemas
- **Maintainability**: Clear contracts between AI flows and calling code
- **Debugging**: Structured data easier to inspect and troubleshoot
- **Performance**: Genkit optimizes structured data handling internally

#### Proper Flow Definition Pattern

```typescript
import { z } from 'zod';
import { defineFlow } from '@genkit-ai/flow';
import { ai } from '../genkit.config.js';
import { gemini20FlashLite } from '@genkit-ai/googleai';

// Define input schema
const InputSchema = z.object({
  userMessage: z.string().min(1, 'Message cannot be empty'),
  context: z.array(z.string()).optional(),
  userId: z.string().optional(),
  channelId: z.string().optional()
});

// Define output schema - MUST be Gemini API compatible
const OutputSchema = z.object({
  response: z.string(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
  followUpSuggestions: z.array(z.string()).optional()
});

// Type definitions for TypeScript support
type InputType = z.infer<typeof InputSchema>;
type OutputType = z.infer<typeof OutputSchema>;

export const structuredAIFlow = defineFlow(
  {
    name: 'structured-ai-flow',
    inputSchema: InputSchema,
    outputSchema: OutputSchema,
  },
  async (input: InputType): Promise<OutputType> => {
    try {
      // Input is automatically validated by Genkit
      const result = await ai.generate({
        model: gemini20FlashLite,
        prompt: buildPrompt(input.userMessage, input.context),
        config: {
          temperature: 0.7,
          maxOutputTokens: 2000
        },
        output: { 
          schema: OutputSchema // Structured output ensures type safety
        }
      });
      
      // Output is automatically validated and typed
      return result.output;
    } catch (error) {
      logger.error('Structured AI flow failed:', error);
      throw error;
    }
  }
);
```

## Gemini API Schema Compatibility - CRITICAL REQUIREMENTS

### The Compatibility Challenge

Zod generates JSON Schema features that are incompatible with Gemini API's OpenAPI 3.0-based schema format. Using incompatible schema features results in 400 Bad Request errors.

#### Incompatible Zod Features (AVOID THESE)

```typescript
// ❌ THESE WILL CAUSE API ERRORS

// 1. Numeric exclusive constraints
z.number().positive()           // Generates "exclusiveMinimum" error
z.number().int()               // May cause integer constraint issues

// 2. Literal values
z.literal("specific_value")     // Generates "const" error

// 3. Complex union schemas
z.discriminatedUnion("type", [
  z.object({ type: z.literal("A"), valueA: z.string() }),
  z.object({ type: z.literal("B"), valueB: z.number() })
]); // Creates complex "any_of" structures

// 4. Dynamic record schemas
z.record(z.string(), z.number()) // Generates "should be non-empty" error

// 5. Complex array item unions
z.array(z.union([z.string(), z.number()])) // May cause "items: missing field" error
```

#### Compatible Zod Patterns (USE THESE)

```typescript
// ✅ GEMINI API COMPATIBLE PATTERNS

// 1. Basic numeric constraints
z.number().min(1)              // Instead of positive()
z.number().min(0).max(100)     // Safe numeric ranges

// 2. Enums instead of literals
z.enum(["WEAPON", "ARMOR"])    // Instead of z.literal()

// 3. Single flexible schemas
z.object({
  type: z.enum(["weapon", "armor"]),
  damage: z.number().optional(),    // Only for weapons
  defense: z.number().optional(),   // Only for armor
}); // Instead of discriminated unions

// 4. Explicit object properties
z.object({
  strength: z.number().optional(),
  dexterity: z.number().optional(),
  intelligence: z.number().optional()
}); // Instead of z.record()

// 5. Simple array types
z.array(z.string())            // Simple, compatible array types
z.array(z.object({             // Or arrays of consistent objects
  name: z.string(),
  value: z.number()
}))
```

### Proven Compatible Schema Patterns

#### Example: Item Generation Schema (Successfully Used in Production)

```typescript
// This schema was used successfully in AI Uprising game item generation
const ItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['WEAPON', 'ARMOR', 'CONSUMABLE', 'ACCESSORY', 'KEY_ITEM', 'MATERIAL']),
  quantity: z.number().min(1),  // Instead of positive()
  description: z.string(),
  rarity: z.enum(['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']),
  usable: z.boolean(),
  
  // Optional type-specific fields (instead of union schemas)
  stats: z.object({
    damage: z.number().min(1).optional(),
    accuracy: z.number().min(0).max(100).optional(),
    defense: z.number().min(1).optional(),
    durability: z.number().min(1).optional()
  }).optional(),
  
  effect: z.object({
    type: z.enum(['HEAL_HP', 'RESTORE_ENERGY', 'BUFF_STAT', 'CURE_STATUS']),
    value: z.number(),
    duration: z.number().optional()
  }).optional(),
  
  // Explicit stat boost properties (instead of record)
  statsBoost: z.object({
    hacking: z.number().optional(),
    stealth: z.number().optional(),
    charisma: z.number().optional(),
    combat: z.number().optional(),
    intelligence: z.number().optional()
  }).optional(),
  
  purpose: z.string().optional(),     // For key items
  category: z.enum(['TECH', 'METAL', 'ENERGY', 'BIOLOGICAL']).optional() // For materials
});
```

#### Testing Schema Compatibility

```typescript
// Always test schemas before production use
async function testSchemaCompatibility<T>(schema: z.ZodSchema<T>, testPrompt: string): Promise<boolean> {
  try {
    const result = await ai.generate({
      model: gemini20FlashLite,
      prompt: testPrompt,
      output: { schema }
    });
    
    console.log('✅ Schema compatible:', result.output);
    return true;
  } catch (error) {
    console.error('❌ Schema compatibility error:', error.message);
    
    // Check for specific compatibility issues
    if (error.message.includes('exclusiveMinimum')) {
      console.error('Fix: Replace z.number().positive() with z.number().min(1)');
    }
    if (error.message.includes('const')) {
      console.error('Fix: Replace z.literal() with z.enum()');
    }
    if (error.message.includes('should be non-empty')) {
      console.error('Fix: Replace z.record() with explicit object properties');
    }
    
    return false;
  }
}

// Usage
await testSchemaCompatibility(ItemSchema, "Generate a test weapon item");
```

## Streaming Implementation Patterns

### Proper Streaming Architecture

Streaming responses require careful async handling to prevent race conditions:

```typescript
// Core streaming pattern used across all flows
export async function streamResponse<T>(
  model: any,
  prompt: string,
  config: any,
  onChunk: (chunk: string) => Promise<void>, // CRITICAL: Must return Promise<void>
  outputSchema?: z.ZodSchema<T>
): Promise<T | null> {
  try {
    const generateOptions: any = {
      model,
      prompt,
      config
    };
    
    // Add structured output if schema provided
    if (outputSchema) {
      generateOptions.output = { schema: outputSchema };
    }
    
    const stream = await ai.generateStream(generateOptions);
    let finalOutput: T | null = null;

    // CRITICAL: Always await onChunk callbacks
    for await (const chunk of stream) {
      if (chunk.text) {
        await onChunk(chunk.text); // Prevents race conditions
      }
      
      // Capture final structured output if available
      if (chunk.output && outputSchema) {
        finalOutput = chunk.output;
      }
    }
    
    return finalOutput;
  } catch (error) {
    logger.error('Streaming failed:', error);
    throw error;
  }
}
```

#### Race Condition Prevention

```typescript
// ❌ WRONG - Causes multiple Discord messages
for await (const chunk of stream) {
  if (chunk.text) {
    onChunk(chunk.text); // Not awaited - next chunk fires before this completes
  }
}

// ✅ CORRECT - Proper async handling
for await (const chunk of stream) {
  if (chunk.text) {
    await onChunk(chunk.text); // Wait for callback completion
  }
}
```

**Why This Matters:**
1. **Discord API Calls**: Each onChunk may involve Discord API calls that take time
2. **State Management**: Streaming state must be preserved between chunks
3. **Message Editing**: Discord messages must be edited, not created anew
4. **Error Handling**: Errors in async callbacks must be properly handled

### Multimodal Streaming Implementation

```typescript
// Example from multimodalChatFlow.ts
export async function streamMultimodalChatResponse(
  message: Message,
  prompt: string,
  mediaItems: ProcessedMedia[],
  onChunk: (chunk: string) => Promise<void>
): Promise<void> {
  try {
    // Prepare media for Gemini API
    const preparedMedia = mediaItems.map(item => ({
      contentType: item.mimeType,
      data: item.data // Base64 encoded data
    }));

    const stream = await ai.generateStream({
      model: gemini20FlashLite,
      prompt,
      media: preparedMedia, // Multimodal input
      config: new GenerationConfigBuilder()
        .temperature(0.7)
        .maxOutputTokens(4096)
        .build()
    });

    // Stream with proper async handling
    for await (const chunk of stream) {
      if (chunk.text) {
        await onChunk(chunk.text);
      }
    }
  } catch (error) {
    logger.error('Multimodal streaming error:', error);
    
    // Graceful degradation to text-only
    try {
      logger.info('Attempting fallback to text-only processing');
      await streamChatResponse(message, prompt, onChunk);
    } catch (fallbackError) {
      logger.error('Fallback also failed:', fallbackError);
      throw error; // Re-throw original error
    }
  }
}
```

## Configuration and Model Management

### Centralized Configuration

```typescript
// genkit.config.ts - Central AI configuration
import { configureGenkit } from '@genkit-ai/core';
import { googleAI } from '@genkit-ai/googleai';
import { dotenv } from '@genkit-ai/dotenv';

// Load environment configuration
dotenv();

// Configure Genkit with Google AI
export const ai = configureGenkit({
  plugins: [
    googleAI({
      apiKey: process.env.GOOGLE_AI_API_KEY,
      baseUrl: process.env.GOOGLE_AI_BASE_URL // Optional custom endpoint
    })
  ],
  logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  enableTracingAndMetrics: process.env.ENABLE_TRACING === 'true'
});

// Model exports for consistent usage
export { gemini20FlashLite } from '@genkit-ai/googleai';
```

### Generation Configuration Builder

Centralized configuration management for consistent AI behavior:

```typescript
// utils/GenerationConfigBuilder.ts
export class GenerationConfigBuilder {
  private config: any = {
    temperature: 0.7,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 2048,
    candidateCount: 1,
    stopSequences: []
  };

  temperature(value: number): this {
    this.config.temperature = Math.max(0, Math.min(1, value));
    return this;
  }

  maxOutputTokens(value: number): this {
    this.config.maxOutputTokens = Math.max(1, Math.min(8192, value));
    return this;
  }

  topP(value: number): this {
    this.config.topP = Math.max(0, Math.min(1, value));
    return this;
  }

  topK(value: number): this {
    this.config.topK = Math.max(1, value);
    return this;
  }

  stopSequences(sequences: string[]): this {
    this.config.stopSequences = sequences;
    return this;
  }

  candidateCount(count: number): this {
    this.config.candidateCount = Math.max(1, count);
    return this;
  }

  // Preset configurations for common use cases
  static creative(): GenerationConfigBuilder {
    return new GenerationConfigBuilder()
      .temperature(0.9)
      .topP(0.95)
      .maxOutputTokens(4096);
  }

  static factual(): GenerationConfigBuilder {
    return new GenerationConfigBuilder()
      .temperature(0.1)
      .topP(0.8)
      .topK(10)
      .maxOutputTokens(2048);
  }

  static conversational(): GenerationConfigBuilder {
    return new GenerationConfigBuilder()
      .temperature(0.7)
      .topP(0.9)
      .maxOutputTokens(4096);
  }

  static structured(): GenerationConfigBuilder {
    return new GenerationConfigBuilder()
      .temperature(0.3)
      .topP(0.8)
      .maxOutputTokens(2048);
  }

  build(): any {
    return { ...this.config };
  }
}
```

## Intent Routing and Classification

### AI-Powered Routing System

The routing system uses AI to intelligently classify user intent:

```typescript
// flows/routingFlow.ts
export class RoutingFlow {
  async determineIntent(input: RoutingDecisionInput): Promise<RoutingDecisionOutput> {
    try {
      // Validate input first
      const validatedInput = RoutingDecisionInputSchema.parse(input);
      
      // Build context-aware prompt
      const routingPrompt = this.buildRoutingPrompt(validatedInput);
      
      // Use structured output for reliable classification
      const result = await ai.generate({
        model: gemini20FlashLite,
        prompt: routingPrompt,
        config: GenerationConfigBuilder
          .structured() // Use structured preset
          .maxOutputTokens(1000)
          .build(),
        output: { 
          schema: RoutingDecisionOutputSchema 
        }
      });

      // Result is automatically validated and typed
      const routingDecision: RoutingDecisionOutput = result.output;
      
      logger.info('Intent classification completed', {
        message: validatedInput.message.substring(0, 50),
        intent: routingDecision.intent,
        confidence: routingDecision.reasoning ? 'high' : 'medium'
      });
      
      return routingDecision;
    } catch (error) {
      logger.error('Intent classification failed:', error);
      
      // Fallback to conversation intent
      return {
        intent: 'CONVERSATION' as UserIntent,
        reasoning: 'Fallback due to classification error',
        entities: {}
      };
    }
  }

  private buildRoutingPrompt(input: RoutingDecisionInput): string {
    const gameContext = input.isInGameMode ? 
      `\nCONTEXT: Channel is in GAME mode. Current game: ${input.currentGameType || 'unknown'}` : 
      '\nCONTEXT: Channel is in NORMAL mode';

    const conversationContext = input.conversationContext ? 
      `\nRECENT CONVERSATION HISTORY:\n${input.conversationContext}\n` : 
      '';

    return `You are a Discord bot routing system. Analyze the user message and determine the intent.${gameContext}${conversationContext}

AVAILABLE INTENTS:
- CONVERSATION: Regular chat, questions, explanations
- IMAGE_GENERATION: Requests to create, generate, make, or draw images
- CODE_EXECUTION: Math problems, data analysis, code requests
- SEARCH_GROUNDING: Questions needing current/real-time web information
- URL_CONTEXT: When user provides specific URLs for analysis
- GAME_START: Starting games ("let's play", "start game")
- GAME_ACTION: Game actions when in game mode
- GAME_QUIT: Ending games ("quit", "exit", "stop game")
- AUTH_*: Authentication and permission management

USER MESSAGE: "${input.message}"

Classify the intent and provide reasoning for your decision.`;
  }
}
```

### Schema Definition for Routing

```typescript
// flows/schemas/routing.ts - Gemini API compatible schemas
export const UserIntentSchema = z.enum([
  'CONVERSATION',
  'IMAGE_GENERATION', 
  'CODE_EXECUTION',
  'SEARCH_GROUNDING',
  'URL_CONTEXT',
  'GAME_START',
  'GAME_ACTION',
  'GAME_QUIT',
  'GAME_HELP',
  'AUTH_ADD_OPERATOR',
  'AUTH_REMOVE_OPERATOR',
  'AUTH_LIST_OPERATORS',
  'AUTH_STATUS',
  'AUTH_WHITELIST_ADD',
  'AUTH_WHITELIST_REMOVE',
  'AUTH_WHITELIST_STATUS',
  'AUTH_WHITELIST_LIST',
]);

export const RoutingDecisionOutputSchema = z.object({
  intent: UserIntentSchema,
  reasoning: z.string().optional(),
  entities: z.object({
    gameType: z.string().optional(),
    gameAction: z.string().optional(),
    authAction: z.string().optional(),
    targetUserId: z.string().optional(),
    whitelistType: z.string().optional(),
    payload: z.any().optional() // Use sparingly, prefer specific types
  }).optional(),
});
```

## Error Handling and Fallback Strategies

### Comprehensive Error Boundaries

```typescript
// Robust error handling for AI flows
export async function executeAIFlowWithErrorHandling<T>(
  flowName: string,
  operation: () => Promise<T>,
  fallbackOperation?: () => Promise<T>
): Promise<T | null> {
  try {
    return await operation();
  } catch (error) {
    logger.error(`AI flow '${flowName}' failed:`, error);
    
    // Categorize error types for appropriate handling
    if (error.message.includes('quota') || error.message.includes('rate limit')) {
      logger.warn('API quota/rate limit exceeded', { flowName });
      
      if (fallbackOperation) {
        logger.info('Attempting fallback operation');
        try {
          return await fallbackOperation();
        } catch (fallbackError) {
          logger.error('Fallback operation also failed:', fallbackError);
        }
      }
      
      throw new Error('Service temporarily unavailable due to rate limits. Please try again later.');
    }
    
    if (error.message.includes('schema') || error.message.includes('validation')) {
      logger.error('Schema validation error', { flowName, error: error.message });
      throw new Error('Invalid input format. Please check your request and try again.');
    }
    
    if (error.message.includes('network') || error.message.includes('timeout')) {
      logger.warn('Network/timeout error', { flowName });
      throw new Error('Network error occurred. Please try again.');
    }
    
    // Unknown error - log details and provide generic message
    logger.error('Unknown AI flow error', { 
      flowName, 
      error: error.message, 
      stack: error.stack 
    });
    
    throw new Error('An unexpected error occurred. Please try again.');
  }
}
```

### Graceful Degradation Patterns

```typescript
// Example: Multimodal with text fallback
export async function handleMultimodalRequest(
  message: Message,
  prompt: string,
  mediaItems: ProcessedMedia[],
  onChunk: (chunk: string) => Promise<void>
): Promise<void> {
  // Try multimodal processing first
  try {
    await executeAIFlowWithErrorHandling(
      'multimodal-chat',
      () => streamMultimodalChatResponse(message, prompt, mediaItems, onChunk),
      // Fallback to text-only processing
      () => streamChatResponse(message, prompt, onChunk)
    );
  } catch (error) {
    logger.error('Both multimodal and text fallback failed:', error);
    
    // Final fallback - simple error message
    await message.reply('I encountered an error processing your request. Please try again with a simpler message.');
  }
}
```

### Retry Logic with Exponential Backoff

```typescript
// Robust retry mechanism for AI operations
async function retryAIOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry certain error types
      if (error.message.includes('quota exceeded') || 
          error.message.includes('invalid API key') ||
          error.message.includes('schema validation')) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
        logger.warn(`AI operation failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw new Error(`AI operation failed after ${maxRetries} attempts: ${lastError.message}`);
}
```

## Performance Optimization Strategies

### Token Budget Management

```typescript
// Intelligent token budget management
export class TokenBudgetManager {
  private readonly modelLimits = {
    'gemini-2.0-flash-lite': {
      input: 1048576,  // 1M tokens
      output: 8192     // 8K tokens
    }
  };

  calculateTokenUsage(text: string): number {
    // Rough estimation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  optimizePromptForTokenBudget(
    prompt: string, 
    context: string, 
    maxInputTokens: number = 100000
  ): string {
    const promptTokens = this.calculateTokenUsage(prompt);
    const contextTokens = this.calculateTokenUsage(context);
    const totalTokens = promptTokens + contextTokens;
    
    if (totalTokens <= maxInputTokens) {
      return prompt + '\n\nContext:\n' + context;
    }
    
    // Truncate context to fit budget
    const availableContextTokens = maxInputTokens - promptTokens - 100; // Safety margin
    const maxContextLength = availableContextTokens * 4; // Rough conversion back to characters
    
    if (maxContextLength > 0) {
      const truncatedContext = context.length > maxContextLength ? 
        context.substring(0, maxContextLength) + '...[truncated]' : 
        context;
      
      logger.info('Context truncated for token budget', {
        originalLength: context.length,
        truncatedLength: truncatedContext.length,
        estimatedTokens: this.calculateTokenUsage(prompt + truncatedContext)
      });
      
      return prompt + '\n\nContext:\n' + truncatedContext;
    }
    
    // Context too large, return prompt only
    logger.warn('Context completely removed due to token budget constraints');
    return prompt;
  }
}
```

### Caching and Memoization

```typescript
// Response caching for repeated queries
export class AIResponseCache {
  private cache = new Map<string, CacheEntry>();
  private readonly maxCacheSize = 1000;
  private readonly cacheTTL = 10 * 60 * 1000; // 10 minutes

  async getCachedResponse<T>(
    cacheKey: string,
    generator: () => Promise<T>
  ): Promise<T> {
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiry) {
      logger.debug('Cache hit', { cacheKey });
      return cached.data;
    }
    
    // Generate new response
    const result = await generator();
    
    // Cache the result
    this.setCachedResponse(cacheKey, result);
    
    return result;
  }

  private setCachedResponse<T>(key: string, data: T): void {
    // Implement LRU eviction
    if (this.cache.size >= this.maxCacheSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
    }
    
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.cacheTTL,
      createdAt: Date.now()
    });
  }

  generateCacheKey(prompt: string, model: string, config: any): string {
    // Create deterministic cache key
    const configString = JSON.stringify(config);
    const combined = `${model}:${prompt}:${configString}`;
    
    // Use hash to avoid extremely long keys
    return this.hash(combined);
  }

  private hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }
}
```

## Testing Strategies for AI Integrations

### Mock AI Responses for Testing

```typescript
// Mock AI service for testing
export class MockAIService {
  private responses = new Map<string, any>();
  private callLog: Array<{ prompt: string; timestamp: Date }> = [];

  setMockResponse(promptPattern: string, response: any): void {
    this.responses.set(promptPattern, response);
  }

  async generate(options: {
    model: any;
    prompt: string;
    config?: any;
    output?: { schema: any };
  }): Promise<any> {
    this.callLog.push({
      prompt: options.prompt,
      timestamp: new Date()
    });

    // Find matching mock response
    for (const [pattern, response] of this.responses) {
      if (options.prompt.includes(pattern)) {
        if (options.output?.schema) {
          // Validate mock response against schema
          try {
            options.output.schema.parse(response);
            return { output: response };
          } catch (error) {
            throw new Error(`Mock response doesn't match schema: ${error.message}`);
          }
        }
        return { text: () => JSON.stringify(response) };
      }
    }

    // Default response if no mock found
    return {
      text: () => 'Mock AI response for: ' + options.prompt.substring(0, 50)
    };
  }

  async generateStream(options: any): Promise<AsyncIterable<any>> {
    const response = await this.generate(options);
    const text = typeof response.text === 'function' ? response.text() : JSON.stringify(response.output);
    
    // Simulate streaming by breaking response into chunks
    const chunks = text.match(/.{1,50}/g) || [text];
    
    return {
      [Symbol.asyncIterator]: async function* () {
        for (const chunk of chunks) {
          yield { text: chunk };
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate delay
        }
      }
    };
  }

  getCallLog(): Array<{ prompt: string; timestamp: Date }> {
    return [...this.callLog];
  }

  clearCallLog(): void {
    this.callLog = [];
  }
}
```

### Schema Testing Utilities

```typescript
// Comprehensive schema testing
export class SchemaTestRunner {
  async testSchemaCompatibility<T>(
    schema: z.ZodSchema<T>,
    testCases: Array<{ name: string; data: any; shouldPass: boolean }>
  ): Promise<TestResults> {
    const results: TestResults = {
      passed: 0,
      failed: 0,
      errors: []
    };

    for (const testCase of testCases) {
      try {
        const parsed = schema.parse(testCase.data);
        
        if (testCase.shouldPass) {
          results.passed++;
          console.log(`✅ ${testCase.name}: Passed`);
        } else {
          results.failed++;
          results.errors.push(`${testCase.name}: Expected failure but passed`);
          console.log(`❌ ${testCase.name}: Expected failure but passed`);
        }
      } catch (error) {
        if (!testCase.shouldPass) {
          results.passed++;
          console.log(`✅ ${testCase.name}: Failed as expected`);
        } else {
          results.failed++;
          results.errors.push(`${testCase.name}: ${error.message}`);
          console.log(`❌ ${testCase.name}: ${error.message}`);
        }
      }
    }

    return results;
  }

  async testGeminiAPICompatibility<T>(
    schema: z.ZodSchema<T>,
    mockAI: MockAIService,
    testPrompt: string = "Generate test data"
  ): Promise<boolean> {
    try {
      // Set up a mock response that should match the schema
      const mockData = this.generateMockDataForSchema(schema);
      mockAI.setMockResponse(testPrompt, mockData);

      // Test AI generation with schema
      const result = await mockAI.generate({
        model: 'test-model',
        prompt: testPrompt,
        output: { schema }
      });

      console.log('✅ Schema compatible with Gemini API patterns');
      return true;
    } catch (error) {
      console.error('❌ Schema compatibility issue:', error.message);
      return false;
    }
  }

  private generateMockDataForSchema<T>(schema: z.ZodSchema<T>): any {
    // This would be a complex function to generate valid mock data
    // based on the schema structure - implementation depends on schema complexity
    return {};
  }
}
```

## Debugging and Monitoring

### Comprehensive AI Operation Logging

```typescript
// Detailed logging for AI operations
export class AIOperationLogger {
  async logAIOperation<T>(
    operation: string,
    input: any,
    operation_func: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    const operationId = `ai_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('AI operation started', {
      operationId,
      operation,
      inputSize: JSON.stringify(input).length,
      timestamp: new Date().toISOString()
    });

    try {
      const result = await operation_func();
      const duration = Date.now() - startTime;
      
      logger.info('AI operation completed', {
        operationId,
        operation,
        duration,
        outputSize: JSON.stringify(result).length,
        success: true
      });

      // Log performance metrics
      if (duration > 10000) { // 10 seconds
        logger.warn('Slow AI operation detected', {
          operationId,
          operation,
          duration
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('AI operation failed', {
        operationId,
        operation,
        duration,
        error: error.message,
        stack: error.stack,
        success: false
      });

      throw error;
    }
  }

  logStreamingSession(
    sessionId: string,
    chunksReceived: number,
    totalTokens: number,
    duration: number
  ): void {
    logger.info('Streaming session completed', {
      sessionId,
      chunksReceived,
      totalTokens,
      duration,
      tokensPerSecond: Math.round(totalTokens / (duration / 1000)),
      averageChunkSize: Math.round(totalTokens / chunksReceived)
    });
  }
}
```

### Performance Monitoring

```typescript
// AI performance metrics collection
export class AIPerformanceMonitor {
  private metrics = {
    operations: new Map<string, OperationMetrics>(),
    globalStats: {
      totalOperations: 0,
      totalTokensProcessed: 0,
      totalDuration: 0,
      errorCount: 0
    }
  };

  recordOperation(
    operation: string,
    duration: number,
    tokensProcessed: number,
    success: boolean
  ): void {
    // Update global stats
    this.metrics.globalStats.totalOperations++;
    this.metrics.globalStats.totalDuration += duration;
    this.metrics.globalStats.totalTokensProcessed += tokensProcessed;
    
    if (!success) {
      this.metrics.globalStats.errorCount++;
    }

    // Update operation-specific metrics
    const operationMetrics = this.metrics.operations.get(operation) || {
      count: 0,
      totalDuration: 0,
      totalTokens: 0,
      errors: 0,
      averageDuration: 0,
      tokensPerSecond: 0
    };

    operationMetrics.count++;
    operationMetrics.totalDuration += duration;
    operationMetrics.totalTokens += tokensProcessed;
    
    if (!success) {
      operationMetrics.errors++;
    }

    // Calculate averages
    operationMetrics.averageDuration = operationMetrics.totalDuration / operationMetrics.count;
    operationMetrics.tokensPerSecond = operationMetrics.totalTokens / (operationMetrics.totalDuration / 1000);

    this.metrics.operations.set(operation, operationMetrics);
  }

  generatePerformanceReport(): any {
    const globalStats = this.metrics.globalStats;
    
    return {
      summary: {
        totalOperations: globalStats.totalOperations,
        averageDuration: globalStats.totalOperations > 0 ? 
          Math.round(globalStats.totalDuration / globalStats.totalOperations) : 0,
        totalTokensProcessed: globalStats.totalTokensProcessed,
        averageTokensPerSecond: globalStats.totalDuration > 0 ?
          Math.round(globalStats.totalTokensProcessed / (globalStats.totalDuration / 1000)) : 0,
        errorRate: globalStats.totalOperations > 0 ?
          ((globalStats.errorCount / globalStats.totalOperations) * 100).toFixed(2) + '%' : '0%'
      },
      operationBreakdown: Array.from(this.metrics.operations.entries()).map(([operation, metrics]) => ({
        operation,
        count: metrics.count,
        averageDuration: Math.round(metrics.averageDuration),
        tokensPerSecond: Math.round(metrics.tokensPerSecond),
        errorRate: metrics.count > 0 ? ((metrics.errors / metrics.count) * 100).toFixed(2) + '%' : '0%'
      }))
    };
  }
}
```

## Common Pitfalls and Troubleshooting

### Schema Validation Issues

#### Problem: Getting 400 Bad Request with "exclusiveMinimum" error
**Cause**: Using `z.number().positive()` which generates incompatible schema
**Solution**: Replace with `z.number().min(1)`

```typescript
// ❌ Causes error
const BadSchema = z.object({
  level: z.number().positive()
});

// ✅ Fixed version
const GoodSchema = z.object({
  level: z.number().min(1)
});
```

#### Problem: "const" field error in API response
**Cause**: Using `z.literal()` values in schema
**Solution**: Replace with `z.enum()` containing single value

```typescript
// ❌ Causes error
const BadSchema = z.object({
  type: z.literal("WEAPON")
});

// ✅ Fixed version
const GoodSchema = z.object({
  type: z.enum(["WEAPON"])
});
```

#### Problem: "should be non-empty for OBJECT type" error
**Cause**: Using `z.record()` for dynamic properties
**Solution**: Define explicit object properties

```typescript
// ❌ Causes error
const BadSchema = z.object({
  stats: z.record(z.string(), z.number())
});

// ✅ Fixed version
const GoodSchema = z.object({
  stats: z.object({
    strength: z.number().optional(),
    dexterity: z.number().optional(),
    intelligence: z.number().optional()
  }).optional()
});
```

### Streaming Issues

#### Problem: Multiple Discord messages created instead of editing one
**Cause**: Not awaiting `onChunk` callbacks in streaming loops
**Solution**: Always await async callbacks

```typescript
// ❌ Race condition
for await (const chunk of stream) {
  if (chunk.text) {
    onChunk(chunk.text); // Not awaited
  }
}

// ✅ Proper handling
for await (const chunk of stream) {
  if (chunk.text) {
    await onChunk(chunk.text); // Properly awaited
  }
}
```

### Error Handling Issues

#### Problem: Unhandled AI API errors crashing the bot
**Cause**: Not implementing proper error boundaries
**Solution**: Wrap AI operations in comprehensive try-catch

```typescript
// ❌ No error handling
const result = await ai.generate({
  model: gemini20FlashLite,
  prompt: userPrompt
});

// ✅ Proper error handling
try {
  const result = await ai.generate({
    model: gemini20FlashLite,
    prompt: userPrompt
  });
  return result;
} catch (error) {
  logger.error('AI generation failed:', error);
  
  if (error.message.includes('quota')) {
    throw new Error('Service temporarily unavailable. Please try again later.');
  } else if (error.message.includes('invalid')) {
    throw new Error('Invalid request format. Please check your input.');
  } else {
    throw new Error('An unexpected error occurred. Please try again.');
  }
}
```

## Extension Points and Future Enhancements

### Adding New AI Flows

Template for creating new AI flows:

```typescript
// Template: flows/newFlow.ts
import { z } from 'zod';
import { ai } from '../genkit.config.js';
import { gemini20FlashLite } from '@genkit-ai/googleai';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';
import { logger } from '../utils/logger.js';

// Define Gemini-compatible schemas
const NewFlowInputSchema = z.object({
  // Use Gemini-compatible patterns
  userInput: z.string().min(1),
  context: z.array(z.string()).optional(),
  parameters: z.object({
    setting1: z.enum(['option1', 'option2']),
    setting2: z.number().min(0).max(100)
  }).optional()
});

const NewFlowOutputSchema = z.object({
  // Avoid complex unions, use optional fields
  result: z.string(),
  confidence: z.number().min(0).max(1),
  metadata: z.object({
    processingTime: z.number().optional(),
    modelUsed: z.string().optional()
  }).optional()
});

type NewFlowInput = z.infer<typeof NewFlowInputSchema>;
type NewFlowOutput = z.infer<typeof NewFlowOutputSchema>;

export async function executeNewFlow(input: NewFlowInput): Promise<NewFlowOutput> {
  try {
    // Validate input
    const validatedInput = NewFlowInputSchema.parse(input);
    
    // Build prompt
    const prompt = buildNewFlowPrompt(validatedInput);
    
    // Execute with structured output
    const result = await ai.generate({
      model: gemini20FlashLite,
      prompt,
      config: GenerationConfigBuilder
        .structured()
        .temperature(0.5)
        .maxOutputTokens(1500)
        .build(),
      output: { 
        schema: NewFlowOutputSchema 
      }
    });
    
    logger.info('New flow executed successfully', {
      inputLength: validatedInput.userInput.length,
      outputLength: result.output.result.length
    });
    
    return result.output;
  } catch (error) {
    logger.error('New flow execution failed:', error);
    throw error;
  }
}

// Streaming version
export async function streamNewFlow(
  input: NewFlowInput,
  onChunk: (chunk: string) => Promise<void>
): Promise<void> {
  try {
    const validatedInput = NewFlowInputSchema.parse(input);
    const prompt = buildNewFlowPrompt(validatedInput);
    
    const stream = await ai.generateStream({
      model: gemini20FlashLite,
      prompt,
      config: GenerationConfigBuilder
        .conversational()
        .build()
    });

    // Proper streaming with error handling
    for await (const chunk of stream) {
      if (chunk.text) {
        await onChunk(chunk.text);
      }
    }
  } catch (error) {
    logger.error('New flow streaming failed:', error);
    throw error;
  }
}

function buildNewFlowPrompt(input: NewFlowInput): string {
  // Build context-aware prompt
  const contextSection = input.context && input.context.length > 0 ?
    `\nContext: ${input.context.join('\n')}` : '';
  
  const parametersSection = input.parameters ?
    `\nParameters: ${JSON.stringify(input.parameters)}` : '';
  
  return `Process the following input according to the new flow requirements:

Input: ${input.userInput}${contextSection}${parametersSection}

Please provide a structured response that includes your analysis and results.`;
}
```

### Multi-Model Support

Framework for supporting multiple AI models:

```typescript
// Enhanced model management
export enum AIModel {
  GEMINI_FLASH_LITE = 'gemini-2.0-flash-lite',
  GEMINI_PRO = 'gemini-pro',
  GEMINI_FLASH = 'gemini-flash'
}

export class ModelRouter {
  private modelCapabilities = {
    [AIModel.GEMINI_FLASH_LITE]: {
      maxInputTokens: 1048576,
      maxOutputTokens: 8192,
      supportsMultimodal: true,
      supportsStreaming: true,
      costPerToken: 0.00001
    },
    [AIModel.GEMINI_PRO]: {
      maxInputTokens: 2097152,
      maxOutputTokens: 8192,
      supportsMultimodal: true,
      supportsStreaming: true,
      costPerToken: 0.0001
    }
  };

  selectOptimalModel(
    requirements: {
      inputTokens: number;
      needsMultimodal: boolean;
      needsStreaming: boolean;
      prioritizeCost: boolean;
    }
  ): AIModel {
    const suitable = Object.entries(this.modelCapabilities)
      .filter(([model, caps]) => {
        return caps.maxInputTokens >= requirements.inputTokens &&
               (!requirements.needsMultimodal || caps.supportsMultimodal) &&
               (!requirements.needsStreaming || caps.supportsStreaming);
      })
      .map(([model, caps]) => ({ model: model as AIModel, caps }));

    if (suitable.length === 0) {
      throw new Error('No suitable model found for requirements');
    }

    // Sort by cost or capability
    if (requirements.prioritizeCost) {
      suitable.sort((a, b) => a.caps.costPerToken - b.caps.costPerToken);
    } else {
      suitable.sort((a, b) => b.caps.maxInputTokens - a.caps.maxInputTokens);
    }

    return suitable[0].model;
  }
}
```

## Conclusion

The AI/Genkit Integration Best Practices Guide establishes critical patterns and requirements for building reliable, production-ready AI-powered Discord bot functionality. The mandatory structured schema approach, combined with Gemini API compatibility requirements and proper streaming patterns, creates a robust foundation for sophisticated AI capabilities.

Key architectural principles:
- **Mandatory Structured Schemas**: All AI interactions must use Zod schemas for type safety and validation
- **Gemini API Compatibility**: Specific schema patterns required to avoid API validation errors
- **Proper Streaming Implementation**: Async callback handling to prevent race conditions and ensure smooth user experience
- **Comprehensive Error Handling**: Multi-layered error boundaries with graceful degradation and user-friendly messaging
- **Performance Optimization**: Token budget management, response caching, and intelligent model selection
- **Production Monitoring**: Detailed logging, metrics collection, and performance tracking
- **Testing Infrastructure**: Mock services and schema validation for reliable development workflow

The patterns documented here prevent common integration pitfalls while enabling sophisticated AI features including multimodal processing, intelligent intent routing, and real-time streaming responses. The architecture's emphasis on type safety, error resilience, and performance optimization ensures that AI-powered features enhance user experience while maintaining system reliability in production environments.

Future developers and Claude Code instances working with this codebase must adhere to these established patterns to maintain consistency, reliability, and compatibility with the existing AI integration architecture.