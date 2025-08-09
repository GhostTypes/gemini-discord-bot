/**
 * @fileoverview Central export hub for all Zod schema definitions used in Genkit AI flows.
 * 
 * This barrel file provides a single import point for all structured schema definitions
 * that ensure type safety and validation across the Discord bot's AI integration system.
 * All schemas are designed to be compatible with Gemini API's OpenAPI 3.0 format requirements,
 * avoiding problematic Zod features like `exclusiveMinimum`, `const`, and complex unions.
 * 
 * Exported Schema Categories:
 * - Routing schemas: Message routing and flow orchestration validation
 * - Image generation schemas: DALL-E and image processing flow inputs/outputs
 * - Code execution schemas: Code analysis and execution flow validation
 * - Web context schemas: URL processing and web content analysis structures
 * - Game schemas: Game flow validation and structured game data definitions
 * 
 * These schemas are critical for maintaining data integrity between Discord message
 * processing and Genkit AI flows, ensuring all AI-generated content follows
 * predictable, type-safe structures that can be reliably processed by the bot.
 */

// Export all schemas
export * from './routing.js';
export * from './imageGeneration.js';
export * from './codeExecution.js';
export * from './webContext.js';
export * from './game.js';