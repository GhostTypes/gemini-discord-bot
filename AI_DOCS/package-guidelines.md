# Package Guidelines Documentation

This document provides guidelines on which packages to use, version compatibility, and deprecation notes for Google AI and Genkit libraries.

## Package Preference Hierarchy

### Primary Packages (Recommended)

#### 1. @google/genai (v1.11.0+)
- **Status**: ✅ **PREFERRED** - Modern Google AI SDK
- **Use for**: Direct AI model interactions, streaming responses
- **Key features**: 
  - Native TypeScript support
  - Modern async/await patterns
  - Built-in streaming capabilities
  - Comprehensive error handling
  - Full multimodal support

```bash
npm install @google/genai@^1.11.0
```

```typescript
import { GoogleGenAI, createPartFromUri } from '@google/genai';

const genaiClient = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
```

#### 2. genkit (v1.14.0+)
- **Status**: ✅ **PREFERRED** - AI flow orchestration framework
- **Use for**: Flow definitions, structured AI workflows
- **Key features**:
  - Type-safe flow definitions with Zod schemas
  - Built-in streaming support
  - Plugin architecture
  - Development tools and debugging

```bash
npm install genkit@^1.14.0
```

```typescript
import { genkit } from 'genkit';

const ai = genkit({
  plugins: [googleAI()],
  model: 'gemini-2.0-flash'
});
```

#### 3. @genkit-ai/googleai (v1.14.0+)
- **Status**: ✅ **PREFERRED** - Genkit's Google AI integration
- **Use for**: Genkit-specific Google AI provider
- **Key features**:
  - Seamless integration with Genkit framework
  - Pre-configured model definitions
  - Plugin-based architecture

```bash
npm install @genkit-ai/googleai@^1.14.0
```

```typescript
import { googleAI, gemini20Flash } from '@genkit-ai/googleai';
```

### Deprecated Packages (Avoid)

#### @google/generative-ai (DEPRECATED)
- **Status**: ❌ **DEPRECATED** - Legacy package
- **Replace with**: `@google/genai`
- **Why deprecated**: 
  - Outdated API patterns
  - Limited streaming support
  - Missing modern features
  - No longer maintained

```typescript
// ❌ OLD (Don't use)
import { GoogleGenerativeAI } from '@google/generative-ai';

// ✅ NEW (Use instead)
import { GoogleGenAI } from '@google/genai';
```

## Version Compatibility Matrix

### Current Stable Versions

| Package | Version | Status | Compatibility |
|---------|---------|--------|---------------|
| @google/genai | 1.11.0+ | ✅ Stable | Node.js 18+, TypeScript 4.9+ |
| genkit | 1.14.0+ | ✅ Stable | Node.js 18+, TypeScript 5.0+ |
| @genkit-ai/googleai | 1.14.0+ | ✅ Stable | Requires genkit ^1.14.0 |

### Version Constraints

```json
{
  "dependencies": {
    "@google/genai": "^1.11.0",
    "genkit": "^1.14.0",
    "@genkit-ai/googleai": "^1.14.0"
  },
  "engines": {
    "node": ">=18.0.0"
  }
}
```

## Migration Guide

### From @google/generative-ai to @google/genai

#### API Changes

```typescript
// ❌ OLD: @google/generative-ai
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

const result = await model.generateContentStream("Hello");
for await (const chunk of result.stream) {
  console.log(chunk.text());
}

// ✅ NEW: @google/genai
import { GoogleGenAI } from '@google/genai';

const genAI = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

const stream = await genAI.models.generateContentStream({
  model: 'gemini-2.0-flash',
  contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
});

for await (const chunk of stream) {
  if (chunk.candidates?.[0]?.content?.parts?.[0]?.text) {
    console.log(chunk.candidates[0].content.parts[0].text);
  }
}
```

#### Key Differences

1. **Client Initialization**:
   - Old: `new GoogleGenerativeAI(apiKey)`
   - New: `new GoogleGenAI({ apiKey })`

2. **Model Access**:
   - Old: `genAI.getGenerativeModel({ model: "name" })`
   - New: `genAI.models.generateContent({ model: 'name', ... })`

3. **Streaming**:
   - Old: `result.stream` with `.text()` method
   - New: Direct iteration with property access

4. **Configuration**:
   - Old: Passed to `generateContent()` method
   - New: Passed in `config` object

### Migration Checklist

- [ ] Replace package imports
- [ ] Update client initialization
- [ ] Modify streaming patterns
- [ ] Update configuration objects
- [ ] Test all functionality
- [ ] Update type definitions

## Model Availability

### Recommended Models by Use Case

```typescript
export const RECOMMENDED_MODELS = {
  // General chat and multimodal
  CHAT: 'gemini-2.0-flash',
  MULTIMODAL: 'gemini-2.0-flash',
  
  // Complex reasoning tasks
  THINKING: 'gemini-2.5-flash',
  ANALYSIS: 'gemini-2.5-flash',
  
  // Text-to-speech
  TTS: 'gemini-2.5-flash-preview-tts',
  
  // Code execution
  CODE: 'gemini-2.0-flash', // Use with codeExecution tool
  
  // Image generation (via @genkit-ai/googleai)
  IMAGE_GEN: 'imagen2'
} as const;
```

### Model Capabilities Matrix

