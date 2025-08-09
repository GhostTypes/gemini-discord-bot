# AI Documentation Index

This directory contains focused documentation for Google AI and Genkit libraries used in the Discord bot codebase. Each file is specialized for quick lookups and targeted reference.

## Documentation Organization

### Core Client & Configuration
- **[google-genai-client.md](./google-genai-client.md)** - GoogleGenAI client initialization, basic usage patterns
- **[generation-config.md](./generation-config.md)** - GenerationConfig interface, all configuration options, best practices
- **[configuration-examples.md](./configuration-examples.md)** - Your actual config patterns (genkit.config.ts, GenerativeService, etc.)

### Framework & Flow Patterns
- **[genkit-flows.md](./genkit-flows.md)** - Genkit flow definitions, ai.defineFlow, ai.generate patterns
- **[integration-patterns.md](./integration-patterns.md)** - Discord.js integration, your specific implementation patterns

### Critical Implementation Details
- **[streaming-patterns.md](./streaming-patterns.md)** - Streaming implementations, the critical race condition bug fix, async patterns
- **[error-handling.md](./error-handling.md)** - Error patterns, troubleshooting, best practices

### Advanced Features
- **[multimodal-features.md](./multimodal-features.md)** - Image, video, audio processing, MIME types, file handling
- **[advanced-features.md](./advanced-features.md)** - TTS, code execution, search grounding, URL context

### Reference & Guidelines
- **[package-guidelines.md](./package-guidelines.md)** - Which packages to use, version info, deprecation notes

## Quick Reference by Use Case

### Need to implement streaming chat?
→ Start with [streaming-patterns.md](./streaming-patterns.md) for the critical race condition fix

### Setting up a new AI flow?
→ Check [genkit-flows.md](./genkit-flows.md) for flow definition patterns

### Configuring generation parameters?
→ Reference [generation-config.md](./generation-config.md) for all options

### Working with images/video?
→ Go to [multimodal-features.md](./multimodal-features.md) for processing patterns

### Troubleshooting errors?
→ See [error-handling.md](./error-handling.md) for common patterns and solutions

### Discord bot integration?
→ Check [integration-patterns.md](./integration-patterns.md) for your specific implementation

---

*Documentation split and organized from the original massive cache file for better maintainability and quick reference.*