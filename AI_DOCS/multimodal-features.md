# Multimodal Features Documentation

This document covers image, video, audio processing, MIME types, and file handling patterns.

## Image Processing

### Image from URL

```typescript
import { createPartFromUri } from '@google/genai';

const contents = [{
  role: 'user',
  parts: [
    { text: 'Describe this image' },
    await createPartFromUri('https://example.com/image.jpg', 'image/jpeg')
  ]
}];

const response = await genaiClient.models.generateContent({
  model: 'gemini-2.0-flash',
  contents,
  config: {
    temperature: 0.7,
    maxOutputTokens: 2048
  }
});
```

### Image from Local File

```typescript
import fs from 'fs/promises';

const imageBuffer = await fs.readFile('/path/to/image.jpg');
const contents = [{
  role: 'user',
  parts: [
    { text: 'Analyze this image' },
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: imageBuffer.toString('base64')
      }
    }
  ]
}];
```

### Discord Attachment Processing

```typescript
async function processDiscordImage(attachment: Attachment) {
  if (!attachment.contentType?.startsWith('image/')) {
    throw new Error('Invalid image format');
  }

  // Validate file size (e.g., 10MB limit)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (attachment.size > MAX_SIZE) {
    throw new Error(`Image too large: ${attachment.size} bytes (max: ${MAX_SIZE})`);
  }

  const contents = [{
    role: 'user',
    parts: [
      { text: 'What do you see in this image?' },
      await createPartFromUri(attachment.url, attachment.contentType)
    ]
  }];

  return contents;
}
```

## Video Processing

### Video from Local File

```typescript
const videoBuffer = await fs.readFile('/path/to/video.mp4');
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

### Video Processing Flow

```typescript
export async function processVideoFile(
  videoPath: string,
  prompt: string
): Promise<VideoAnalysisResult> {
  const videoBuffer = await fs.readFile(videoPath);
  const stats = await fs.stat(videoPath);
  
  // Validate video size and duration
  const MAX_SIZE = 100 * 1024 * 1024; // 100MB
  if (stats.size > MAX_SIZE) {
    throw new Error(`Video file too large: ${stats.size} bytes (max: ${MAX_SIZE})`);
  }

  const contents = [{
    role: 'user',
    parts: [
      { text: prompt },
      {
        inlineData: {
          mimeType: 'video/mp4',
          data: videoBuffer.toString('base64')
        }
      }
    ]
  }];

  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
    config: {
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  });

  return {
    analysis: response.candidates[0].content.parts[0].text,
    videoSize: stats.size,
    processedAt: new Date().toISOString()
  };
}
```

### Video Streaming Analysis

```typescript
export async function streamVideoAnalysis(
  videoInput: VideoInput,
  onChunk: (chunk: { type: string; content: string }) => Promise<void>
): Promise<VideoAnalysisOutput> {
  const videoBuffer = await fs.readFile(videoInput.filePath);

  const stream = await genaiClient.models.generateContentStream({
    model: 'gemini-2.0-flash',
    contents: [{
      role: 'user',
      parts: [
        { text: videoInput.prompt },
        {
          inlineData: {
            mimeType: videoInput.mimeType,
            data: videoBuffer.toString('base64')
          }
        }
      ]
    }],
    config: {
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  });

  let fullAnalysis = '';
  
  for await (const chunk of stream) {
    if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
      const chunkText = chunk.candidates[0].content.parts[0].text;
      fullAnalysis += chunkText;
      await onChunk({ type: 'analysis', content: chunkText });
    }
  }

  return {
    analysis: fullAnalysis,
    videoMetadata: {
      filePath: videoInput.filePath,
      mimeType: videoInput.mimeType,
      size: videoBuffer.length
    }
  };
}
```

## Audio Processing

### Audio Input Processing

```typescript
const audioBuffer = await fs.readFile('/path/to/audio.mp3');
const contents = [{
  role: 'user',
  parts: [
    { text: 'Transcribe this audio' },
    {
      inlineData: {
        mimeType: 'audio/mp3',
        data: audioBuffer.toString('base64')
      }
    }
  ]
}];
```

### Text-to-Speech (TTS) Generation

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

## MIME Type Reference

### Supported Image Formats

```typescript
const SUPPORTED_IMAGE_TYPES = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
  'image/bmp': ['.bmp'],
  'image/tiff': ['.tiff', '.tif']
};
```

### Supported Video Formats

```typescript
const SUPPORTED_VIDEO_TYPES = {
  'video/mp4': ['.mp4'],
  'video/quicktime': ['.mov'],
  'video/x-msvideo': ['.avi'],
  'video/webm': ['.webm'],
  'video/x-ms-wmv': ['.wmv']
};
```

### Supported Audio Formats

```typescript
const SUPPORTED_AUDIO_TYPES = {
  'audio/mpeg': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/ogg': ['.ogg'],
  'audio/x-m4a': ['.m4a'],
  'audio/flac': ['.flac']
};
```

## File Validation Utilities

### MIME Type Detection

```typescript
import { lookup } from 'mime-types';

