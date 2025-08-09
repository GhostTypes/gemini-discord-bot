# Advanced Features Documentation

This document covers TTS, code execution, search grounding, URL context, and other advanced AI capabilities.

## Text-to-Speech (TTS)

### Basic TTS Generation

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
      },
      maxOutputTokens: 2000,
      temperature: 0.7
    }
  });

  const audioData = response.candidates[0].content.parts[0].inlineData.data;
  const audioBuffer = Buffer.from(audioData, 'base64');
  
  return {
    audioBuffer,
    originalText: input.message,
    voice: input.voice || 'Zephyr',
    format: 'mp3'
  };
}
```

### Available TTS Voices

```typescript
export const TTS_VOICES = {
  ZEPHYR: 'Zephyr',      // Default voice
  ALLOY: 'Alloy',        // Alternative voice option
  ECHO: 'Echo',          // Alternative voice option
  // Add more voices as they become available
};

export function validateTTSVoice(voice: string): boolean {
  return Object.values(TTS_VOICES).includes(voice);
}
```

### TTS with Text Fallback

```typescript
export async function generateTTSWithFallback(input: TTSInput): Promise<TTSOutput | TextOutput> {
  try {
    return await generateTTSResponse(input);
  } catch (error) {
    logger.warn('TTS generation failed, falling back to text', { error: error.message });
    
    // Fallback to text response
    const textResponse = await genaiClient.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: [{ parts: [{ text: input.message }] }],
      config: {
        maxOutputTokens: 2000,
        temperature: 0.7
      }
    });

    return {
      text: textResponse.candidates[0].content.parts[0].text,
      originalText: input.message,
      fallbackReason: 'TTS generation failed'
    };
  }
}
```

## Code Execution

### Basic Code Execution

```typescript
export async function executeCode(input: CodeExecutionInput): Promise<CodeExecutionOutput> {
  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: input.message }] }],
    config: {
      tools: [{ codeExecution: {} }],
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  });

  const parts = response.candidates[0].content.parts;
  let fullText = '';
  let executableCode = '';
  let executionResult = '';

  for (const part of parts) {
    if (part.text) {
      fullText += part.text;
    }
    
    if (part.executableCode?.code) {
      executableCode += part.executableCode.code;
    }
    
    if (part.codeExecutionResult?.output) {
      executionResult += part.codeExecutionResult.output;
    }
  }

  return {
    response: fullText.trim(),
    hasCode: !!executableCode,
    executableCode: executableCode.trim() || undefined,
    executionResult: executionResult.trim() || undefined,
    language: 'python' // Default language for code execution
  };
}
```

### Streaming Code Execution

```typescript
export async function streamCodeExecutionResponse(
  input: CodeExecutionInput,
  onChunk: (chunk: { type: string; content: string; language?: string }) => Promise<void>
): Promise<CodeExecutionOutput> {
  const stream = await genaiClient.models.generateContentStream({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: input.message }] }],
    config: {
      tools: [{ codeExecution: {} }],
      temperature: 0.1,
      maxOutputTokens: 8192
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
    executionResult: executionResult.trim() || undefined,
    language: 'python'
  };
}
```

## Search Grounding

### Basic Google Search Integration

```typescript
export async function generateSearchGroundedResponse(
  prompt: string
): Promise<SearchGroundedOutput> {
  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      maxOutputTokens: 1500
    }
  });

  return {
    response: response.candidates[0].content.parts[0].text,
    isGrounded: true,
    searchUsed: true,
    prompt
  };
}
```

### Streaming Search Grounded Response

```typescript
export async function streamSearchGroundedResponse(
  prompt: string,
  onChunk: (chunk: string) => Promise<void>
): Promise<string> {
  const stream = await genaiClient.models.generateContentStream({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.2,
      maxOutputTokens: 1500
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

## URL Context Processing

### URL Content Analysis

```typescript
export async function analyzeURLContent(
  url: string,
  analysisPrompt: string
): Promise<URLAnalysisOutput> {
  const prompt = `Please analyze the content at this URL: ${url}\n\nSpecific analysis requested: ${analysisPrompt}`;
  
  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.3,
      maxOutputTokens: 2048
    }
  });

  return {
    analysis: response.candidates[0].content.parts[0].text,
    url,
    analysisPrompt,
    processedAt: new Date().toISOString()
  };
}
```

### URL with File Processing

```typescript
export async function processURLWithContext(
  url: string,
  contextFile?: { path: string; description: string }
): Promise<URLContextOutput> {
  const parts = [
    { text: `Analyze the content at this URL: ${url}` }
  ];

  // Add file context if provided
  if (contextFile) {
    const fileBuffer = await fs.readFile(contextFile.path);
    const mimeType = detectMimeType(contextFile.path);
    
    parts.push(
      { text: `Additional context from file (${contextFile.description}):` },
      {
        inlineData: {
          mimeType,
          data: fileBuffer.toString('base64')
        }
      }
    );
  }

  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents: [{ role: 'user', parts }],
    config: {
      tools: [{ googleSearch: {} }],
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  });

  return {
    analysis: response.candidates[0].content.parts[0].text,
    url,
    hasFileContext: !!contextFile,
    contextFile: contextFile?.description,
    processedAt: new Date().toISOString()
  };
}
```

## Combined Advanced Features

### Multi-Modal Code Analysis

```typescript
export async function analyzeCodeWithImage(
  codeText: string,
  imagePath: string,
  analysisPrompt: string
): Promise<CodeImageAnalysisOutput> {
  const imageBuffer = await fs.readFile(imagePath);
  const mimeType = detectMimeType(imagePath);

  const contents = [{
    role: 'user',
    parts: [
      { text: `Code to analyze:\n\`\`\`\n${codeText}\n\`\`\`` },
      { text: 'Related image:' },
      {
        inlineData: {
          mimeType,
          data: imageBuffer.toString('base64')
        }
      },
      { text: `Analysis requested: ${analysisPrompt}` }
    ]
  }];

  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
    config: {
      tools: [{ codeExecution: {} }],
      temperature: 0.2,
      maxOutputTokens: 6144
    }
  });

  return {
    analysis: response.candidates[0].content.parts[0].text,
    codeLength: codeText.length,
    imagePath,
    analysisPrompt,
    processedAt: new Date().toISOString()
  };
}
```

### Search + TTS Pipeline

```typescript
export async function searchAndSpeak(
  query: string,
  voice: string = 'Zephyr'
): Promise<SearchTTSOutput> {
  // Step 1: Get search-grounded response
  const searchResponse = await generateSearchGroundedResponse(query);
  
  // Step 2: Convert to speech
  const ttsResponse = await generateTTSResponse({
    message: searchResponse.response,
    voice
  });

  return {
    textResponse: searchResponse.response,
    audioBuffer: ttsResponse.audioBuffer,
    voice,
    query,
    processedAt: new Date().toISOString()
  };
}
```

## Error Handling for Advanced Features

### TTS-Specific Error Handling

```typescript
export function handleTTSError(error: Error): Error {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('safety')) {
    return new Error('Content violates safety policies. Please try a different prompt.');
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
  
  return new Error(`TTS generation failed: ${error.message}`);
}
```

### Code Execution Error Handling

```typescript
export function handleCodeExecutionError(error: Error): Error {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('timeout')) {
    return new Error('Code execution timed out. Please try with simpler code.');
  }
  if (errorMessage.includes('memory')) {
    return new Error('Code execution exceeded memory limits.');
  }
  if (errorMessage.includes('security') || errorMessage.includes('blocked')) {
    return new Error('Code execution blocked for security reasons.');
  }
  
  return new Error(`Code execution failed: ${error.message}`);
}
```

## Configuration Patterns

### Feature-Specific Configurations

```typescript
export const ADVANCED_CONFIG = {
  TTS: {
    model: 'gemini-2.5-flash-preview-tts',
    maxTokens: 2000,
    temperature: 0.7,
    responseModalities: ['AUDIO']
  },
  CODE_EXECUTION: {
    model: 'gemini-2.0-flash',
    maxTokens: 8192,
    temperature: 0.1,
    tools: [{ codeExecution: {} }]
  },
  SEARCH_GROUNDING: {
    model: 'gemini-2.0-flash',
    maxTokens: 1500,
    temperature: 0.2,
    tools: [{ googleSearch: {} }]
  },
  URL_ANALYSIS: {
    model: 'gemini-2.0-flash',
    maxTokens: 2048,
    temperature: 0.3,
    tools: [{ googleSearch: {} }]
  }
};
```

## Best Practices

### 1. TTS Optimization
- Keep text under 2000 tokens for best results
- Use appropriate voice for content type
- Implement fallback to text for failures
- Cache audio responses when possible

### 2. Code Execution Safety
- Use low temperature (0.1) for deterministic results
- Implement timeouts for long-running code
- Validate code before execution when possible
- Log execution results for debugging

### 3. Search Grounding
- Use lower temperature (0.2) for factual accuracy
- Keep prompts focused and specific
- Limit token count to prevent rambling
- Combine with URL analysis for comprehensive results

### 4. Feature Combination
- Chain features logically (search → summarize → speak)
- Handle errors gracefully in multi-step processes
- Use appropriate configurations for each step
- Monitor resource usage in complex pipelines

## Related Documentation

- [google-genai-client.md](./google-genai-client.md) - Basic client setup
- [generation-config.md](./generation-config.md) - Configuration details for advanced features
- [streaming-patterns.md](./streaming-patterns.md) - Streaming advanced features
- [error-handling.md](./error-handling.md) - Error patterns for advanced features