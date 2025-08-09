/**
 * @fileoverview Zod schemas for image generation flow validation and type safety.
 * 
 * Defines comprehensive schemas for AI-powered image generation including
 * natural language request parsing and structured image generation parameters.
 * These schemas ensure type safety and proper validation throughout the
 * image generation pipeline from user request to final output.
 * 
 * Schema Categories:
 * - ImageGenerationInput: Direct image generation with prompt and style
 * - ImageGenerationOutput: Generated image data with metadata and timestamps
 * - ImageRequestParsingInput: Natural language image requests for parsing
 * - ImageRequestParsingOutput: Structured prompts extracted from natural language
 * 
 * Key Features:
 * - Natural language to structured prompt conversion support
 * - Style parameter validation for artistic control
 * - Data URL output format compatible with Discord attachments
 * - Comprehensive metadata tracking for analytics and debugging
 * - User and channel context preservation for moderation and tracking
 * 
 * The schemas support the two-phase image generation process: request parsing
 * followed by actual image generation using Google's Imagen model.
 */

import { z } from 'zod';

// Image generation input schema
export const ImageGenerationInputSchema = z.object({
  prompt: z.string().min(1, 'Prompt cannot be empty'),
  style: z.string().optional(),
  userId: z.string().optional(),
  channelId: z.string().optional(),
});

export type ImageGenerationInput = z.infer<typeof ImageGenerationInputSchema>;

// Image generation output schema
export const ImageGenerationOutputSchema = z.object({
  dataUrl: z.string(),
  timestamp: z.string(),
  model: z.string(),
  metadata: z.object({
    userId: z.string().optional(),
    channelId: z.string().optional(),
    prompt: z.string(),
    style: z.string().optional(),
  }),
});

export type ImageGenerationOutput = z.infer<typeof ImageGenerationOutputSchema>;

// Image request parsing schemas (for natural language to structured prompt)
export const ImageRequestParsingInputSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty'),
  userId: z.string().optional(),
  channelId: z.string().optional(),
});

export type ImageRequestParsingInput = z.infer<typeof ImageRequestParsingInputSchema>;

export const ImageRequestParsingOutputSchema = z.object({
  prompt: z.string(),
  style: z.string().optional(),
  success: z.boolean(),
  reasoning: z.string().optional(),
});

export type ImageRequestParsingOutput = z.infer<typeof ImageRequestParsingOutputSchema>;