export function detectMimeType(filePath: string): string {
  const mimeType = lookup(filePath);
  if (!mimeType) {
    throw new Error(`Cannot determine MIME type for file: ${filePath}`);
  }
  return mimeType;
}

export function validateImageType(mimeType: string): boolean {
  return Object.keys(SUPPORTED_IMAGE_TYPES).includes(mimeType);
}

export function validateVideoType(mimeType: string): boolean {
  return Object.keys(SUPPORTED_VIDEO_TYPES).includes(mimeType);
}
```

### File Size Validation

```typescript
export interface FileSizeLimits {
  image: number;    // 10MB
  video: number;    // 100MB
  audio: number;    // 50MB
}

export const DEFAULT_LIMITS: FileSizeLimits = {
  image: 10 * 1024 * 1024,   // 10MB
  video: 100 * 1024 * 1024,  // 100MB
  audio: 50 * 1024 * 1024    // 50MB
};

export function validateFileSize(
  filePath: string,
  mimeType: string,
  limits: FileSizeLimits = DEFAULT_LIMITS
): Promise<void> {
  return fs.stat(filePath).then(stats => {
    let maxSize: number;
    
    if (mimeType.startsWith('image/')) {
      maxSize = limits.image;
    } else if (mimeType.startsWith('video/')) {
      maxSize = limits.video;
    } else if (mimeType.startsWith('audio/')) {
      maxSize = limits.audio;
    } else {
      throw new Error(`Unsupported file type: ${mimeType}`);
    }

    if (stats.size > maxSize) {
      throw new Error(`File too large: ${stats.size} bytes (max: ${maxSize})`);
    }
  });
}
```

## PDF and Document Processing

### PDF Processing

```typescript
const pdfBuffer = await fs.readFile('/path/to/document.pdf');
const contents = [{
  role: 'user',
  parts: [
    { text: 'Summarize this PDF document' },
    {
      inlineData: {
        mimeType: 'application/pdf',
        data: pdfBuffer.toString('base64')
      }
    }
  ]
}];
```

### Document Processing Flow

```typescript
export async function processDocument(
  documentPath: string,
  prompt: string
): Promise<DocumentAnalysisResult> {
  const documentBuffer = await fs.readFile(documentPath);
  const mimeType = detectMimeType(documentPath);
  
  if (!['application/pdf', 'text/plain', 'text/csv'].includes(mimeType)) {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }

  const contents = [{
    role: 'user',
    parts: [
      { text: prompt },
      {
        inlineData: {
          mimeType,
          data: documentBuffer.toString('base64')
        }
      }
    ]
  }];

  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
    config: {
      temperature: 0.3,
      maxOutputTokens: 8192
    }
  });

  return {
    analysis: response.candidates[0].content.parts[0].text,
    documentType: mimeType,
    documentSize: documentBuffer.length,
    processedAt: new Date().toISOString()
  };
}
```

## Advanced Multimodal Patterns

### Multi-File Processing

```typescript
export async function processMultipleFiles(
  files: Array<{ path: string; description: string }>,
  overallPrompt: string
): Promise<MultiFileAnalysisResult> {
  const fileParts = await Promise.all(
    files.map(async (file) => {
      const buffer = await fs.readFile(file.path);
      const mimeType = detectMimeType(file.path);
      
      return [
        { text: file.description },
        {
          inlineData: {
            mimeType,
            data: buffer.toString('base64')
          }
        }
      ];
    })
  );

  const contents = [{
    role: 'user',
    parts: [
      { text: overallPrompt },
      ...fileParts.flat()
    ]
  }];

  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
    config: {
      temperature: 0.3,
      maxOutputTokens: 8192
    }
  });

  return {
    analysis: response.candidates[0].content.parts[0].text,
    filesProcessed: files.length,
    processedAt: new Date().toISOString()
  };
}
```

### Comparative Analysis

```typescript
export async function compareImages(
  image1Path: string,
  image2Path: string,
  comparisonPrompt: string
): Promise<ComparisonResult> {
  const [image1Buffer, image2Buffer] = await Promise.all([
    fs.readFile(image1Path),
    fs.readFile(image2Path)
  ]);

  const contents = [{
    role: 'user',
    parts: [
      { text: comparisonPrompt },
      { text: 'First image:' },
      {
        inlineData: {
          mimeType: detectMimeType(image1Path),
          data: image1Buffer.toString('base64')
        }
      },
      { text: 'Second image:' },
      {
        inlineData: {
          mimeType: detectMimeType(image2Path), 
          data: image2Buffer.toString('base64')
        }
      }
    ]
  }];

  const response = await genaiClient.models.generateContent({
    model: 'gemini-2.0-flash',
    contents,
    config: {
      temperature: 0.3,
      maxOutputTokens: 4096
    }
  });

  return {
    comparison: response.candidates[0].content.parts[0].text,
    image1Path,
    image2Path,
    processedAt: new Date().toISOString()
  };
}
```

## Error Handling for Multimodal

### File Processing Errors

```typescript
export function handleMultimodalError(error: Error, context: { filePath?: string; mimeType?: string }) {
  const errorMessage = error.message.toLowerCase();
  
  if (errorMessage.includes('file too large') || errorMessage.includes('size')) {
    throw new Error(`File too large. Please use a smaller ${context.mimeType?.split('/')[0] || 'file'}.`);
  }
  
  if (errorMessage.includes('unsupported') || errorMessage.includes('format')) {
    throw new Error(`Unsupported file format: ${context.mimeType || 'unknown'}. Please use a supported format.`);
  }
  
  if (errorMessage.includes('safety') || errorMessage.includes('blocked')) {
    throw new Error('Content violates safety policies. Please try with different content.');
  }
  
  if (errorMessage.includes('quota') || errorMessage.includes('resource_exhausted')) {
    throw new Error('Service quota exceeded. Please try again later.');
  }
  
  throw new Error(`File processing failed: ${error.message}`);
}
```

## Best Practices

### 1. File Validation
- Always validate MIME types before processing
- Implement reasonable file size limits
- Check file existence and readability
- Validate file integrity when possible

### 2. Memory Management
- Stream large files when possible
- Clean up temporary files
- Use appropriate buffer sizes
- Monitor memory usage for large operations

### 3. Error Handling
- Provide specific error messages for different failure types
- Implement retry logic for transient failures
- Log file processing metrics for monitoring
- Handle network failures for remote files

### 4. Performance Optimization
- Process multiple files in parallel when appropriate
- Cache processed results when possible
- Use appropriate model configurations for different content types
- Optimize image/video quality vs processing time

## Related Documentation

- [google-genai-client.md](./google-genai-client.md) - Basic client setup for multimodal
- [streaming-patterns.md](./streaming-patterns.md) - Streaming multimodal responses
- [error-handling.md](./error-handling.md) - Error patterns for file processing
- [advanced-features.md](./advanced-features.md) - TTS and other advanced multimodal features