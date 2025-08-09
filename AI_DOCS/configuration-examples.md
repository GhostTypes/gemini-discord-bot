# Configuration Examples Documentation

This document contains your actual configuration patterns from the codebase, including genkit.config.ts, GenerativeService patterns, and environment setup.

## Genkit Configuration (genkit.config.ts)

### Basic Genkit Setup

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

### Extended Genkit Configuration with Multiple Models

```typescript
import { genkit } from 'genkit';
import { googleAI, gemini15Flash, gemini20Flash, gemini25Flash } from '@genkit-ai/googleai';
import { imagen2 } from '@genkit-ai/googleai';
import { botConfig } from './config/environment.js';

export const ai = genkit({
  plugins: [
    googleAI({
      apiKey: botConfig.google.apiKey,
    }),
  ],
});

// Export specific model configurations
export const models = {
  chat: gemini20Flash,
  thinking: gemini25Flash,
  multimodal: gemini20Flash,
  imageGen: imagen2
};
```

## Environment Configuration

### Environment Variables Structure

```typescript
// config/environment.ts
export interface BotConfig {
  discord: {
    token: string;
    clientId: string;
    enableTTS: boolean;
    enableCodeExecution: boolean;
    enableFileProcessing: boolean;
    maxFileSize: number;
    allowedChannels?: string[];
    ownerIds: string[];
  };
  google: {
    apiKey: string;
    model: string;
  };
  thinking: {
    enabled: boolean;
    budget: number; // -1 for dynamic allocation
  };
  features: {
    searchGrounding: boolean;
    urlContext: boolean;
    multimodal: boolean;
  };
}

export const botConfig: BotConfig = {
  discord: {
    token: process.env.DISCORD_TOKEN!,
    clientId: process.env.DISCORD_CLIENT_ID!,
    enableTTS: process.env.ENABLE_TTS === 'true',
    enableCodeExecution: process.env.ENABLE_CODE_EXECUTION === 'true',
    enableFileProcessing: process.env.ENABLE_FILE_PROCESSING === 'true',
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760'), // 10MB
    allowedChannels: process.env.ALLOWED_CHANNELS?.split(','),
    ownerIds: process.env.OWNER_IDS?.split(',') || []
  },
  google: {
    apiKey: process.env.GOOGLE_API_KEY!,
    model: process.env.GOOGLE_MODEL || 'gemini-2.0-flash'
  },
  thinking: {
    enabled: process.env.THINKING_ENABLED === 'true',
    budget: parseInt(process.env.THINKING_BUDGET || '4000') // -1 for dynamic
  },
  features: {
    searchGrounding: process.env.ENABLE_SEARCH_GROUNDING === 'true',
    urlContext: process.env.ENABLE_URL_CONTEXT === 'true',
    multimodal: process.env.ENABLE_MULTIMODAL === 'true'
  }
};
```

### Environment File (.env) Example

```bash
# Discord Configuration
DISCORD_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id_here

# Google AI Configuration
GOOGLE_API_KEY=your_google_api_key_here
GOOGLE_MODEL=gemini-2.0-flash

# Feature Toggles
ENABLE_TTS=true
ENABLE_CODE_EXECUTION=true
ENABLE_FILE_PROCESSING=true
ENABLE_SEARCH_GROUNDING=true
ENABLE_URL_CONTEXT=true
ENABLE_MULTIMODAL=true

# Thinking Configuration
THINKING_ENABLED=true
THINKING_BUDGET=4000  # -1 for dynamic allocation

# File Processing
MAX_FILE_SIZE=10485760  # 10MB in bytes

# Security
ALLOWED_CHANNELS=channel_id_1,channel_id_2
OWNER_IDS=user_id_1,user_id_2

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

## GenerativeService Configuration

### Direct Google AI Client Service

```typescript
// services/GenerativeService.ts
import { GoogleGenAI } from '@google/genai';
import { botConfig } from '../config/environment.js';
import { logger } from '../utils/logger.js';

export class GenerativeService {
  private readonly genAI: GoogleGenAI;

  constructor() {
    this.genAI = new GoogleGenAI({ 
      apiKey: botConfig.google.apiKey 
    });
  }

  async generateResponse(prompt: string, options: GenerationOptions = {}) {
    return await this.genAI.models.generateContent({
      model: botConfig.google.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: GenerationConfigBuilder.build(options)
    });
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

  async generateWithCodeExecution(prompt: string) {
    return await this.genAI.models.generateContentStream({
      model: botConfig.google.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        tools: [{ codeExecution: {} }],
        ...GenerationConfigBuilder.buildCodeExecution()
      }
    });
  }

