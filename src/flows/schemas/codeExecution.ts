/**
 * @fileoverview Zod schemas for code execution flow type safety and validation.
 * 
 * Defines comprehensive type schemas for the code execution flow including
 * input validation, output structure, and error handling. These schemas ensure
 * type safety throughout the code execution pipeline and provide runtime
 * validation for all data flowing through the system.
 * 
 * Schema Categories:
 * - CodeExecutionInput: User message with optional metadata for code execution
 * - CodeExecutionOutput: Complete execution results with code, results, and metadata
 * - CodeExecutionError: Structured error handling with user-friendly messages
 * 
 * Key Features:
 * - Message length validation (max 4000 characters input, 1950 output for Discord)
 * - Optional metadata fields for tracking and analytics
 * - Structured error categorization for proper user feedback
 * - Type inference for TypeScript integration throughout the application
 * 
 * These schemas integrate with Genkit flows to provide structured input/output
 * validation and ensure reliable code execution functionality.
 */

import { z } from 'zod';

// Code execution input schema
export const CodeExecutionInputSchema = z.object({
  message: z.string().min(1, 'Message cannot be empty').max(4000, 'Message too long'),
  userId: z.string().optional(),
  channelId: z.string().optional(),
});

export type CodeExecutionInput = z.infer<typeof CodeExecutionInputSchema>;

// Code execution output schema  
export const CodeExecutionOutputSchema = z.object({
  response: z.string().max(1950), // Discord message limit with buffer
  hasCode: z.boolean(),
  executableCode: z.string().optional(),
  codeLanguage: z.string().optional(),
  executionResult: z.string().optional(),
  timestamp: z.string(),
  model: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

export type CodeExecutionOutput = z.infer<typeof CodeExecutionOutputSchema>;

// Code execution error types
export const CodeExecutionErrorSchema = z.object({
  type: z.enum(['TIMEOUT', 'QUOTA_EXCEEDED', 'SAFETY_ERROR', 'EXECUTION_ERROR', 'UNKNOWN']),
  message: z.string(),
  userMessage: z.string(),
  originalError: z.unknown().optional(),
});

export type CodeExecutionError = z.infer<typeof CodeExecutionErrorSchema>;