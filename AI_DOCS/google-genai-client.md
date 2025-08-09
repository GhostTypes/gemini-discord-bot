# GoogleGenAI Client Documentation

This document covers the core `@google/genai` SDK client initialization and basic usage patterns.

## Core Classes and Initialization

### GoogleGenAI Client

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

// Environment-based initialization (recommended)
const genaiClient = new GoogleGenAI(); // Uses GOOGLE_API_KEY env var
```

### GoogleGenAIOptions Interface

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

## Content Generation Methods

### generateContent - Basic Generation

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

### generateContentStream - Streaming Generation

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

## Content Input Patterns

### Text Content

```typescript
const contents = [{
  role: 'user',
  parts: [{ text: 'Your message here' }]
}];
```

### Multimodal Content

```typescript
import { createPartFromUri } from '@google/genai';

// Image from URL
const contents = [{
  role: 'user',
  parts: [
    { text: 'Describe this image' },
    await createPartFromUri('https://example.com/image.jpg', 'image/jpeg')
  ]
}];

// Local file as base64
const contents = [{
  role: 'user',
  parts: [
    { text: 'Analyze this video' },
    {
      inlineData: {
        mimeType: 'video/mp4',
        data: videoBuffer.toString('base64')
      }
    }
  ]
}];
```

## Environment Variables

```bash
# Required for Google AI API
GOOGLE_API_KEY=your_api_key_here

# Optional for Vertex AI
GCLOUD_PROJECT=your-project-id
GCLOUD_LOCATION=us-central1
GCLOUD_SERVICE_ACCOUNT_CREDS=path/to/credentials.json
```

## Best Practices

### 1. Client Initialization
- Always use environment variables for API keys
- Initialize client once and reuse across your application
- Use Vertex AI for production workloads when possible

### 2. Error Handling
- Wrap all API calls in try-catch blocks
- Check for specific error types (safety, quota, timeout)
- See [error-handling.md](./error-handling.md) for detailed error patterns

### 3. Model Selection
- Use `gemini-2.0-flash` for general chat and multimodal tasks
- Use `gemini-2.5-flash` for complex reasoning with thinking
- Use `gemini-2.5-flash-preview-tts` for text-to-speech

## Related Documentation

- [generation-config.md](./generation-config.md) - Detailed configuration options
- [streaming-patterns.md](./streaming-patterns.md) - Streaming implementation patterns
- [multimodal-features.md](./multimodal-features.md) - Image, video, audio processing
- [error-handling.md](./error-handling.md) - Error handling patterns