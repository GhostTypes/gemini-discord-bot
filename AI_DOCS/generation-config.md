# Generation Configuration Documentation

This document covers all GenerationConfig interface options, configuration patterns, and best practices.

## GenerationConfig Interface

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

## Core Configuration Options

### Temperature Settings by Use Case

```typescript
const TEMPERATURE_CONFIGS = {
  CHAT: 0.7,           // Balanced creativity for conversation
  SEARCH: 0.2,         // Factual accuracy for search results
  IMAGE_GEN: 0.8,      // Creative diversity for image generation
  CODE: 0.1,           // Deterministic output for code
  URL_CONTEXT: 0.3     // Conservative analysis for URL content
};
```

### Token Limits by Use Case

```typescript
const TOKEN_LIMITS = {
  CHAT: 4096,          // Standard conversation
  SEARCH: 1500,        // Concise search results
  IMAGE_GEN: 2048,     // Image descriptions
  TTS: 2000,           // Audio generation
  CODE: 8192           // Code execution context
};
```

### Response Modalities

```typescript
// Text-only response (default)
responseModalities: ['TEXT']

// Audio-only response (TTS)
responseModalities: ['AUDIO']

// Both text and audio
responseModalities: ['TEXT', 'AUDIO']
```

## Advanced Configuration Features

### ThinkingConfig for Advanced Reasoning

```typescript
interface GenerationConfigThinkingConfig {
  includeThoughts?: boolean;          // Include model thoughts in response
  thinkingBudget?: number;           // Budget for thinking process (-1 for dynamic)
}

// Usage example
const config = {
  thinkingConfig: {
    thinkingBudget: 4000,     // Fixed token budget for thinking
    includeThoughts: true     // Include thinking process in response
  }
};

// Dynamic thinking budget
const config = {
  thinkingConfig: {
    thinkingBudget: -1,       // Dynamic allocation
    includeThoughts: true
  }
};
```

### JSON Response Configuration

```typescript
// Structured JSON response
const config = {
  responseMimeType: 'application/json',
  responseJsonSchema: {
    type: 'object',
    properties: {
      summary: { type: 'string' },
      confidence: { type: 'number' },
      categories: {
        type: 'array',
        items: { type: 'string' }
      }
    },
    required: ['summary', 'confidence']
  }
};
```

### Speech Configuration (TTS)

```typescript
interface SpeechConfig {
  voiceConfig: {
    prebuiltVoiceConfig: {
      voiceName: string;      // 'Zephyr', 'Alloy', 'Echo', etc.
    }
  }
}

// TTS configuration example
const config = {
  responseModalities: ['AUDIO'],
  speechConfig: {
    voiceConfig: {
      prebuiltVoiceConfig: {
        voiceName: 'Zephyr'
      }
    }
  }
};
```

## Configuration Builder Pattern

### Your Generation Config Builder

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

  static buildCodeExecution(options: GenerationConfigOptions = {}) {
    return this.build({
      temperature: 0.1,
      maxOutputTokens: 8192,
      ...options,
    });
  }

  static buildTTS(options: GenerationConfigOptions = {}) {
    return {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: options.voice || 'Zephyr'
          }
        }
      },
      maxOutputTokens: 2000,
      temperature: 0.7,
      ...options
    };
  }
}
```

## Environment-Based Configuration

### Thinking Configuration

```typescript
// Environment variables
THINKING_ENABLED=true
THINKING_BUDGET=4000  # -1 for dynamic

// Configuration usage
if (botConfig.thinking.enabled && botConfig.thinking.budget !== 0) {
  config.thinkingConfig = {
    thinkingBudget: botConfig.thinking.budget, // -1 for dynamic
    includeThoughts: true
  };
}
```

### Model-Specific Configurations

```typescript
const MODEL_CONFIGS = {
  'gemini-2.0-flash': {
    maxOutputTokens: 4096,
    temperature: 0.7
  },
  'gemini-2.5-flash': {
    maxOutputTokens: 8192,
    temperature: 0.7,
    thinkingConfig: {
      thinkingBudget: 4000,
      includeThoughts: true
    }
  },
  'gemini-2.5-flash-preview-tts': {
    maxOutputTokens: 2000,
    responseModalities: ['AUDIO']
  }
};
```

## Tool Integration Configuration

### Built-in Tools

```typescript
// Google Search tool
const tools = [{ googleSearch: {} }];

// Code execution tool
const tools = [{ codeExecution: {} }];

// Combined tools
const tools = [
  { googleSearch: {} },
  { codeExecution: {} }
];
```

### Custom Function Calling

```typescript
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

## Safety and Quality Controls

### Stop Sequences

```typescript
const config = {
  stopSequences: ['END', '###', 'STOP'],
  temperature: 0.7
};
```

### Penalties for Repetition

```typescript
const config = {
  frequencyPenalty: 0.1,    // Reduce frequency-based repetition
  presencePenalty: 0.1,     // Reduce presence-based repetition
  temperature: 0.7
};
```

### Reproducible Generation

```typescript
const config = {
  seed: 12345,              // Fixed seed for reproducible results
  temperature: 0.0          // Deterministic temperature
};
```

## Best Practices

### 1. Configuration by Use Case
- **Chat**: Higher temperature (0.7), moderate tokens (4096)
- **Search**: Lower temperature (0.2), concise tokens (1500)
- **Code**: Very low temperature (0.1), high tokens (8192)
- **Creative**: Higher temperature (0.8-0.9), flexible tokens

### 2. Thinking Configuration
- Enable thinking for complex reasoning tasks
- Use dynamic budget (-1) for variable complexity
- Filter thinking chunks in streaming (see [streaming-patterns.md](./streaming-patterns.md))

### 3. Response Formatting
- Use JSON schema for structured outputs
- Set appropriate MIME types
- Validate response structure

### 4. Performance Optimization
- Set reasonable token limits to avoid timeouts
- Use appropriate temperature for task type
- Cache configurations for repeated use patterns

## Related Documentation

- [google-genai-client.md](./google-genai-client.md) - Basic client usage
- [streaming-patterns.md](./streaming-patterns.md) - Streaming with configurations
- [advanced-features.md](./advanced-features.md) - TTS and code execution configs
- [configuration-examples.md](./configuration-examples.md) - Your actual config implementations