| Model | Text | Multimodal | Thinking | TTS | Code Exec | Max Tokens |
|-------|------|------------|----------|-----|-----------|------------|
| gemini-2.0-flash | ✅ | ✅ | ❌ | ❌ | ✅ | 4096 |
| gemini-2.5-flash | ✅ | ✅ | ✅ | ❌ | ✅ | 8192 |
| gemini-2.5-flash-preview-tts | ✅ | ❌ | ❌ | ✅ | ❌ | 2000 |
| imagen2 | ❌ | ❌ | ❌ | ❌ | ❌ | N/A |

## Installation Best Practices

### Package Manager Recommendations

#### npm (Recommended)
```bash
# Install core packages
npm install @google/genai genkit @genkit-ai/googleai

# Install type definitions if needed
npm install --save-dev @types/node typescript
```

#### yarn
```bash
# Install core packages
yarn add @google/genai genkit @genkit-ai/googleai

# Install dev dependencies
yarn add --dev @types/node typescript
```

#### pnpm
```bash
# Install core packages
pnpm add @google/genai genkit @genkit-ai/googleai

# Install dev dependencies
pnpm add -D @types/node typescript
```

### Lock File Management

Always commit lock files to ensure consistent installations:
- `package-lock.json` (npm)
- `yarn.lock` (yarn)
- `pnpm-lock.yaml` (pnpm)

### Security Considerations

#### Regular Updates
```bash
# Check for updates
npm outdated

# Update packages (be cautious with major versions)
npm update

# Audit for vulnerabilities
npm audit
npm audit fix
```

#### Version Pinning Strategy
```json
{
  "dependencies": {
    // Pin major versions, allow minor/patch updates
    "@google/genai": "^1.11.0",
    "genkit": "^1.14.0",
    
    // Pin exact versions for critical packages if needed
    "@genkit-ai/googleai": "1.14.0"
  }
}
```

## Environment Requirements

### Node.js Version Support

| Package | Min Node.js | Recommended | Notes |
|---------|-------------|-------------|--------|
| @google/genai | 18.0.0 | 20.0.0+ | ESM support required |
| genkit | 18.0.0 | 20.0.0+ | TypeScript 5.0+ recommended |
| @genkit-ai/googleai | 18.0.0 | 20.0.0+ | Follows genkit requirements |

### TypeScript Configuration

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "ts-node": {
    "esm": true
  }
}
```

### ESM vs CommonJS

All recommended packages support ESM (ECMAScript Modules):

```typescript
// ✅ ESM (Recommended)
import { GoogleGenAI } from '@google/genai';
import { genkit } from 'genkit';

// ❌ CommonJS (Not recommended for new projects)
const { GoogleGenAI } = require('@google/genai');
```

## Development Tools Integration

### IDE Support

#### VS Code Extensions
- **TypeScript Importer** - Auto-import management
- **Error Lens** - Inline error display
- **ESLint** - Code quality
- **Prettier** - Code formatting

#### Type Definitions
All recommended packages include built-in TypeScript definitions:

```typescript
// Type definitions are automatically available
import { GenerationConfig, GoogleGenAI } from '@google/genai';

const config: GenerationConfig = {
  temperature: 0.7,
  maxOutputTokens: 4096
};
```

### Testing Framework Compatibility

```typescript
// Jest configuration for ESM
// jest.config.js
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true
    }]
  }
};
```

## Performance Considerations

### Bundle Size Impact

| Package | Minified Size | Gzipped | Notes |
|---------|---------------|---------|--------|
| @google/genai | ~45KB | ~12KB | Lightweight, tree-shakeable |
| genkit | ~120KB | ~30KB | Framework overhead |
| @genkit-ai/googleai | ~25KB | ~8KB | Plugin-specific code |

### Tree Shaking

```typescript
// ✅ Import only what you need
import { GoogleGenAI } from '@google/genai';
import { genkit } from 'genkit';

// ❌ Avoid namespace imports if possible
import * as GenAI from '@google/genai';
```

## Troubleshooting Common Issues

### Installation Problems

#### Node.js Version Mismatch
```bash
# Check Node.js version
node --version

# Update Node.js if needed (using nvm)
nvm install 20
nvm use 20
```

#### Module Resolution Issues
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Runtime Errors

#### ESM Import Errors
Ensure your `package.json` includes:
```json
{
  "type": "module"
}
```

#### TypeScript Configuration Issues
```bash
# Check TypeScript configuration
npx tsc --showConfig

# Validate compilation
npx tsc --noEmit
```

## Best Practices Summary

### 1. Package Selection
- ✅ Use `@google/genai` for direct AI interactions
- ✅ Use `genkit` for structured AI workflows
- ✅ Use `@genkit-ai/googleai` for Genkit integration
- ❌ Avoid `@google/generative-ai` (deprecated)

### 2. Version Management
- Pin major versions, allow minor updates
- Keep dependencies up to date
- Regularly audit for security vulnerabilities
- Test upgrades in development first

### 3. Environment Setup
- Use Node.js 20+ for best performance
- Enable ESM for modern module support
- Configure TypeScript strict mode
- Use proper IDE extensions

### 4. Performance
- Import only needed modules
- Enable tree shaking
- Monitor bundle sizes
- Use appropriate models for tasks

## Related Documentation

- [google-genai-client.md](./google-genai-client.md) - Client usage patterns
- [genkit-flows.md](./genkit-flows.md) - Framework usage
- [configuration-examples.md](./configuration-examples.md) - Your actual package usage
- [error-handling.md](./error-handling.md) - Package-specific error handling