  async generateTTS(text: string, voice: string = 'Zephyr') {
    return await this.genAI.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voice
            }
          }
        },
        maxOutputTokens: 2000,
        temperature: 0.7
      }
    });
  }
}
```

## Generation Configuration Builder

### Your Actual Configuration Builder

```typescript
// utils/GenerationConfigBuilder.ts
export interface GenerationConfigOptions {
  temperature?: number;
  maxOutputTokens?: number;
  voice?: string;
  includeThoughts?: boolean;
  tools?: any[];
}

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
        includeThoughts: options.includeThoughts ?? true,
      };
    }

    return generationConfig;
  }

  static buildChat(options: GenerationConfigOptions = {}) {
    return this.build({
      temperature: 0.7,
      maxOutputTokens: 4096,
      ...options,
    });
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

  static buildTTS(voice: string = 'Zephyr') {
    return {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: voice
          }
        }
      },
      maxOutputTokens: 2000,
      temperature: 0.7
    };
  }

  static buildImageGeneration(options: GenerationConfigOptions = {}) {
    return {
      numberOfImages: 1,
      aspectRatio: '16:9',
      temperature: 0.8,
      ...options
    };
  }

  static buildMultimodal(options: GenerationConfigOptions = {}) {
    return this.build({
      temperature: 0.3,
      maxOutputTokens: 4096,
      ...options,
    });
  }
}
```

## Flow Configuration Patterns

### Chat Flow Configuration

```typescript
// flows/chatFlow.ts
import { z } from 'zod';
import { ai } from '../genkit.config.js';
import { GenerationConfigBuilder } from '../utils/GenerationConfigBuilder.js';

export const ChatInputType = z.object({
  message: z.string(),
  userId: z.string().optional(),
  channelId: z.string().optional(),
  features: z.object({
    searchGrounding: z.boolean().default(false),
    codeExecution: z.boolean().default(false),
    urlContext: z.boolean().default(false)
  }).optional()
});

export const ChatOutputType = z.object({
  response: z.string(),
  hasCode: z.boolean().default(false),
  searchUsed: z.boolean().default(false),
  processingTime: z.number().optional()
});

export const chatFlow = ai.defineFlow(
  {
    name: 'chatFlow',
    inputSchema: ChatInputType,
    outputSchema: ChatOutputType
  },
  async (input) => {
    const startTime = Date.now();
    let config = GenerationConfigBuilder.buildChat();
    
    // Add tools based on features
    const tools = [];
    if (input.features?.searchGrounding) {
      tools.push({ googleSearch: {} });
      config = GenerationConfigBuilder.buildSearchGrounding();
    }
    if (input.features?.codeExecution) {
      tools.push({ codeExecution: {} });
      config = GenerationConfigBuilder.buildCodeExecution();
    }

    const { text } = await ai.generate({
      prompt: input.message,
      config: { ...config, tools }
    });

    return {
      response: text,
      hasCode: input.features?.codeExecution && text.includes('```'),
      searchUsed: input.features?.searchGrounding || false,
      processingTime: Date.now() - startTime
    };
  }
);
```

### TTS Flow Configuration

```typescript
// flows/ttsFlow.ts
export const TTSInputType = z.object({
  message: z.string(),
  voice: z.enum(['Zephyr', 'Alloy', 'Echo']).default('Zephyr'),
  userId: z.string().optional()
});

export const TTSOutputType = z.object({
  audioBuffer: z.instanceof(Buffer),
  originalText: z.string(),
  voice: z.string(),
  duration: z.number().optional()
});

export const ttsFlow = ai.defineFlow(
  {
    name: 'ttsFlow',
    inputSchema: TTSInputType,
    outputSchema: TTSOutputType
  },
  async (input) => {
    const genaiClient = new GoogleGenAI({ apiKey: botConfig.google.apiKey });
    
    const response = await genaiClient.models.generateContent({
      model: 'gemini-2.5-flash-preview-tts',
      contents: [{ parts: [{ text: input.message }] }],
      config: GenerationConfigBuilder.buildTTS(input.voice)
    });

    const audioData = response.candidates[0].content.parts[0].inlineData.data;
    const audioBuffer = Buffer.from(audioData, 'base64');

    return {
      audioBuffer,
      originalText: input.message,
      voice: input.voice
    };
  }
);
```

## Model Selection Configuration

### Dynamic Model Selection

```typescript
// utils/ModelSelector.ts
export class ModelSelector {
  static getModelForTask(task: string, complexity: 'simple' | 'moderate' | 'complex' = 'moderate') {
    const models = {
      chat: {
        simple: 'gemini-2.0-flash',
        moderate: 'gemini-2.0-flash',
        complex: 'gemini-2.5-flash'
      },
      code: {
        simple: 'gemini-2.0-flash',
        moderate: 'gemini-2.0-flash',
        complex: 'gemini-2.0-flash'
      },
      multimodal: {
        simple: 'gemini-2.0-flash',
        moderate: 'gemini-2.0-flash',
        complex: 'gemini-2.0-flash'
      },
      tts: {
        simple: 'gemini-2.5-flash-preview-tts',
        moderate: 'gemini-2.5-flash-preview-tts',
        complex: 'gemini-2.5-flash-preview-tts'
      }
    };

    return models[task]?.[complexity] || botConfig.google.model;
  }

