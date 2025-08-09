/**
 * @fileoverview Zod schemas for AI routing flow intent classification and decision making.
 * 
 * Defines structured schemas for intelligent message routing based on user intent
 * classification. These schemas enable the AI routing system to analyze user
 * messages and determine the most appropriate specialized flow for processing.
 * 
 * Schema Categories:
 * - UserIntentSchema: Enumeration of all supported bot intents and capabilities
 * - RoutingDecisionInput: Message analysis input with context and metadata
 * - RoutingDecisionOutput: Intent classification results with reasoning and entities
 * 
 * Supported Intent Categories:
 * - CONVERSATION: General chat and conversation interactions
 * - IMAGE_GENERATION: Artistic image creation and visual content requests
 * - CODE_EXECUTION: Programming tasks and code analysis requests
 * - SEARCH_GROUNDING: Web search and real-time information retrieval
 * - URL_CONTEXT: Web page analysis and content extraction
 * - GAME_*: Game-specific intents for game management and gameplay
 * - AUTH_*: Authentication and authorization management intents
 * 
 * Key Features:
 * - Comprehensive intent enumeration covering all bot capabilities
 * - Context-aware routing with game mode and conversation history
 * - Entity extraction for game types, actions, and payload data
 * - Reasoning output for routing decision transparency and debugging
 * 
 * These schemas ensure consistent and reliable intent classification for
 * intelligent message routing throughout the Discord bot system.
 */

import { z } from 'zod';

// User intent enum - All available bot intents
export const UserIntentSchema = z.enum([
  'CONVERSATION',
  'IMAGE_GENERATION', 
  'CODE_EXECUTION',
  'SEARCH_GROUNDING',
  'URL_CONTEXT',
  'GAME_START',
  'GAME_ACTION',
  'GAME_QUIT',
  'GAME_HELP',
  'AUTH',
]);

export type UserIntent = z.infer<typeof UserIntentSchema>;

// Routing decision input schema
export const RoutingDecisionInputSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  userId: z.string().optional(),
  channelId: z.string().optional(),
  isInGameMode: z.boolean().optional(),
  currentGameType: z.string().optional(),
  conversationContext: z.string().optional(),
});

export type RoutingDecisionInput = z.infer<typeof RoutingDecisionInputSchema>;

// Routing decision output schema
export const RoutingDecisionOutputSchema = z.object({
  intent: UserIntentSchema,
  reasoning: z.string().optional(),
  entities: z.object({
    gameType: z.string().optional(),
    gameAction: z.string().optional(),
    payload: z.any().optional(),
  }).optional(),
});

export type RoutingDecisionOutput = z.infer<typeof RoutingDecisionOutputSchema>;