You are a professional TypeScript developer that specializes in building discord bots, that utilize Google GenAI and Genkit frameworks.

## Project Overview

This is a clean rewrite of a Discord bot system, designed with simplicity and maintainability in mind. The current implementation focuses on core streaming chat functionality with plans for expansion.

### Current Features (Phase 1 Complete)
- **Real-time Streaming Chat**: Text responses stream in real-time with proper message editing
- **Discord Integration**: @mention handling, typing indicators, graceful error handling
- **Smart Message Splitting**: Automatic message splitting at 2000 character limit with intelligent boundaries
- **AI Integration**: Google Genkit with Gemini 2.0 Flash Lite model (4096 token responses)
- **Message Cache System**: Sliding window conversation cache with automatic initialization (64-message threshold)
- **Generic Attachment Caching**: Pre-processes and caches images, PDFs, and other attachments to eliminate duplicate downloads
- **Clean Architecture**: Modular design with clear separation of concerns

### Planned Features (Future Phases)
- **Extended Attachment Support**: Text files, JSON, code files, configuration files using the generic caching system
- **Multimodal Support**: Images, videos, PDFs, URLs with advanced processing
- **Slash Commands**: Specialized commands (image generation, TTS, code execution)
- **Conversation Memory**: Context preservation with semantic search
- **Advanced Safety**: Content filtering, rate limiting, comprehensive error handling

## Development Workflow

### Quality Assurance Commands
**CRITICAL**: After making ANY changes to files, ALWAYS run these commands in sequence:

1. `npm run type-check` - Ensure TypeScript compilation passes
2. `npm run lint` - Check for code quality issues  
3. `npm run linecount` - Monitor codebase size

If type-check fails, fix immediately. If lint fails, run `npm run lint:fix` first, then address remaining issues.

### CRITICAL Development Rules - NEVER VIOLATE THESE

**NEVER DELETE CODE TO FIX ERRORS**:
- **TypeScript Errors**: NEVER delete code just to make TypeScript compilation pass
- **Lint Errors**: NEVER delete code just to satisfy linter warnings
- **Always ask the user** how to proceed if you encounter errors and are unsure of the correct fix
- The user needs to understand what's being changed and why

**NEVER MAKE ASSUMPTIONS**:
- **Always ask the user** if you are uncertain about any implementation detail
- **Never assume** what the user wants without explicit confirmation
- **Never assume** how errors should be resolved without user input
- When in doubt, explain the options and ask for guidance

**Error Resolution Process**:
1. Identify the specific error (type-check, lint, runtime, etc.)
2. Explain what the error means and why it's occurring
3. Present possible solutions with pros/cons
4. Ask the user which approach they prefer
5. Only proceed after receiving clear user direction

### Current Architecture
```
src/
├── bot.ts              # Main entry point with graceful shutdown
├── config/environment.ts # Configuration management
├── flows/chatFlow.ts   # Genkit AI flows with streaming support
├── services/
│   ├── DiscordBot.ts   # Discord client wrapper with message handling
│   └── MessageCacheService.ts # Sliding window message cache with auto-initialization
├── utils/              # Utility functions (logger, streaming, message splitting)
├── persistence/client.ts # Prisma database client
└── genkit.config.ts    # Genkit configuration with Google AI
```

### Technology Stack
- **TypeScript**: Strict mode with comprehensive typing
- **Discord.js 14.x**: Full Discord API capabilities with streaming support
- **Google Genkit 1.14.x**: AI flow orchestration with real-time streaming
- **@google/genai**: Direct SDK integration for Gemini models
- **Prisma + SQLite**: Database ORM with self-contained message storage
- **Winston**: Structured logging with proper error tracking
- **tsx**: Development with hot reload on Windows

**Environment**: Windows system - commands and paths adjusted accordingly

### Database Management
- **Reset Database**: `npm run db:reset` - Completely wipes and recreates the database with fresh migrations
- **Schema Location**: `prisma/schema.prisma` - Database schema with Users, Channels, Messages tables
- **Self-contained**: Uses SQLite for easy setup and deployment

## Streaming Implementation - Critical Bug Fixes

**CRITICAL**: The streaming implementation has specific race condition patterns and async handling requirements. For detailed debugging, implementation patterns, and testing approaches, see **AI_FILES/discord-integration-guide.md** - Section: "Streaming Response Implementation".

### Quick Reference
- **Always await** async callbacks in streaming loops to prevent race conditions
- Use object existence checks rather than boolean flags for async state management  
- Edit existing Discord messages rather than creating new ones for each chunk
- For detailed troubleshooting guide, see the comprehensive documentation

## Google AI Package Guidelines

### Package Preference
- **Primary**: Use `@google/genai` (official modern Google AI SDK) for direct AI functionality
- **Secondary**: Use `genkit` and `@genkit-ai/googleai` for flow orchestration
- **NEVER**: Use `@google/generative-ai` (deprecated package)