  static getConfigForModel(model: string) {
    const configs = {
      'gemini-2.0-flash': {
        maxOutputTokens: 4096,
        temperature: 0.7
      },
      'gemini-2.5-flash': {
        maxOutputTokens: 8192,
        temperature: 0.7,
        thinkingConfig: {
          thinkingBudget: botConfig.thinking.budget,
          includeThoughts: true
        }
      },
      'gemini-2.5-flash-preview-tts': {
        maxOutputTokens: 2000,
        responseModalities: ['AUDIO']
      }
    };

    return configs[model] || {};
  }
}
```

## Logging Configuration

### Winston Logger Setup

```typescript
// utils/logger.ts
import winston from 'winston';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'simple';

export const logger = winston.createLogger({
  level: logLevel,
  format: logFormat === 'json' 
    ? winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
      )
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return `${timestamp} [${level}]: ${message} ${Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ''}`;
        })
      ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    })
  ]
});
```

## Development vs Production Configuration

### Environment-Specific Settings

```typescript
// config/environment.ts (extended)
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

export const botConfig: BotConfig = {
  // ... base config
  
  development: {
    enableDebugLogging: isDevelopment,
    verboseErrors: isDevelopment,
    mockResponses: process.env.MOCK_RESPONSES === 'true',
    testChannelId: process.env.TEST_CHANNEL_ID
  },
  
  production: {
    enableMetrics: isProduction,
    metricsPort: parseInt(process.env.METRICS_PORT || '3001'),
    healthCheckPath: '/health',
    gracefulShutdownTimeout: 10000
  },
  
  rateLimiting: {
    enabled: isProduction,
    windowMs: 60000, // 1 minute
    maxRequests: isDevelopment ? 100 : 30,
    skipSuccessfulRequests: false
  }
};
```

## Validation and Error Handling Configuration

### Input Validation Config

```typescript
// utils/validation.ts
export const VALIDATION_RULES = {
  message: {
    minLength: 1,
    maxLength: 4000,
    allowedPatterns: [/^[\s\S]*$/], // Allow all characters
    blockedPatterns: [
      /(?:https?:\/\/)?(?:www\.)?discord\.gg\/\w+/i, // Discord invite links
      /(?:https?:\/\/)?(?:www\.)?bit\.ly\/\w+/i       // Shortened URLs
    ]
  },
  file: {
    maxSize: botConfig.discord.maxFileSize,
    allowedTypes: [
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/quicktime', 'video/webm',
      'audio/mpeg', 'audio/wav', 'audio/ogg',
      'application/pdf', 'text/plain'
    ]
  },
  voice: {
    allowedVoices: ['Zephyr', 'Alloy', 'Echo'],
    maxTextLength: 2000
  }
};
```

## Best Practices Applied

### 1. Environment Variable Validation

```typescript
// config/validation.ts
export function validateEnvironment(): void {
  const required = [
    'DISCORD_TOKEN',
    'DISCORD_CLIENT_ID', 
    'GOOGLE_API_KEY'
  ];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }

  // Validate numeric values
  if (process.env.THINKING_BUDGET && isNaN(parseInt(process.env.THINKING_BUDGET))) {
    throw new Error('THINKING_BUDGET must be a number');
  }
}
```

### 2. Type-Safe Configuration

```typescript
// All configuration interfaces are strictly typed
// Environment variables are validated at startup
// Default values are provided for optional settings
// Configuration is immutable after initialization
```

### 3. Feature Toggle Pattern

```typescript
// Features can be enabled/disabled via environment variables
// Graceful degradation when features are disabled
// Runtime checking of feature availability
// Clear separation between development and production features
```

## Related Documentation

- [google-genai-client.md](./google-genai-client.md) - Client initialization patterns
- [generation-config.md](./generation-config.md) - Detailed configuration options
- [genkit-flows.md](./genkit-flows.md) - Flow configuration patterns
- [integration-patterns.md](./integration-patterns.md) - Discord integration configuration