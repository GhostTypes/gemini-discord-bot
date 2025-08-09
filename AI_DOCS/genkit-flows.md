# Genkit Flows Documentation

This document covers Genkit framework usage, flow definitions, and AI orchestration patterns.

## Core Concepts

### Genkit Initialization

```typescript
import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

const ai = genkit({
  plugins: [googleAI()],
  model: 'gemini-2.0-flash'
});
```

### Flow Definition Pattern

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

## Generation Methods

### Basic Generation

```typescript
const { text } = await ai.generate({
  prompt: 'Why is AI awesome?',
  config: {
    temperature: 0.7,
    maxOutputTokens: 4096
  }
});
```

### Streaming Generation

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

### Streaming with Callback (Critical for Discord Integration)

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

## Tool Definition and Usage

### Defining Custom Tools

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
```

### Using Tools in Generation

```typescript
const { text } = await ai.generate({
  tools: [weatherTool],
  prompt: 'What\'s the weather in New York?',
  config: {
    temperature: 0.3,
    maxOutputTokens: 2048
  }
});
```

## Advanced Flow Patterns

### Multi-step Flow with Context

```typescript
const multiStepFlow = ai.defineFlow(
  {
    name: 'multiStepAnalysis',
    inputSchema: z.object({
      content: z.string(),
      analysisType: z.enum(['summary', 'sentiment', 'keywords'])
    }),
    outputSchema: z.object({
      analysis: z.string(),
      confidence: z.number(),
      metadata: z.record(z.any())
    })
  },
  async (input) => {
    // Step 1: Initial analysis
    const { text: initialAnalysis } = await ai.generate({
      prompt: `Analyze this content for ${input.analysisType}: ${input.content}`,
      config: { temperature: 0.3 }
    });

    // Step 2: Confidence scoring
    const { text: confidenceScore } = await ai.generate({
      prompt: `Rate the confidence of this analysis on a scale of 0-1: ${initialAnalysis}`,
      config: { temperature: 0.1 }
    });

    return {
      analysis: initialAnalysis,
      confidence: parseFloat(confidenceScore) || 0.5,
      metadata: {
        analysisType: input.analysisType,
        contentLength: input.content.length,
        timestamp: new Date().toISOString()
      }
    };
  }
);
```

### Flow with Error Handling

```typescript
const robustFlow = ai.defineFlow(
  {
    name: 'robustGeneration',
    inputSchema: z.object({
      prompt: z.string(),
      maxRetries: z.number().default(3)
    }),
    outputSchema: z.object({
      response: z.string(),
      attempts: z.number()
    })
  },
  async (input) => {
    let attempts = 0;
    let lastError: Error | null = null;

    while (attempts < input.maxRetries) {
      attempts++;
      try {
        const { text } = await ai.generate({
          prompt: input.prompt,
          config: { 
            temperature: 0.7,
            maxOutputTokens: 4096
          }
        });
        
        return { response: text, attempts };
      } catch (error) {
        lastError = error as Error;
        logger.warn(`Generation attempt ${attempts} failed:`, error);
        
        if (attempts < input.maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        }
      }
    }

    throw new Error(`Generation failed after ${attempts} attempts: ${lastError?.message}`);
  }
);
```

## Model Selection in Flows

### Dynamic Model Selection

```typescript
const adaptiveFlow = ai.defineFlow(
  {
    name: 'adaptiveGeneration',
    inputSchema: z.object({
      prompt: z.string(),
      complexity: z.enum(['simple', 'moderate', 'complex'])
    }),
    outputSchema: z.object({
      response: z.string(),
      modelUsed: z.string()
    })
  },
  async (input) => {
    const modelMap = {
      simple: 'gemini-2.0-flash',
      moderate: 'gemini-2.0-flash',
      complex: 'gemini-2.5-flash'
    };

    const selectedModel = modelMap[input.complexity];
    
    const { text } = await ai.generate({
      model: selectedModel,
      prompt: input.prompt,
      config: {
        temperature: input.complexity === 'complex' ? 0.3 : 0.7,
        maxOutputTokens: input.complexity === 'complex' ? 8192 : 4096
      }
    });

    return {
      response: text,
      modelUsed: selectedModel
    };
  }
);
```

## Flow Composition

### Chaining Flows

```typescript
const analysisFlow = ai.defineFlow(
  {
    name: 'contentAnalysis',
    inputSchema: z.object({ content: z.string() }),
    outputSchema: z.object({ 
      summary: z.string(),
      sentiment: z.string(),
      keywords: z.array(z.string())
    })
  },
  async (input) => {
    // Use the multi-step flow for each analysis type
    const [summaryResult, sentimentResult, keywordResult] = await Promise.all([
      multiStepFlow({ content: input.content, analysisType: 'summary' }),
      multiStepFlow({ content: input.content, analysisType: 'sentiment' }),
      multiStepFlow({ content: input.content, analysisType: 'keywords' })
    ]);

    return {
      summary: summaryResult.analysis,
      sentiment: sentimentResult.analysis,
      keywords: keywordResult.analysis.split(',').map(k => k.trim())
    };
  }
);
```

## Best Practices

### 1. Schema Design
- Use descriptive field names in Zod schemas
- Include validation rules where appropriate
- Provide default values for optional fields
- Use enums for limited value sets

### 2. Error Handling
- Wrap generation calls in try-catch blocks
- Implement retry logic for transient failures
- Log errors with context for debugging
- Provide meaningful error messages to users

### 3. Performance Optimization
- Use appropriate models for task complexity
- Set reasonable token limits
- Implement caching for repeated prompts
- Use parallel execution where possible

### 4. Flow Organization
- Keep flows focused on single responsibilities
- Use composition for complex workflows
- Pass context through flow parameters
- Implement proper input validation

### 5. Streaming Integration
- Always await async callbacks in streaming loops
- Filter out thinking chunks when not needed
- Handle partial responses gracefully
- Implement proper state management

## Integration with Your Codebase

### Flow Registration Pattern

```typescript
// flows/index.ts
export const flows = {
  chat: chatFlow,
  multiStep: multiStepFlow,
  robust: robustFlow,
  adaptive: adaptiveFlow,
  analysis: analysisFlow
};

// Usage in services
import { flows } from '../flows/index.js';

export class ChatService {
  async processMessage(message: string, userId: string) {
    return await flows.chat({ message, userId });
  }
}
```

## Related Documentation

- [google-genai-client.md](./google-genai-client.md) - Direct client usage patterns
- [streaming-patterns.md](./streaming-patterns.md) - Streaming implementation details
- [configuration-examples.md](./configuration-examples.md) - Your actual flow configurations
- [integration-patterns.md](./integration-patterns.md) - Discord bot integration patterns