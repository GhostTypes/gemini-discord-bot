/**
 * @fileoverview Zod schemas for game flow input/output validation and type safety.
 * 
 * Provides structured validation schemas for the game management system,
 * ensuring type safety and proper data validation for all game operations.
 * These schemas support the GameManager and game flow coordination with
 * comprehensive input/output validation.
 * 
 * Schema Categories:
 * - GameActionInput: Player actions with channel, user, and action payload
 * - GameActionOutput: Action processing results with success status and effects
 * - GameStartInput: Game initialization parameters with host and game type
 * - GameStartOutput: Game startup results with initialization status and effects
 * 
 * Key Features:
 * - Flexible action type enumeration supporting multiple game types
 * - Success/failure result patterns for consistent error handling
 * - Effects array for Discord integration (messages, embeds, interactions)
 * - Type inference for seamless TypeScript integration
 * 
 * These schemas ensure reliable game state management and consistent
 * data flow between Discord interactions and game logic processing.
 */

import { z } from 'zod';

export const GameActionInputSchema = z.object({
  channelId: z.string(),
  userId: z.string(),
  action: z.object({
    type: z.enum(['SUBMIT', 'JOIN', 'LEAVE', 'HINT', 'QUIT']),
    payload: z.any().optional(),
  }),
});

export const GameActionOutputSchema = z.object({
  success: z.boolean(),
  message: z.string().optional(),
  effects: z.array(z.any()).optional(),
});

export const GameStartInputSchema = z.object({
  channelId: z.string(),
  gameType: z.string(),
  hostId: z.string(),
});

export const GameStartOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  effects: z.array(z.any()).optional(),
});

export type GameActionInput = z.infer<typeof GameActionInputSchema>;
export type GameActionOutput = z.infer<typeof GameActionOutputSchema>;
export type GameStartInput = z.infer<typeof GameStartInputSchema>;
export type GameStartOutput = z.infer<typeof GameStartOutputSchema>;