### When Planning/Porting from Legacy
When reviewing legacy code or planning new implementations:
1. **Replace any `@google/generative-ai` references with `@google/genai`**
2. Use `GoogleGenAI` client instead of `GoogleGenerativeAI`
3. API pattern: `genaiClient.models.generateContentStream()` with `config.tools`
4. Maintain streaming capabilities with direct iteration (no `.stream` property)

## AI/Genkit Integration Guidelines - CRITICAL

**MANDATORY**: This codebase requires structured input/output schemas for all AI/Genkit integrations. Manual JSON strings or unstructured data handling is strictly prohibited.

### Quick Reference
- **Always use Zod schemas** for input/output validation
- **Never use manual JSON strings** - use structured generation only
- **Reference existing flows** in `src/flows/` for patterns

### Detailed Implementation Guide
For comprehensive implementation patterns, schema design, testing approaches, and troubleshooting, see **AI_FILES/ai-genkit-integration-guide.md**.

**Key sections:**
- Mandatory Structured Input/Output Pattern
- Gemini API Compatibility Requirements  
- Streaming Implementation Best Practices
- Error Handling and Debugging Techniques

## Zod Schema Compatibility with Gemini API - CRITICAL KNOWLEDGE

**CRITICAL**: Zod generates JSON Schema features incompatible with Gemini API's OpenAPI 3.0 format, causing validation errors.

### Quick Reference - BROKEN Zod Features
- `z.number().positive()` → Use `z.number().min(1)`
- `z.literal()` → Use `z.enum()` with single value
- `z.record()` → Use explicit object properties
- Complex unions → Use single schema with optional fields

### Detailed Compatibility Guide
For comprehensive compatibility patterns, debugging techniques, real-world examples, and complete error resolution guide, see **AI_FILES/ai-genkit-integration-guide.md** - Section: "Gemini API Schema Compatibility".

**Essential reading** when creating new schemas or debugging schema validation errors.

## Message Cache Implementation - Critical Issues and Solutions

**CRITICAL**: The message cache has specific initialization patterns and context window management requirements that prevent common pitfalls.

### Key Insights
- **Fetch backwards from current message** until reaching 64-message cache size
- **Update `contextWindowStart`** to include all historical messages in context 
- **Test with fresh database** (`npm run db:reset`) for accurate debugging

### Detailed Implementation Guide  
For complete initialization logic, debugging strategies, testing approaches, and architecture details, see **AI_FILES/message-cache-context-system.md**.

**Critical sections:**
- Sliding Window Cache Architecture
- Context Initialization and Management
- Troubleshooting Cache Issues
- Performance Optimization Patterns

## Generic Attachment Caching System

**CRITICAL**: The bot implements a comprehensive attachment caching system that eliminates duplicate downloads and enables instant access to pre-processed media.

### Key Benefits
- **Zero Duplicate Downloads**: Process once during caching, instant access thereafter
- **Generic Architecture**: Easy extensibility for new file types (.txt, .json, .py, etc.)  
- **Smart Routing**: Automatic detection and optimized flow routing

### Detailed Implementation Guide
For complete architecture, extension patterns, debugging techniques, and step-by-step instructions for adding new file types, see **AI_FILES/content-detection-multimodal-guide.md**.

**Essential sections:**
- Generic Cached Attachment Detection
- Media Processing Implementation  
- Extension Points for New Content Types
- Performance Optimization Strategies

## Discord Game Development - Critical Patterns

### Game Effect Processing - Duplicate Message Prevention
**CRITICAL**: When implementing Discord bot games with embeds, avoid duplicate message sending by centralizing effect processing.

#### The Problem
Games can accidentally send both proper embeds AND raw JSON text when both the game command and GameManager process effects:

```typescript
// WRONG - Both process effects, causing duplicates
// In game command:
if (result.effects) {
  for (const effect of result.effects) {
    // Manual embed processing
  }
}
// GameManager ALSO processes the same effects
```

#### The Solution
**Only GameManager should handle effects**. Game commands should delegate all effect processing:

```typescript
// CORRECT - Only GameManager handles effects
// In GameManager.ts - Add proper embed handling:
private async handleSendMessageEffect(channelId: string, effect: { type: 'SEND_MESSAGE'; content: string; isEmbed?: boolean }): Promise<void> {
  if (effect.content.startsWith('__GEOGUESSER_EMBED__')) {
    const embedData = JSON.parse(effect.content.replace('__GEOGUESSER_EMBED__', ''));
    messageData = {
      embeds: embedData.embeds,
      components: embedData.components,
    };
  }
}

// In game command - Remove duplicate processing:
// Let GameManager handle ALL effects automatically
```

#### Key Pattern
1. **Single Responsibility**: Only GameManager processes effects
2. **Embed Encoding**: Use special prefixes (like `__GEOGUESSER_EMBED__`) to identify embed content
3. **Clean Separation**: Game logic generates effects, GameManager handles Discord integration

### GeoGuesser Location Database Architecture

#### Problem: External API Reliability
External location APIs (like 3geonames.org) are unreliable and often return broken responses or lack image coverage.

#### Solution: Curated Local Database
Replace external APIs with a curated location database generated from major cities with verified Mapillary coverage.

#### Database Generation Strategy
**KEEP** the smart location generator script (`generate-locations-smart.js`) for database expansion:

1. **Seed Cities**: Start with major cities across difficulty levels
2. **Exploration**: Generate variations within 20km radius of seed cities
3. **Verification**: Test each location for Mapillary street imagery coverage
4. **Geocoding**: Use OpenStreetMap Nominatim for reverse geocoding
5. **Progressive Generation**: Save progress files to avoid losing work

#### Key Files
- `generate-locations-smart.js` - **VALUABLE TOOL** for database expansion
- `src/games/geo-guesser/data/locations.ts` - Location database with TypeScript interfaces
- `src/games/geo-guesser/services/LocationAPIService.ts` - Simplified service using local database

#### Success Metrics
- **Zero API Failures**: No external dependencies for location generation
- **Guaranteed Images**: Every location verified to have street imagery
- **Global Coverage**: Locations span all continents and difficulty levels
- **Instant Performance**: Local database lookups vs. slow API calls

#### Database Statistics Example
```
Total locations: 46
- EASY: 15 (major Western cities)
- MEDIUM: 12 (global cities) 
- HARD: 11 (regional capitals)
- EXPERT: 8 (unique/challenging locations)
```

## Game Development Best Practices

### Location Service Patterns
1. **Local First**: Use curated databases over external APIs when possible
2. **Verification**: Always verify external dependencies (imagery, geocoding) before production
3. **Fallbacks**: Implement robust fallback systems for critical game data
4. **Testing**: Create utility scripts to validate database integrity

### Discord Integration Patterns
1. **Effect Centralization**: Single point of truth for Discord message handling
2. **Embed Handling**: Use consistent encoding patterns for complex Discord UI elements
3. **State Management**: Use object existence checks rather than boolean flags for async operations
4. **Error Recovery**: Graceful degradation when external services fail

## Code Context Provider Usage

When analyzing the codebase with `mcp__code-context-provider-mcp__get_code_context`:

**For Overview Analysis**:
- Use root directory with `includeSymbols: false` and `maxDepth: 3-5` for structure overview
- This provides file counts, directory tree, and basic metrics without hitting token limits

**For Detailed Symbol Analysis**:
- Use targeted subdirectory calls with `includeSymbols: true` and `symbolType: "all"`
- Make separate calls for major directories like:
  - `src/services` (Discord bot services, message caching, content detection)
  - `src/flows` (AI/Genkit flows and schemas)
  - `src/games` (split by game if needed: `src/games/ai-uprising`, `src/games/geo-guesser`, etc.)
  - `src/utils` (utility functions and helpers)
  - `src/commands` (Discord slash commands)
  - `src/listeners` (Discord event listeners)
- This approach gets comprehensive symbol information without exceeding token limits

**Never**: Try to get all symbols from root directory - it will always exceed the 25k token limit

## Comprehensive Documentation References

**CRITICAL**: This codebase has extensive documentation in the `AI_FILES/` folder. Always reference these guides when working with the corresponding systems:

### Core Architecture Documentation
- **AI_FILES/message-routing-system.md** - Complete message routing architecture, AI-powered intent classification, and flow orchestration
- **AI_FILES/flow-orchestration-architecture.md** - Flow routing, decision trees, and AI flow integration patterns
- **AI_FILES/content-detection-multimodal-guide.md** - Attachment processing, media handling, and content analysis
- **AI_FILES/message-cache-context-system.md** - Sliding window cache, context management, and database patterns
- **AI_FILES/auth-security-patterns.md** - Operator hierarchy, whitelist systems, and security implementation
- **AI_FILES/discord-integration-guide.md** - Discord.js patterns, streaming responses, and interaction handling
- **AI_FILES/ai-genkit-integration-guide.md** - Structured schemas, Gemini API compatibility, and flow best practices

### When to Reference Documentation
**ALWAYS consult the relevant AI_FILES documentation** when:
- Understanding or modifying message routing logic (`message-routing-system.md`)
- Working with Flow routing or content analysis (`flow-orchestration-architecture.md`)
- Processing attachments or media content (`content-detection-multimodal-guide.md`)  
- Implementing message caching or context features (`message-cache-context-system.md`)
- Adding authentication or security features (`auth-security-patterns.md`)
- Debugging Discord integration issues (`discord-integration-guide.md`)
- Creating new AI flows or schemas (`ai-genkit-integration-guide.md`)

**These documents contain 500+ lines each** with detailed implementation patterns, troubleshooting guides, code examples, and architectural decisions that are essential for proper development.

## Memories
- The user must always handle any testing that requires starting the app
- Whenever you want to use code context provider in the workspace, you must specify a sub-folder, the highest level would be src. Doing it at the root level will always exceed the tools output limits
- Whenever using the library docs researcher sub-agent always remind it and yourself, the cache exists at AI_CODE. It can NEVER be stored anywhere else or this will break the workflow
- **NEVER delete working utility scripts**: Keep valuable tools like `generate-locations-smart.js` for future database expansion